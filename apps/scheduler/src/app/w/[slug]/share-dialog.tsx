'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  type Membership,
  type Project,
  type Schedule,
  type Team,
  type Workspace,
} from '@/lib/schedule-core/types';
import {
  DEFAULT_FIELDS,
  EXPIRE_LABEL,
  FIELD_LABEL,
  SCOPE_LABEL,
  SHARE_COLUMNS,
  buildIcs,
  fmtDate,
  fmtPeriod,
  googleCalendarUrl,
  icsUrl,
  isActive,
  outlookUrl,
  safeFileName,
  shareUrl,
  type ExpireChoice,
  type ShareFields,
  type ShareFilter,
  type ShareItem,
  type ShareLink,
  type ShareScope,
} from '@/lib/share/share-core';
import {
  createShareLink,
  regenerateShareToken,
  revokeShareLink,
  updateShareLink,
  type ShareOptions,
} from '../../share-actions';
import './share.css';

export type ShareDialogTarget =
  | { kind: 'schedule'; schedule: Schedule }
  | { kind: 'view'; title: string; filter: ShareFilter; schedules: Schedule[] };

interface Props {
  workspace: Workspace;
  target: ShareDialogTarget;
  projects: Project[];
  teams: Team[];
  members: Membership[];
  assigneeMap: Map<string, string[]>;
  onClose: () => void;
  onToast: (msg: string) => void;
}

type Tab = 'link' | 'calendar' | 'email';
const TAB_LABEL: Record<Tab, string> = { link: '공유 링크', calendar: '캘린더', email: '이메일' };

/** 받는 사람에게 가는 모양으로 바꾼다 — 서버의 open_share() 와 같은 규칙. */
function toShareItem(
  s: Schedule,
  f: ShareFields,
  ctx: Pick<Props, 'projects' | 'teams' | 'members' | 'assigneeMap'>,
): ShareItem {
  const p = ctx.projects.find((x) => x.id === s.project_id);
  const t = ctx.teams.find((x) => x.id === s.team_id);
  const who = (ctx.assigneeMap.get(s.id) ?? [])
    .map((id) => ctx.members.find((m) => m.id === id))
    .filter((m): m is Membership => !!m)
    // 밖으로는 이메일을 내보내지 않는다 — 표시 이름만
    .map((m) => m.display_name?.trim() || '멤버');
  return {
    id: s.id,
    title: s.title,
    start_at: s.start_at,
    end_at: s.end_at,
    all_day: s.all_day,
    project: p?.name,
    project_color: p?.color,
    team: f.show_team ? t?.name : undefined,
    team_color: f.show_team ? t?.color : undefined,
    status: f.show_progress ? s.status : undefined,
    progress: f.show_progress ? s.progress : undefined,
    assignees: f.show_assignees && who.length ? who : undefined,
    description: f.show_description ? (s.description ?? undefined) : undefined,
  };
}

/** 남은 기간으로 '만료' 선택값을 거꾸로 맞춘다 — 이미 나간 링크를 열었을 때 */
function expireChoiceOf(l: ShareLink): ExpireChoice {
  if (!l.expires_at) return 'none';
  const days = (new Date(l.expires_at).getTime() - Date.now()) / 86_400_000;
  return days <= 8 ? '7' : days <= 31 ? '30' : '90';
}

export function ShareDialog(props: Props) {
  const { workspace, target, onToast } = props;
  const [tab, setTab] = useState<Tab>('link');
  const [link, setLink] = useState<ShareLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);
  const [pending, startTx] = useTransition();

  // 링크를 만들기 전의 옵션 초안. 만든 뒤에는 링크 자체가 값이다.
  const [draft, setDraft] = useState<ShareOptions>({ ...DEFAULT_FIELDS, scope: 'anyone', expire: '30', password: '' });
  const [title, setTitle] = useState(target.kind === 'view' ? target.title : '');
  const [newPw, setNewPw] = useState('');
  const [pwOpen, setPwOpen] = useState(false);
  const [mailTo, setMailTo] = useState('');
  const [mailMsg, setMailMsg] = useState('');

  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const schedules = useMemo(
    () => (target.kind === 'schedule' ? [target.schedule] : target.schedules),
    [target],
  );
  const name = target.kind === 'schedule' ? target.schedule.title : title || target.title;

  /* 이미 공유 중인 링크와 워크스페이스 스위치를 읽는다 */
  useEffect(() => {
    let alive = true;
    const supabase = createClient();
    (async () => {
      const ws = await supabase.from('workspaces').select('allow_external_share').eq('id', workspace.id).maybeSingle();
      if (!alive) return;
      if (ws.error) {
        setDbError('공유 기능의 DB 준비가 아직 안 됐습니다(0011 마이그레이션). 관리자에게 알려 주세요.');
        setLoading(false);
        return;
      }
      setAllowed(ws.data?.allow_external_share !== false);
      if (target.kind === 'schedule') {
        const { data } = await supabase
          .from('share_links')
          .select(SHARE_COLUMNS)
          .eq('schedule_id', target.schedule.id)
          .is('revoked_at', null)
          .order('created_at', { ascending: false })
          .limit(5);
        if (!alive) return;
        setLink(((data ?? []) as ShareLink[]).find((l) => isActive(l)) ?? null);
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [workspace.id, target]);

  const fields: ShareFields = link ?? draft;
  const { projects, teams, members, assigneeMap } = props;
  const items = useMemo(
    () => schedules.map((s) => toShareItem(s, fields, { projects, teams, members, assigneeMap })),
    [schedules, fields, projects, teams, members, assigneeMap],
  );
  const url = link ? shareUrl(origin, link.token) : null;

  /* ── 동작 ── */
  const copy = async (text: string, done = '링크를 복사했습니다.') => {
    try {
      await navigator.clipboard.writeText(text);
      onToast(done);
    } catch {
      onToast('복사하지 못했습니다 — 주소를 직접 선택해 복사해 주세요.');
    }
  };

  const create = (then?: (l: ShareLink) => void) =>
    startTx(async () => {
      if (draft.scope === 'password' && (draft.password ?? '').length < 4)
        return onToast('비밀번호를 4자 이상 입력해 주세요.');
      const res = await createShareLink(
        workspace.id,
        target.kind === 'schedule'
          ? { kind: 'schedule', scheduleId: target.schedule.id }
          : { kind: 'view', title: name, filter: target.filter },
        draft,
        workspace.slug,
      );
      if (!res.ok || !res.data) return onToast(res.error ?? '링크를 만들지 못했습니다.');
      setLink(res.data);
      onToast('공유 링크를 만들었습니다.');
      then?.(res.data);
    });

  const patch = (p: Partial<ShareOptions>, msg = '바꿨습니다 — 이미 보낸 링크에도 바로 적용됩니다.') => {
    if (!link) return setDraft((d) => ({ ...d, ...p }));
    startTx(async () => {
      const res = await updateShareLink(link.id, p, workspace.slug);
      if (!res.ok || !res.data) return onToast(res.error ?? '바꾸지 못했습니다.');
      setLink(res.data);
      onToast(msg);
    });
  };

  const download = () => {
    try {
      const ics = buildIcs(items, { name, workspace: workspace.name, link: url ?? undefined });
      const href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = href;
      a.download = `${safeFileName(name)}.ics`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      onToast(`일정 ${items.length}건을 .ics 파일로 내려받았습니다.`);
    } catch {
      onToast('파일을 내려받지 못했습니다.');
    }
  };

  /* ── 대상 요약 ── */
  const first = schedules[0];
  const teamColor = props.teams.find((t) => t.id === first?.team_id)?.color;
  const summary = (
    <div className="sh__target">
      {target.kind === 'schedule' && <span className="sidebar__dot" style={{ background: teamColor ?? 'var(--ink-3)' }} />}
      <span className="sh__targetmain">
        <b>{name}</b>
        <span>
          {target.kind === 'schedule'
            ? fmtPeriod(target.schedule)
            : '필터 조건이 링크에 저장됩니다. 조건에 맞는 일정이 바뀌면 받는 쪽 화면도 함께 바뀝니다.'}
        </span>
      </span>
      <span className="chip">일정 {schedules.length}건</span>
    </div>
  );

  /* ── 링크 탭 ── */
  const scope: ShareScope = link?.scope ?? draft.scope;
  const expire: ExpireChoice = link ? expireChoiceOf(link) : draft.expire;

  const linkPane = (
    <div className="sh__sec">
      {!allowed && (
        <p className="sh__warn">
          워크스페이스 설정에서 외부 공유가 꺼져 있어 새 링크를 만들 수 없고, 이미 나간 링크도 열리지 않습니다.
        </p>
      )}

      {link ? (
        <>
          <div className="sh__ok">
            <b>공유 중</b>
            <span>
              {SCOPE_LABEL[link.scope]} ·{' '}
              {link.expires_at ? `${fmtDate(link.expires_at)}까지` : '만료 없음'} · 조회 {link.view_count}회
            </span>
          </div>
          <div className="sh__link">
            <input className="input" readOnly value={url ?? ''} aria-label="공유 링크" onFocus={(e) => e.target.select()} />
            <button type="button" className="btn" onClick={() => url && copy(url)}>
              복사
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="sh__note">
            계정이 없는 사람도 로그인 없이 볼 수 있는 읽기 전용 링크를 만듭니다. 받는 사람은 일정을 고칠 수 없습니다.
          </p>
          {target.kind === 'view' && (
            <div className="field">
              <label htmlFor="sh-title">공유 이름</label>
              <input id="sh-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
          )}
        </>
      )}

      <div className="sh__group">
        <span className="sh__label">접근 범위</span>
        <div className="sh__radio" role="radiogroup" aria-label="접근 범위">
          {(Object.keys(SCOPE_LABEL) as ShareScope[]).map((k) => (
            <label key={k} className="sh__opt">
              <input
                type="radio"
                name="sh-scope"
                checked={scope === k}
                disabled={pending}
                onChange={() => {
                  if (!link) return setDraft((d) => ({ ...d, scope: k }));
                  if (k === 'password') return setPwOpen(true); // 비밀번호를 받은 뒤에 잠근다
                  setPwOpen(false);
                  patch({ scope: 'anyone' }, '비밀번호를 풀었습니다.');
                }}
              />
              {SCOPE_LABEL[k]}
            </label>
          ))}
        </div>

        {!link && draft.scope === 'password' && (
          <input
            className="input"
            type="text"
            placeholder="비밀번호 4자 이상"
            aria-label="비밀번호"
            value={draft.password ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, password: e.target.value }))}
          />
        )}
        {link && (pwOpen || link.scope === 'password') && (
          <form
            className="sh__link"
            onSubmit={(e) => {
              e.preventDefault();
              patch({ scope: 'password', password: newPw }, link.scope === 'password' ? '비밀번호를 바꿨습니다.' : '비밀번호로 잠갔습니다.');
              setNewPw('');
              setPwOpen(false);
            }}
          >
            <input
              className="input"
              type="text"
              placeholder={link.scope === 'password' ? '새 비밀번호 (바꿀 때만)' : '비밀번호 4자 이상'}
              aria-label="비밀번호"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
            />
            <button className="btn" disabled={pending || newPw.length < 4}>
              {link.scope === 'password' ? '바꾸기' : '잠그기'}
            </button>
          </form>
        )}
        <p className="sh__note">
          {scope === 'password'
            ? '비밀번호는 링크와 다른 경로(전화·메신저)로 전달하세요. 비밀번호 링크는 캘린더 구독을 쓸 수 없습니다.'
            : '링크가 전달되면 누구나 볼 수 있습니다. 민감한 일정은 비밀번호를 거세요.'}
        </p>
      </div>

      <div className="sh__group sh__group--row">
        <label className="sh__label" htmlFor="sh-exp">
          만료
        </label>
        <select
          id="sh-exp"
          className="select"
          style={{ width: 'auto' }}
          value={expire}
          disabled={pending}
          onChange={(e) => patch({ expire: e.target.value as ExpireChoice })}
        >
          {(Object.keys(EXPIRE_LABEL) as ExpireChoice[]).map((k) => (
            <option key={k} value={k}>
              {link && k !== 'none' ? `오늘부터 ${EXPIRE_LABEL[k]}` : EXPIRE_LABEL[k]}
            </option>
          ))}
        </select>
        {!link && <span className="sh__note">기한이 지나면 링크가 저절로 닫힙니다.</span>}
      </div>

      <div className="sh__group">
        <span className="sh__label">외부에 보이는 항목</span>
        <div className="sh__checks">
          {(Object.keys(FIELD_LABEL) as (keyof ShareFields)[]).map((k) => (
            <label key={k} className="sh__opt">
              <input
                type="checkbox"
                checked={fields[k]}
                disabled={pending}
                onChange={(e) => patch({ [k]: e.target.checked })}
              />
              {FIELD_LABEL[k]}
            </label>
          ))}
        </div>
        <p className="sh__note">제목·기간·프로젝트는 늘 보입니다. 나머지는 켠 것만 서버에서 내보냅니다.</p>
      </div>

      {link && (
        <div className="sh__actions">
          <a className="btn" href={url ?? '#'} target="_blank" rel="noopener noreferrer">
            받는 사람 화면 열기
          </a>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="btn btn--ghost"
            disabled={pending}
            title="주소를 새로 만들고 이전 주소는 바로 막습니다"
            onClick={() =>
              startTx(async () => {
                const res = await regenerateShareToken(link.id, workspace.slug);
                if (!res.ok || !res.data) return onToast(res.error ?? '재발급하지 못했습니다.');
                setLink({ ...link, token: res.data.token, view_count: 0 });
                onToast('새 주소를 만들었습니다. 이전 주소는 더 이상 열리지 않습니다.');
              })
            }
          >
            링크 재발급
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--danger"
            disabled={pending}
            onClick={() =>
              startTx(async () => {
                const res = await revokeShareLink(link.id, workspace.slug);
                if (!res.ok) return onToast(res.error ?? '중지하지 못했습니다.');
                setLink(null);
                setDraft({ ...draft, scope: 'anyone', password: '' });
                onToast('공유를 중지했습니다. 링크가 더 이상 열리지 않습니다.');
              })
            }
          >
            공유 중지
          </button>
        </div>
      )}
    </div>
  );

  /* ── 캘린더 탭 ── */
  const subUrl = link && link.scope === 'anyone' ? icsUrl(origin, link.token) : null;
  const calendarPane = (
    <div className="sh__sec">
      {target.kind === 'schedule' && items[0] && (
        <div className="sh__card">
          <b className="sh__cardtitle">내 캘린더에 바로 추가</b>
          <p className="sh__note">받는 사람에게 이 버튼의 주소를 보내도 됩니다. 일정 한 건이 상대 캘린더에 그대로 들어갑니다.</p>
          <div className="sh__cardact">
            <a className="btn" href={googleCalendarUrl(items[0], workspace.name, url ?? undefined)} target="_blank" rel="noopener noreferrer">
              Google 캘린더
            </a>
            <a className="btn" href={outlookUrl(items[0], workspace.name, url ?? undefined)} target="_blank" rel="noopener noreferrer">
              Outlook
            </a>
          </div>
        </div>
      )}
      <div className="sh__card">
        <b className="sh__cardtitle">.ics 파일 내려받기</b>
        <p className="sh__note">
          Outlook·Google·Apple 캘린더 어디서나 가져올 수 있습니다. 내려받은 시점의 사본이라 이후 변경은 반영되지 않습니다.
        </p>
        <div className="sh__cardact">
          <button type="button" className="btn" disabled={!items.length} onClick={download}>
            .ics 내려받기 ({items.length}건)
          </button>
        </div>
      </div>
      <div className="sh__card">
        <b className="sh__cardtitle">캘린더 구독 주소</b>
        {subUrl ? (
          <>
            <p className="sh__note">
              상대 캘린더가 몇 시간마다 다시 읽어 와서, 여기서 고친 내용이 따라갑니다. 공유를 중지하면 구독도 끊깁니다.
            </p>
            <div className="sh__link">
              <input className="input" readOnly value={subUrl} aria-label="구독 주소" onFocus={(e) => e.target.select()} />
              <button type="button" className="btn" onClick={() => copy(subUrl, '구독 주소를 복사했습니다.')}>
                복사
              </button>
            </div>
          </>
        ) : link ? (
          <p className="sh__note">비밀번호로 잠긴 링크는 구독할 수 없습니다. 캘린더 앱은 비밀번호를 입력할 수 없기 때문입니다.</p>
        ) : (
          <>
            <p className="sh__note">변경이 계속 따라가는 구독 주소는 공유 링크가 있어야 만들어집니다.</p>
            <div className="sh__cardact">
              <button type="button" className="btn" disabled={pending || !allowed} onClick={() => create()}>
                공유 링크 만들기
              </button>
            </div>
          </>
        )}
      </div>
      <p className="sh__note">캘린더로 나가는 항목도 ‘공유 링크’ 탭의 ‘외부에 보이는 항목’ 설정을 따릅니다.</p>
    </div>
  );

  /* ── 이메일 탭 ──
     메일 서버를 따로 두지 않고 사용자의 메일 앱을 연다. 보낸 사람이 본인이라
     받는 쪽이 누가 보냈는지 바로 알고, 회신도 본인에게 온다. */
  const emails = mailTo.split(/[,\s;]+/).filter(Boolean);
  const badMail = emails.filter((x) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
  const mailBody = (u: string) =>
    [mailMsg.trim() || `${name} 일정을 공유드립니다.`, '', u, '', `— ${workspace.name} · Syncteams`].join('\n');
  const openMail = (u: string) => {
    const q = new URLSearchParams({ subject: `[공유] ${name}`, body: mailBody(u) }).toString().replace(/\+/g, '%20');
    window.location.assign(`mailto:${emails.join(',')}?${q}`);
  };
  const emailPane = (
    <div className="sh__sec">
      <div className="field">
        <label htmlFor="sh-to">받는 사람</label>
        <input
          id="sh-to"
          className="input"
          placeholder="name@client.co.kr, 여러 명은 쉼표로"
          value={mailTo}
          onChange={(e) => setMailTo(e.target.value)}
        />
      </div>
      {badMail.length > 0 && <p className="sh__error">이메일 형식이 아닙니다: {badMail.join(', ')}</p>}
      <div className="field">
        <label htmlFor="sh-msg">메시지 (선택)</label>
        <textarea
          id="sh-msg"
          className="textarea"
          rows={3}
          placeholder={`${name} 일정을 공유드립니다.`}
          value={mailMsg}
          onChange={(e) => setMailMsg(e.target.value)}
        />
      </div>
      <p className="sh__note">
        내 메일 앱이 열리고 링크가 본문에 들어갑니다. 링크가 아직 없으면 ‘공유 링크’ 탭의 설정으로 먼저 만듭니다.
        {scope === 'password' && ' 비밀번호는 메일에 넣지 말고 따로 전달하세요.'}
      </p>
    </div>
  );

  /* ── 하단 ── */
  let foot: React.ReactNode;
  if (tab === 'link') {
    foot = link ? (
      <>
        <span className="sh__note">{fmtDate(link.created_at)} 생성</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn" onClick={props.onClose}>
          닫기
        </button>
        <button type="button" className="btn btn--primary" onClick={() => url && copy(url)}>
          링크 복사
        </button>
      </>
    ) : (
      <>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn" onClick={props.onClose}>
          닫기
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={pending || !allowed || loading || !!dbError}
          onClick={() => create((l) => copy(shareUrl(origin, l.token), '링크를 만들고 복사했습니다.'))}
        >
          링크 만들기
        </button>
      </>
    );
  } else if (tab === 'email') {
    foot = (
      <>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn" onClick={props.onClose}>
          닫기
        </button>
        <button
          type="button"
          className="btn"
          disabled={!url}
          title={url ? '' : '링크를 만든 뒤 쓸 수 있습니다'}
          onClick={() => url && copy(mailBody(url), '메일 본문을 복사했습니다.')}
        >
          본문 복사
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={pending || !!dbError || !emails.length || badMail.length > 0 || (!link && !allowed)}
          onClick={() => (url ? openMail(url) : create((l) => openMail(shareUrl(origin, l.token))))}
        >
          메일 앱에서 열기
        </button>
      </>
    );
  } else {
    foot = (
      <>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn" onClick={props.onClose}>
          닫기
        </button>
      </>
    );
  }

  return (
    <div className="quick" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="qf sh" role="dialog" aria-modal="true" aria-label="외부에 공유">
        <div className="qf__head">
          <h2 className="qf__title">외부에 공유</h2>
          <button type="button" className="btn btn--ghost" aria-label="닫기" onClick={props.onClose}>
            ✕
          </button>
        </div>
        <div className="qf__body">
          {summary}
          <div className="sh__tabs" role="tablist">
            {(Object.keys(TAB_LABEL) as Tab[]).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                className="tab"
                aria-selected={tab === k}
                data-on={tab === k}
                onClick={() => setTab(k)}
              >
                {TAB_LABEL[k]}
              </button>
            ))}
          </div>
          {dbError ? (
            <p className="sh__warn">{dbError}</p>
          ) : loading ? (
            <p className="sh__note">불러오는 중…</p>
          ) : tab === 'link' ? (
            linkPane
          ) : tab === 'calendar' ? (
            calendarPane
          ) : (
            emailPane
          )}
        </div>
        <div className="qf__foot">{foot}</div>
      </div>
    </div>
  );
}

