-- ═══════════════════════════════════════════════════════════════════
--  외부 공유 — 로드맵에 상위·하위 연결선
--
--  받는 사람의 로드맵에도 앱처럼 상위 일정 → 하위 일정 연결선을 그리려면
--  일정마다 parent_id 가 필요하다. 0012 의 open_share() 에 parent_id 를 더한다.
--
--  상위 일정이 공유 범위 밖이면 parent_id 를 지운다 — 공유하지 않은 일정의
--  존재(식별자)까지 새 나가지 않게. 나머지 규칙은 0012 와 같다.
--
--  함수 하나만 바꾼다. 여러 번 실행해도 안전하다. 되돌리려면 0012 를 다시 실행.
-- ═══════════════════════════════════════════════════════════════════

create or replace function open_share(tok text, pw text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  l      share_links;
  w      workspaces;
  f      jsonb;
  items  jsonb;
  ttl    text;
  pids   uuid[];
  extra  jsonb;
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
        -- 로드맵 줄을 만들 열쇠. 이름·색은 아래 projects / phases 로 따로 보낸다.
        'project_id',  s.project_id,
        'phase_id',    s.phase_id,
        -- 연결선용. 상위가 공유 범위 밖이면 아래에서 지운다.
        'parent_id',   s.parent_id,
        'horizon',     s.horizon::text,
        'sort_order',  s.sort_order,
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

  -- 상위 일정이 함께 공유되지 않았으면 parent_id 를 뺀다(순서는 그대로)
  select coalesce(jsonb_agg(
           case when i ? 'parent_id'
                 and not exists (select 1 from jsonb_array_elements(items) j where j->>'id' = i->>'parent_id')
                then i - 'parent_id' else i end
           order by n), '[]'::jsonb)
    into items
    from jsonb_array_elements(items) with ordinality as e(i, n);

  /*
   * 로드맵을 그리는 데 필요한 것들. 일정에 실제로 걸린 프로젝트만 내보낸다 —
   * 공유하지 않은 프로젝트의 이름까지 새 나가지 않게.
   * 업무구분은 줄 이름일 뿐이라 워크스페이스 것을 그대로 쓴다(빈 줄은 그려지지 않는다).
   * 마일스톤은 화면 공유에서만, 기간 안의 것만.
   */
  select coalesce(array_agg(distinct (i->>'project_id')::uuid), '{}')
    into pids
    from jsonb_array_elements(items) i
   where i ? 'project_id';

  extra := jsonb_build_object(
    'projects', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'color', p.color) order by p.created_at)
      from projects p where p.id = any(pids)), '[]'::jsonb),
    'phases', coalesce((
      select jsonb_agg(jsonb_build_object('id', ph.id, 'name', ph.name, 'color', ph.color, 'sort_order', ph.sort_order)
                       order by ph.sort_order)
      from phases ph where ph.workspace_id = l.workspace_id), '[]'::jsonb),
    'milestones', case when l.kind = 'view' then coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'project_id', m.project_id, 'title', m.title,
                                          'due_on', m.due_on, 'status', m.status::text) order by m.due_on)
      from milestones m
      where m.project_id = any(pids)
        and m.due_on between ((f->>'from')::timestamptz at time zone 'Asia/Seoul')::date
                         and ((f->>'to')::timestamptz   at time zone 'Asia/Seoul')::date), '[]'::jsonb)
      else '[]'::jsonb end
  );

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
      'to',               f->>'to',
      'scale',            f->>'scale'
    ),
    'items', items
  ) || extra;
end $$;

grant execute on function open_share(text, text) to anon, authenticated;
