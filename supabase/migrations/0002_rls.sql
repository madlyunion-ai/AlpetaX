-- TeamSync 0002 — Row Level Security
--
-- 원칙: 모든 테이블이 workspace_id 를 들고, 판별 함수 두 개로 접근을 통일한다.
-- 두 함수는 security definer 이므로 memberships 자신의 RLS 를 재귀 호출하지 않는다.

create or replace function auth_workspace_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select workspace_id from memberships where user_id = auth.uid()
$$;

create or replace function auth_role(ws uuid)
returns member_role language sql stable security definer set search_path = public as $$
  select role from memberships where user_id = auth.uid() and workspace_id = ws
$$;

-- guest 가 볼 수 있는 프로젝트 집합
create or replace function auth_guest_project_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select pg.project_id
  from project_guests pg
  join memberships m on m.id = pg.membership_id
  where m.user_id = auth.uid()
$$;

alter table workspaces            enable row level security;
alter table memberships           enable row level security;
alter table teams                 enable row level security;
alter table team_members          enable row level security;
alter table projects              enable row level security;
alter table schedules             enable row level security;
alter table schedule_assignees    enable row level security;
alter table schedule_dependencies enable row level security;
alter table milestones            enable row level security;
alter table comments              enable row level security;
alter table project_guests        enable row level security;

-- ── workspaces ────────────────────────────────────────────────────────
drop policy if exists ws_read on workspaces;
create policy ws_read on workspaces for select
  using (id in (select auth_workspace_ids()));

drop policy if exists ws_update on workspaces;
create policy ws_update on workspaces for update
  using (auth_role(id) in ('owner','admin'));

drop policy if exists ws_delete on workspaces;
create policy ws_delete on workspaces for delete
  using (auth_role(id) = 'owner');

-- 생성은 create_workspace() RPC 로만 (0003). 직접 insert 는 막는다.

-- ── memberships ───────────────────────────────────────────────────────
drop policy if exists mb_read on memberships;
create policy mb_read on memberships for select
  using (workspace_id in (select auth_workspace_ids()));

drop policy if exists mb_write on memberships;
create policy mb_write on memberships for insert
  with check (auth_role(workspace_id) in ('owner','admin'));

drop policy if exists mb_update on memberships;
create policy mb_update on memberships for update
  using (auth_role(workspace_id) in ('owner','admin') or user_id = auth.uid());

drop policy if exists mb_delete on memberships;
create policy mb_delete on memberships for delete
  using (auth_role(workspace_id) in ('owner','admin'));

-- ── teams / projects / milestones: 같은 4정책 형태 ────────────────────
drop policy if exists tm_read on teams;
create policy tm_read on teams for select
  using (workspace_id in (select auth_workspace_ids()));
drop policy if exists tm_write on teams;
create policy tm_write on teams for insert
  with check (auth_role(workspace_id) in ('owner','admin'));
drop policy if exists tm_update on teams;
create policy tm_update on teams for update
  using (auth_role(workspace_id) in ('owner','admin'));
drop policy if exists tm_delete on teams;
create policy tm_delete on teams for delete
  using (auth_role(workspace_id) in ('owner','admin'));

drop policy if exists pj_read on projects;
create policy pj_read on projects for select
  using (
    workspace_id in (select auth_workspace_ids())
    and (auth_role(workspace_id) <> 'guest' or id in (select auth_guest_project_ids()))
  );
drop policy if exists pj_write on projects;
create policy pj_write on projects for insert
  with check (auth_role(workspace_id) in ('owner','admin','member'));
drop policy if exists pj_update on projects;
create policy pj_update on projects for update
  using (auth_role(workspace_id) in ('owner','admin','member'));
drop policy if exists pj_delete on projects;
create policy pj_delete on projects for delete
  using (auth_role(workspace_id) in ('owner','admin'));

drop policy if exists ms_read on milestones;
create policy ms_read on milestones for select
  using (
    workspace_id in (select auth_workspace_ids())
    and (auth_role(workspace_id) <> 'guest' or project_id in (select auth_guest_project_ids()))
  );
drop policy if exists ms_write on milestones;
create policy ms_write on milestones for insert
  with check (workspace_id in (select auth_workspace_ids()) and auth_role(workspace_id) <> 'guest');
drop policy if exists ms_update on milestones;
create policy ms_update on milestones for update
  using (workspace_id in (select auth_workspace_ids()) and auth_role(workspace_id) <> 'guest');
drop policy if exists ms_delete on milestones;
create policy ms_delete on milestones for delete
  using (workspace_id in (select auth_workspace_ids()) and auth_role(workspace_id) <> 'guest');

-- ── schedules ─────────────────────────────────────────────────────────
-- 읽기: 같은 워크스페이스면 전부 보인다(팀 일정 공유가 제품의 목적). guest 만 좁힌다.
drop policy if exists sc_read on schedules;
create policy sc_read on schedules for select
  using (
    workspace_id in (select auth_workspace_ids())
    and (
      auth_role(workspace_id) <> 'guest'
      or project_id in (select auth_guest_project_ids())
    )
  );

drop policy if exists sc_write on schedules;
create policy sc_write on schedules for insert
  with check (
    workspace_id in (select auth_workspace_ids())
    and auth_role(workspace_id) <> 'guest'
    and created_by = auth.uid()
  );

drop policy if exists sc_update on schedules;
create policy sc_update on schedules for update
  using (workspace_id in (select auth_workspace_ids()) and auth_role(workspace_id) <> 'guest');

drop policy if exists sc_delete on schedules;
create policy sc_delete on schedules for delete
  using (
    workspace_id in (select auth_workspace_ids())
    and (auth_role(workspace_id) in ('owner','admin') or created_by = auth.uid())
  );

-- ── 조인 테이블: 부모 행의 workspace 로 판정 ──────────────────────────
drop policy if exists sa_all on schedule_assignees;
create policy sa_all on schedule_assignees for all
  using (exists (
    select 1 from schedules s
    where s.id = schedule_id and s.workspace_id in (select auth_workspace_ids())
  ))
  with check (exists (
    select 1 from schedules s
    where s.id = schedule_id
      and s.workspace_id in (select auth_workspace_ids())
      and auth_role(s.workspace_id) <> 'guest'
  ));

drop policy if exists sd_all on schedule_dependencies;
create policy sd_all on schedule_dependencies for all
  using (exists (
    select 1 from schedules s
    where s.id = predecessor_id and s.workspace_id in (select auth_workspace_ids())
  ))
  with check (exists (
    select 1 from schedules a join schedules b on b.id = successor_id
    where a.id = predecessor_id
      and a.workspace_id = b.workspace_id
      and a.workspace_id in (select auth_workspace_ids())
      and auth_role(a.workspace_id) <> 'guest'
  ));

drop policy if exists tmm_all on team_members;
create policy tmm_all on team_members for all
  using (exists (
    select 1 from teams t
    where t.id = team_id and t.workspace_id in (select auth_workspace_ids())
  ))
  with check (exists (
    select 1 from teams t
    where t.id = team_id and auth_role(t.workspace_id) in ('owner','admin')
  ));

drop policy if exists pg_all on project_guests;
create policy pg_all on project_guests for all
  using (exists (
    select 1 from projects p
    where p.id = project_id and p.workspace_id in (select auth_workspace_ids())
  ))
  with check (exists (
    select 1 from projects p
    where p.id = project_id and auth_role(p.workspace_id) in ('owner','admin')
  ));

-- ── comments ──────────────────────────────────────────────────────────
drop policy if exists cm_read on comments;
create policy cm_read on comments for select
  using (workspace_id in (select auth_workspace_ids()));
drop policy if exists cm_write on comments;
create policy cm_write on comments for insert
  with check (
    workspace_id in (select auth_workspace_ids())
    and auth_role(workspace_id) <> 'guest'
    and author_id = auth.uid()
  );
drop policy if exists cm_delete on comments;
create policy cm_delete on comments for delete
  using (author_id = auth.uid() or auth_role(workspace_id) in ('owner','admin'));
