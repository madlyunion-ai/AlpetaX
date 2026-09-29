import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { rangeFor } from '@/lib/schedule-core/range';
import { isLate } from '@/lib/schedule-core/workload';
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

  const range = rangeFor(view, anchor, scale);

  /*
   * 로드맵만 전체를 가져온다.
   *
   * 트리의 줄(프로젝트 × 업무구분)은 "무엇이 등록돼 있나" 를 말하는 것이지
   * "이 기간에 무엇이 있나" 가 아니다. 기간으로 거른 목록으로 줄을 만들면,
   * 기간을 옮겼을 때 줄이 사라져 등록해 둔 일이 없어진 것처럼 보인다.
   * 축과 막대는 그대로 기간을 따른다.
   */
  const wideRange = { start: new Date('1970-01-01T00:00:00Z'), end: new Date('2100-01-01T00:00:00Z') };
  const fetchRange = view === 'roadmap' ? wideRange : range;

  const [{ data: members }, { data: teams }, { data: phases }, { data: projects }, { data: me }] =
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
      .from('memberships')
      .select('id, workspace_id, user_id, role, display_name, email, display_as, avatar_url')
      .eq('workspace_id', workspace.id)
      .eq('user_id', user.id)
      .maybeSingle<Membership>(),
    ]);

  // 다섯 뷰가 전부 이 함수 하나를 부른다
  const { data: schedulesRaw, error: schedErr } = await supabase.rpc('schedules_in_range', {
    ws: workspace.id,
    from_ts: fetchRange.start.toISOString(),
    to_ts: fetchRange.end.toISOString(),
    project_ids: filters.projectIds,
    team_ids: filters.teamIds,
    assignee_ids: filters.assigneeIds,
    phase_ids: filters.phaseIds,
  });
  // 로드맵에 넘기는 전체 목록. 다른 뷰에서는 이미 기간으로 걸러져 온 것과 같다.
  const allSchedules = (schedulesRaw ?? []) as Schedule[];

  /*
   * 화면의 나머지(하단 집계, 지연 건수, 다른 뷰)는 지금까지처럼 기간 안의
   * 것만 센다. 전체를 가져온 것은 로드맵 트리 때문이지, 집계 기준을 바꾸려는
   * 것이 아니다.
   */
  const schedules =
    view === 'roadmap'
      ? allSchedules.filter(
          (s) => new Date(s.end_at) >= range.start && new Date(s.start_at) <= range.end,
        )
      : allSchedules;

  /*
   * 지연 강조 켜기/끄기. 항목을 감추지 않는다 — 끄면 지연된 일도 다른 일과
   * 같은 색(업무구분·팀 색)으로 보인다. 목록에서 사라지지 않으므로
   * "몇 건이 빠졌나" 를 따질 필요가 없다.
   * 다른 뷰 상태와 마찬가지로 URL 이 기억한다.
   */
  const markLate = one('late') !== 'off';
  const lateCount = schedules.filter((s) => isLate(s, new Date())).length;

  const { data: milestones } = await supabase
    .from('milestones')
    .select('id, workspace_id, project_id, title, description, due_on, status')
    .eq('workspace_id', workspace.id)
    .order('due_on')
    .returns<Milestone[]>();

  const ids = schedules.map((s) => s.id);
  const { data: assignees } = ids.length
    ? await supabase.from('schedule_assignees').select('schedule_id, membership_id').in('schedule_id', ids)
    : { data: [] as { schedule_id: string; membership_id: string }[] };

  const { data: deps } = ids.length
    ? await supabase
        .from('schedule_dependencies')
        .select('predecessor_id, successor_id, type')
        .in('predecessor_id', ids)
        .returns<Dependency[]>()
    : { data: [] as Dependency[] };

  return (
    <Shell
      workspace={workspace}
      me={me ?? null}
      members={members ?? []}
      teams={teams ?? []}
      phases={phases ?? []}
      projects={projects ?? []}
      schedules={schedules}
      allSchedules={allSchedules}
      milestones={milestones ?? []}
      assignees={assignees ?? []}
      dependencies={deps ?? []}
      view={view}
      scale={scale}
      anchorIso={anchor.toISOString()}
      selectedId={selectedId}
      filters={filters}
      markLate={markLate}
      lateCount={lateCount}
      loadError={schedErr?.message ?? null}
    />
  );
}
