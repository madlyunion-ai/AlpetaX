-- TeamSync 0001 — 스키마
-- 적용: Supabase 대시보드 → SQL Editor 에 이 파일 전체를 붙여넣고 실행
--       또는 supabase db push

create extension if not exists "pgcrypto";
create extension if not exists btree_gist;

-- ── 열거형 ────────────────────────────────────────────────────────────
do $$ begin
  create type member_role      as enum ('owner','admin','member','guest');
exception when duplicate_object then null; end $$;
do $$ begin
  create type horizon          as enum ('long','mid','short');
exception when duplicate_object then null; end $$;
do $$ begin
  create type sched_status     as enum ('planned','active','blocked','done','cancelled');
exception when duplicate_object then null; end $$;
do $$ begin
  create type dep_type         as enum ('finish_to_start','start_to_start','finish_to_finish');
exception when duplicate_object then null; end $$;
do $$ begin
  create type milestone_status as enum ('upcoming','reached','missed');
exception when duplicate_object then null; end $$;

-- ── 테넌시 ────────────────────────────────────────────────────────────
create table if not exists workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  plan        text not null default 'free' check (plan in ('free','pro','business')),
  created_by  uuid not null references auth.users on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists memberships (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces on delete cascade,
  user_id       uuid not null references auth.users on delete cascade,
  role          member_role not null default 'member',
  display_name  text,
  avatar_url    text,
  created_at    timestamptz not null default now(),
  unique (workspace_id, user_id)
);
create index if not exists memberships_user_idx on memberships (user_id);

create table if not exists teams (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces on delete cascade,
  name          text not null,
  -- 캘린더/간트에서 일정 색을 결정하는 단일 출처
  color         text not null default '#5B8DEF',
  created_at    timestamptz not null default now(),
  unique (workspace_id, name)
);

create table if not exists team_members (
  team_id       uuid not null references teams on delete cascade,
  membership_id uuid not null references memberships on delete cascade,
  primary key (team_id, membership_id)
);

-- ── 일정 도메인 ───────────────────────────────────────────────────────
create table if not exists projects (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces on delete cascade,
  name          text not null,
  description   text,
  starts_on     date,
  ends_on       date,
  archived_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists projects_ws_idx on projects (workspace_id);

create table if not exists schedules (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references workspaces on delete cascade,
  project_id     uuid references projects on delete set null,
  team_id        uuid references teams on delete set null,
  parent_id      uuid references schedules on delete cascade,
  title          text not null,
  description    text,
  start_at       timestamptz not null,
  end_at         timestamptz not null,
  all_day        boolean not null default true,
  horizon        horizon not null default 'short',
  -- 사용자가 horizon 을 직접 고르면 true. 기간이 바뀌어도 재추론하지 않는다
  horizon_locked boolean not null default false,
  status         sched_status not null default 'planned',
  progress       smallint not null default 0 check (progress between 0 and 100),
  sort_order     double precision not null default 0,
  created_by     uuid not null references auth.users,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint schedules_range_valid check (end_at >= start_at)
);

-- 월/주/일/타임라인 질의는 전부 "이 구간과 겹치는 일정"이다 → GiST 범위 인덱스
create index if not exists schedules_span_idx on schedules
  using gist (workspace_id, tstzrange(start_at, end_at, '[]'));
create index if not exists schedules_project_idx on schedules (project_id, start_at);
create index if not exists schedules_team_idx    on schedules (team_id, start_at);

create table if not exists schedule_assignees (
  schedule_id   uuid not null references schedules on delete cascade,
  membership_id uuid not null references memberships on delete cascade,
  primary key (schedule_id, membership_id)
);
create index if not exists schedule_assignees_m_idx on schedule_assignees (membership_id);

create table if not exists schedule_dependencies (
  predecessor_id uuid not null references schedules on delete cascade,
  successor_id   uuid not null references schedules on delete cascade,
  type           dep_type not null default 'finish_to_start',
  primary key (predecessor_id, successor_id),
  constraint no_self_dep check (predecessor_id <> successor_id)
);

create table if not exists milestones (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  project_id   uuid not null references projects on delete cascade,
  title        text not null,
  description  text,
  due_on       date not null,
  status       milestone_status not null default 'upcoming',
  created_at   timestamptz not null default now()
);
create index if not exists milestones_due_idx on milestones (workspace_id, due_on);

create table if not exists comments (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces on delete cascade,
  schedule_id  uuid not null references schedules on delete cascade,
  author_id    uuid not null references auth.users,
  body         text not null,
  created_at   timestamptz not null default now()
);
create index if not exists comments_schedule_idx on comments (schedule_id, created_at);

-- guest 는 초대된 프로젝트만 본다
create table if not exists project_guests (
  project_id    uuid not null references projects on delete cascade,
  membership_id uuid not null references memberships on delete cascade,
  primary key (project_id, membership_id)
);

-- ── updated_at 자동 갱신 ──────────────────────────────────────────────
create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists schedules_touch on schedules;
create trigger schedules_touch before update on schedules
  for each row execute function touch_updated_at();

-- ── 의존성 순환 차단 ──────────────────────────────────────────────────
-- 새 간선을 넣기 전에 successor 에서 predecessor 로 가는 경로가 이미 있으면 순환이다
create or replace function reject_dependency_cycle() returns trigger
language plpgsql as $$
declare cyclic boolean;
begin
  with recursive reach(id) as (
    select new.successor_id
    union
    select d.successor_id from schedule_dependencies d join reach r on d.predecessor_id = r.id
  )
  select exists (select 1 from reach where id = new.predecessor_id) into cyclic;

  if cyclic then
    raise exception '순환 의존성입니다: 이 연결은 만들 수 없습니다.'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists deps_no_cycle on schedule_dependencies;
create trigger deps_no_cycle before insert or update on schedule_dependencies
  for each row execute function reject_dependency_cycle();
