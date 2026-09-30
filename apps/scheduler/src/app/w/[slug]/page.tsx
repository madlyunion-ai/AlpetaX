import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type {
  Membership,
  Milestone,
  Project,
  Schedule,
  Team,
  TimeScale,
  ViewKind,
  Workspace,
  Dependency,
  Phase,
} from '@/lib/schedule-core/types';
import { Shell } from './shell';

export const dynamic = 'force-dynamic';

const VIEWS: ViewKind[] = ['roadmap', 'month', 'week', 'day', 'timeline', 'milestone', 'workload'];
const SCALES: TimeScale[] = ['day', 'week', 'month', 'quarter'];

/**
 * 축척을 고르지 않았을 때의 기본값.
 * 로드맵·담당자별은 '작게'(month) — 연 단위 전체 그림이 한 화면에 들어온다.
 * 타임라인은 일정 하나하나를 보는 화면이라 더 촘촘한 '주'가 맞다.
 */
const DEFAULT_SCALE: Record<ViewKind, TimeScale> = {
  roadmap: 'month',
  workload: 'month',
  timeline: 'week',
  month: 'week',
  week: 'week',
  day: 'week',
  milestone: 'week',
};

/**
 * 사이드바 필터 값을 읽는다. 사이드바의 nextValue() 와 짝이다.
 *   키 없음 → null  = 필터 없음(전부)
 *   "-"     → []    = 전부 해제. 빈 배열은 RPC 에서 any('{}') 이 되어 한 건도 맞지 않는다.
 */
function parseList(v: string | undefined): string[] | null {
  if (!v) return null;
  if (v === '-') return [];
  const list = v.split(',').filter(Boolean);
  return list.length ? list : null;
}

export default async function WorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id, name, slug, plan')
    .eq('slug', slug)
    .maybeSingle<Workspace>();
  if (!workspace) notFound();

  // ── URL 이 뷰 상태의 단일 진실 공급원 ────────────────────────────
  // 첫 화면은 로드맵 — 연/월 단위 전체 그림을 먼저 보여준다
  const view = (VIEWS.includes(one('view') as ViewKind) ? one('view') : 'roadmap') as ViewKind;
  const scale = (
    SCALES.includes(one('scale') as TimeScale) ? one('scale') : DEFAULT_SCALE[view]
  ) as TimeScale;
  const anchorRaw = one('anchor');
  const anchor = anchorRaw && !Number.isNaN(Date.parse(anchorRaw)) ? new Date(anchorRaw) : new Date();
  const selectedId = one('sel') ?? null;

  const filters = {
    projectIds: parseList(one('projects')),
    teamIds: parseList(one('teams')),
    phaseIds: parseList(one('phases')),
    assigneeIds: parseList(one('assignees')),
  };


  /*
   * 일정은 기간·필터로 거르지 않고 한 번에 다 읽는다.
   *
   * 탭을 바꾸거나 필터를 켜거나 상세 창을 닫는 것은 데이터를 바꾸지 않는다.
   * 보여 주는 것만 달라진다. 그런데 그 조건을 질의에 넣어 두면 화면을 만질
   * 때마다 서버를 거쳐야 하고, 왕복 다섯 번이 매번 쌓인다.
   *
   * 다 읽어 두면 그 뒤로는 브라우저 안에서 끝난다. 서버는 데이터가 실제로
   * 바뀔 때만 — 즉 저장·수정·삭제에만 — 다시 일한다.
   *
   * 지금 규모(수십 건)에서는 다 읽는 편이 오히려 싸다. 수천 건이 되면
   * 이 판단을 다시 해야 한다.
   */
  const fetchRange = { start: new Date('1970-01-01T00:00:00Z'), end: new Date('2100-01-01T00:00:00Z') };

  /*
   * 한 번에 보낼 수 있는 것은 한 번에 보낸다.
   *
   * 서버 컴포넌트에서 await 를 줄줄이 세우면 그 수만큼 DB 왕복이 직렬로
   * 쌓인다. 여기 있는 다섯 가지는 서로를 기다릴 이유가 없다.
   *
   * '나'를 따로 묻지 않는 이유: 멤버 목록에 이미 들어 있다. 같은 표를 두 번
   * 읽는 대신 받아 온 배열에서 고른다.
   */
  const [{ data: members }, { data: teams }, { data: phases }, { data: projects }, { data: milestones }] =
    await Promise.all([
    supabase
      .from('memberships')
      .select('id, workspace_id, user_id, role, display_name, email, display_as, avatar_url')
      .eq('workspace_id', workspace.id)
      .order('created_at')
      .returns<Membership[]>(),
    supabase
      .from('teams')
      .select('id, workspace_id, name, color')
      .eq('workspace_id', workspace.id)
      .order('name')
      .returns<Team[]>(),
    supabase
      .from('phases')
      .select('id, workspace_id, name, color, sort_order')
      .eq('workspace_id', workspace.id)
      .order('sort_order')
      .returns<Phase[]>(),
    supabase
      .from('projects')
      .select('id, workspace_id, name, description, starts_on, ends_on, archived_at, color')
      .eq('workspace_id', workspace.id)
      .is('archived_at', null)
      .order('created_at')
      .returns<Project[]>(),
    supabase
      .from('milestones')
      .select('id, workspace_id, project_id, title, description, due_on, status')
      .eq('workspace_id', workspace.id)
      .order('due_on')
      .returns<Milestone[]>(),
    ]);

  // 목록에 이미 있는 것을 다시 묻지 않는다
  const me = (members ?? []).find((m) => m.user_id === user.id) ?? null;

  // 다섯 뷰가 전부 이 함수 하나를 부른다
  const { data: schedulesRaw, error: schedErr } = await supabase.rpc('schedules_in_range', {
    ws: workspace.id,
    from_ts: fetchRange.start.toISOString(),
    to_ts: fetchRange.end.toISOString(),
    // 거르지 않는다 — 필터는 브라우저에서 건다
    project_ids: null,
    team_ids: null,
    assignee_ids: null,
    phase_ids: null,
  });
  const allSchedules = (schedulesRaw ?? []) as Schedule[];

  /*
   * 담당자와 의존성은 일정 id 가 나와야 물을 수 있지만, 서로는 기다릴 필요가
   * 없다. 줄줄이 await 하면 왕복이 두 번 쌓인다.
   */
  const ids = allSchedules.map((s) => s.id);
  const [{ data: assignees }, { data: deps }] = ids.length
    ? await Promise.all([
        supabase.from('schedule_assignees').select('schedule_id, membership_id').in('schedule_id', ids),
        supabase
          .from('schedule_dependencies')
          .select('predecessor_id, successor_id, type')
          .in('predecessor_id', ids)
          .returns<Dependency[]>(),
      ])
    : [
        { data: [] as { schedule_id: string; membership_id: string }[] },
        { data: [] as Dependency[] },
      ];

  return (
    <Shell
      workspace={workspace}
      me={me}
      members={members ?? []}
      teams={teams ?? []}
      phases={phases ?? []}
      projects={projects ?? []}
      schedules={allSchedules}
      milestones={milestones ?? []}
      assignees={assignees ?? []}
      dependencies={deps ?? []}
      view={view}
      scale={scale}
      anchorIso={anchor.toISOString()}
      selectedId={selectedId}
      filters={filters}
      markLate={one('late') !== 'off'}
      loadError={schedErr?.message ?? null}
    />
  );
}
