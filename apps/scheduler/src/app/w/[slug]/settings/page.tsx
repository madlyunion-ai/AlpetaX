import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Membership, Phase, Project, Team, Workspace } from '@/lib/schedule-core/types';
import { SHARE_COLUMNS, type ShareLink } from '@/lib/share/share-core';
import { SettingsClient, type AccessRequest, type Invitation, type ShareRow } from './settings-client';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

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

  const [{ data: members }, { data: teams }, { data: phases }, { data: projects }] = await Promise.all([
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
      .order('created_at')
      .returns<Project[]>(),
  ]);

  const me = (members ?? []).find((m) => m.user_id === user.id) ?? null;
  const canManage = me?.role === 'owner' || me?.role === 'admin';

  // 팀 구성원과 초대는 관리자만 읽을 수 있다(RLS). 일반 멤버에겐 빈 배열이 온다.
  const { data: teamMembers } = await supabase
    .from('team_members')
    .select('team_id, membership_id')
    .in('team_id', (teams ?? []).map((t) => t.id).length ? (teams ?? []).map((t) => t.id) : ['']);

  const { data: invitations } = canManage
    ? await supabase
        .from('invitations')
        .select('id, email, role, token, accepted_at, created_at')
        .eq('workspace_id', workspace.id)
        .order('created_at', { ascending: false })
        .returns<Invitation[]>()
    : { data: [] as Invitation[] };

  // RLS 가 관리자에게만 열어 주지만, 조회 자체를 걸러 두면 일반 멤버의 화면에서
  // 헛도는 요청이 하나 줄어든다.
  const { data: requests } = canManage
    ? await supabase
        .from('access_requests')
        .select('id, email, display_name, note, status, created_at, decided_at, decided_note')
        .eq('workspace_id', workspace.id)
        .order('created_at', { ascending: false })
        .returns<AccessRequest[]>()
    : { data: [] as AccessRequest[] };

  /*
   * 외부 공유는 따로 읽는다. 0011 마이그레이션 전이면 표가 없어 오류가 나는데,
   * 그 오류가 설정 화면 전체를 막으면 안 된다 — 이 탭만 안내를 띄운다.
   * 게스트는 공유 링크를 볼 수 없다(RLS).
   */
  const [sharesQ, flagQ] = me && me.role !== 'guest'
    ? await Promise.all([
        supabase
          .from('share_links')
          .select(`${SHARE_COLUMNS}, schedules(title)`)
          .eq('workspace_id', workspace.id)
          .order('created_at', { ascending: false }),
        supabase.from('workspaces').select('allow_external_share').eq('id', workspace.id).maybeSingle(),
      ])
    : [{ data: [], error: null }, { data: null, error: null }];
  const shares: ShareRow[] = ((sharesQ.data ?? []) as unknown as (ShareLink & { schedules: { title: string } | null })[]).map(
    ({ schedules, ...l }) => ({ ...l, schedule_title: schedules?.title ?? null }),
  );

  return (
    <SettingsClient
      shares={shares}
      sharesReady={!sharesQ.error && !flagQ.error}
      allowExternalShare={(flagQ.data as { allow_external_share?: boolean } | null)?.allow_external_share !== false}
      workspace={workspace}
      me={me}
      canManage={canManage}
      members={members ?? []}
      teams={teams ?? []}
      teamMembers={teamMembers ?? []}
      phases={phases ?? []}
      projects={projects ?? []}
      invitations={invitations ?? []}
      requests={requests ?? []}
    />
  );
}
