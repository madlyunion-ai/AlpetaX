-- ═══════════════════════════════════════════════════════════════════
--  외부 공유 — 읽기 전용 링크
--
--  TeamSync 계정이 없는 사람(고객사·협력사)에게 일정을 보여 준다.
--  두 가지를 공유할 수 있다.
--    schedule  일정 한 건
--    view      지금 보는 화면의 조건(기간 + 프로젝트·팀·업무구분·담당자 필터).
--              그때의 목록이 아니라 조건을 저장한다 — 조건에 맞는 일정이
--              바뀌면 링크를 연 쪽 화면도 따라 바뀐다.
--
--  원칙
--    · 바깥에서는 표를 직접 읽지 못한다. 열 수 있는 길은 open_share() 하나뿐이고,
--      그 함수가 만료·회수·비밀번호를 확인한 뒤 '켠 항목'만 골라 돌려준다.
--      감출 항목을 화면에서 가리는 것이 아니라 아예 보내지 않는다.
--    · 비밀번호 해시는 별도 표에 두고 정책을 주지 않는다. 같은 워크스페이스
--      멤버라도 읽을 수 없다.
--    · 워크스페이스 단위의 스위치(allow_external_share)를 끄면 이미 나간
--      링크까지 그 자리에서 닫힌다.
--
--  적용: node deploy/apply.mjs supabase/migrations/0011_share_links.sql
--        또는 Supabase SQL Editor 에 이 파일 전체를 붙여넣고 실행.
--  기존 표는 바꾸지 않고 더하기만 한다 — 적용 전에 배포된 앱도 그대로 돈다.
-- ═══════════════════════════════════════════════════════════════════

alter table workspaces add column if not exists allow_external_share boolean not null default true;

-- URL 에 그대로 쓰는 24자 난수. 순번·uuid 를 쓰지 않는 이유 — 추측할 수 없어야 한다.
-- pgcrypto 는 Supabase 에서 extensions 스키마에 있다. 경로에 넣어 두어야 찾는다.
create or replace function new_share_token()
returns text language sql volatile set search_path = public, extensions as $$
  select translate(rtrim(encode(gen_random_bytes(18), 'base64'), '='), '+/', '-_')
$$;

create table if not exists share_links (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references workspaces on delete cascade,
  token             text not null unique default new_share_token(),
  kind              text not null check (kind in ('schedule', 'view')),
  schedule_id       uuid references schedules on delete cascade,
  -- view 전용. 화면 이름과 조건 {from, to, project_ids, team_ids, phase_ids, assignee_ids}
  -- 목록 키가 null 이면 '전부', [] 이면 '아무것도' — 앱의 필터 규칙과 같다.
  title             text,
  filter            jsonb,
  scope             text not null default 'anyone' check (scope in ('anyone', 'password')),
  -- 외부에 보일 항목. 제목·기간·프로젝트는 늘 보인다.
  -- 담당자 이름과 설명은 기본으로 끈다 — 내부 정보가 실수로 나가지 않게.
  show_team         boolean not null default true,
  show_progress     boolean not null default true,
  show_assignees    boolean not null default false,
  show_description  boolean not null default false,
  expires_at        timestamptz,
  revoked_at        timestamptz,
  view_count        integer not null default 0,
  last_viewed_at    timestamptz,
  created_by        uuid not null default auth.uid() references auth.users on delete cascade,
  created_at        timestamptz not null default now(),
  constraint share_links_target check (
    (kind = 'schedule' and schedule_id is not null and filter is null)
    or (kind = 'view' and schedule_id is null and filter is not null and title is not null)
  )
);
create index if not exists share_links_ws_idx on share_links (workspace_id, created_at desc);
create index if not exists share_links_schedule_idx on share_links (schedule_id) where revoked_at is null;

create table if not exists share_link_secrets (
  link_id        uuid primary key references share_links on delete cascade,
  password_hash  text not null
);

-- ── 무결성: 대상은 같은 워크스페이스 안이어야 하고, 만든 뒤에는 바뀌지 않는다 ──
create or replace function share_links_check() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.workspace_id <> old.workspace_id
       or new.kind <> old.kind
       or new.schedule_id is distinct from old.schedule_id
       or new.created_by <> old.created_by then
      raise exception '공유 대상은 바꿀 수 없습니다. 새 링크를 만드세요.'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if not coalesce((select allow_external_share from workspaces where id = new.workspace_id), false) then
    raise exception '이 워크스페이스는 외부 공유가 꺼져 있습니다.' using errcode = 'insufficient_privilege';
  end if;
  if new.kind = 'schedule' and not exists (
    select 1 from schedules where id = new.schedule_id and workspace_id = new.workspace_id
  ) then
    raise exception '이 워크스페이스의 일정이 아닙니다.' using errcode = 'check_violation';
  end if;
  return new;
end $$;

-- 트리거 전용. API 로 직접 부를 이유가 없다.
revoke execute on function share_links_check() from public, anon, authenticated;

drop trigger if exists share_links_check on share_links;
create trigger share_links_check before insert or update on share_links
  for each row execute function share_links_check();

-- ── RLS ───────────────────────────────────────────────────────────────
alter table share_links        enable row level security;
alter table share_link_secrets enable row level security;
-- share_link_secrets 에는 정책을 두지 않는다 = 아래 함수 밖에서는 아무도 읽고 쓰지 못한다.

-- 게스트는 공유 링크를 보지도 만들지도 않는다. 자신에게 보이는 범위 밖으로
-- 내보낼 길이 생기기 때문이다.
drop policy if exists sl_read on share_links;
create policy sl_read on share_links for select
  using (workspace_id in (select auth_workspace_ids()) and auth_role(workspace_id) <> 'guest');

drop policy if exists sl_write on share_links;
create policy sl_write on share_links for insert
  with check (
    workspace_id in (select auth_workspace_ids())
    and auth_role(workspace_id) <> 'guest'
    and created_by = auth.uid()
  );

-- 고치고 지우는 것은 만든 사람 또는 관리자
drop policy if exists sl_update on share_links;
create policy sl_update on share_links for update
  using (
    workspace_id in (select auth_workspace_ids())
    and (created_by = auth.uid() or auth_role(workspace_id) in ('owner', 'admin'))
  );

drop policy if exists sl_delete on share_links;
create policy sl_delete on share_links for delete
  using (
    workspace_id in (select auth_workspace_ids())
    and (created_by = auth.uid() or auth_role(workspace_id) in ('owner', 'admin'))
  );

-- ── 비밀번호 ──────────────────────────────────────────────────────────
-- null 이면 지운다. 해시는 bcrypt — 원문은 어디에도 남지 않는다.
create or replace function set_share_password(link uuid, pw text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  l share_links;
begin
  select * into l from share_links where id = link;
  if l.id is null
     or l.workspace_id not in (select auth_workspace_ids())
     or not (l.created_by = auth.uid() or auth_role(l.workspace_id) in ('owner', 'admin')) then
    raise exception '이 링크를 바꿀 권한이 없습니다.' using errcode = 'insufficient_privilege';
  end if;

  if pw is null then
    delete from share_link_secrets where link_id = link;
    return;
  end if;
  if length(pw) < 4 then
    raise exception '비밀번호는 4자 이상이어야 합니다.' using errcode = 'check_violation';
  end if;

  insert into share_link_secrets (link_id, password_hash)
  values (link, crypt(pw, gen_salt('bf')))
  on conflict (link_id) do update set password_hash = excluded.password_hash;
end $$;

-- Supabase 는 함수에 public·anon 실행 권한을 기본으로 준다. anon 에게서만 빼면 public 을 통해 남는다.
revoke execute on function set_share_password(uuid, text) from public, anon;
grant execute on function set_share_password(uuid, text) to authenticated;

-- ── 주소 재발급 — 새 주소를 만들고 이전 주소는 그 자리에서 막는다 ────
-- security invoker: 위의 update 정책을 그대로 탄다.
create or replace function regenerate_share_token(link uuid)
returns text
language sql volatile set search_path = public as $$
  update share_links
     set token = new_share_token(), view_count = 0, last_viewed_at = null
   where id = link
  returning token
$$;

revoke execute on function regenerate_share_token(uuid) from public, anon;
grant execute on function regenerate_share_token(uuid) to authenticated;

-- ── 바깥에서 여는 유일한 길 ───────────────────────────────────────────
--
-- 돌려주는 status
--   ok · not_found · revoked · expired · disabled · password_required · wrong_password
--
-- 막힌 경우에는 이유만 돌려주고 내용은 한 글자도 싣지 않는다.
-- 열릴 때만 조회수를 올린다 — 비밀번호 화면을 띄운 것은 열람이 아니다.
create or replace function open_share(tok text, pw text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  l      share_links;
  w      workspaces;
  f      jsonb;
  items  jsonb;
  ttl    text;
begin
  select * into l from share_links where token = tok;
  if l.id is null then
    return jsonb_build_object('status', 'not_found');
  end if;

  select * into w from workspaces where id = l.workspace_id;
  if l.revoked_at is not null then
    return jsonb_build_object('status', 'revoked', 'workspace', w.name);
  end if;
  if l.expires_at is not null and l.expires_at < now() then
    return jsonb_build_object('status', 'expired', 'workspace', w.name);
  end if;
  if not w.allow_external_share then
    return jsonb_build_object('status', 'disabled', 'workspace', w.name);
  end if;

  if l.scope = 'password' then
    if coalesce(pw, '') = '' then
      return jsonb_build_object('status', 'password_required', 'workspace', w.name);
    end if;
    if not exists (
      select 1 from share_link_secrets s
      where s.link_id = l.id and s.password_hash = crypt(pw, s.password_hash)
    ) then
      -- 틀렸을 때만 조금 늦춘다. 한 번에 수천 번 대입해 보는 것을 무디게 한다.
      perform pg_sleep(0.4);
      return jsonb_build_object('status', 'wrong_password', 'workspace', w.name);
    end if;
  end if;

  f := coalesce(l.filter, '{}'::jsonb);

  select coalesce(jsonb_agg(x.item order by x.start_at, x.title), '[]'::jsonb) into items
  from (
    select s.start_at, s.title,
      jsonb_strip_nulls(jsonb_build_object(
        'id',          s.id,
        'title',       s.title,
        'start_at',    s.start_at,
        'end_at',      s.end_at,
        'all_day',     s.all_day,
        'project',     p.name,
        'project_color', p.color,
        'team',        case when l.show_team then t.name end,
        'team_color',  case when l.show_team then t.color end,
        'status',      case when l.show_progress then s.status::text end,
        'progress',    case when l.show_progress then s.progress end,
        'description', case when l.show_description then s.description end,
        -- 이메일은 내보내지 않는다. 표시 이름이 없으면 '멤버' 로만.
        'assignees',   case when l.show_assignees then (
                         select jsonb_agg(coalesce(nullif(trim(m.display_name), ''), '멤버') order by m.display_name)
                         from schedule_assignees a join memberships m on m.id = a.membership_id
                         where a.schedule_id = s.id) end
      )) as item
    from schedules s
    left join projects p on p.id = s.project_id
    left join teams    t on t.id = s.team_id
    where s.workspace_id = l.workspace_id
      and (
        (l.kind = 'schedule' and s.id = l.schedule_id)
        or (
          l.kind = 'view'
          and tstzrange(s.start_at, s.end_at, '[]')
              && tstzrange((f->>'from')::timestamptz, (f->>'to')::timestamptz, '[]')
          and (jsonb_typeof(f->'project_ids') is distinct from 'array'
               or s.project_id::text in (select jsonb_array_elements_text(f->'project_ids')))
          and (jsonb_typeof(f->'team_ids') is distinct from 'array'
               or s.team_id::text in (select jsonb_array_elements_text(f->'team_ids')))
          and (jsonb_typeof(f->'phase_ids') is distinct from 'array'
               or s.phase_id::text in (select jsonb_array_elements_text(f->'phase_ids')))
          and (jsonb_typeof(f->'assignee_ids') is distinct from 'array'
               or exists (
                 select 1 from schedule_assignees a
                 where a.schedule_id = s.id
                   and a.membership_id::text in (select jsonb_array_elements_text(f->'assignee_ids'))))
        )
      )
  ) x;

  ttl := case when l.kind = 'schedule'
              then (select title from schedules where id = l.schedule_id)
              else l.title end;

  update share_links set view_count = view_count + 1, last_viewed_at = now() where id = l.id;

  return jsonb_build_object(
    'status', 'ok',
    'share', jsonb_build_object(
      'kind',             l.kind,
      'title',            coalesce(ttl, '삭제된 일정'),
      'workspace',        w.name,
      'expires_at',       l.expires_at,
      'scope',            l.scope,
      'show_team',        l.show_team,
      'show_progress',    l.show_progress,
      'show_assignees',   l.show_assignees,
      'show_description', l.show_description,
      'from',             f->>'from',
      'to',               f->>'to'
    ),
    'items', items
  );
end $$;

grant execute on function open_share(text, text) to anon, authenticated;
