'use client';

import { useMemo, useState, useTransition } from 'react';
import { useQuietScroll } from '@/lib/hooks/use-quiet-scroll';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  ROLE_LABEL,
  memberLabel,
  type DisplayMode,
  type MemberRole,
  type Membership,
  type Phase,
  type Project,
  type Team,
  type Workspace,
} from '@/lib/schedule-core/types';
import { inviteMember } from '../../../actions';
import {
  approveRequest,
  archiveProject,
  createPhase,
  createTeam,
  deletePhase,
  deleteRequest,
  deleteTeam,
  movePhase,
  rejectRequest,
  removeMember,
  revokeInvitation,
  updateMyProfile,
  setTeamMembers,
  updateMemberRole,
  updatePhase,
  updateProject,
  updateTeam,
} from '../../../settings-actions';
import './settings.css';

export interface AccessRequest {
  id: string;
  email: string;
  display_name: string;
  note: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  decided_at: string | null;
  decided_note: string | null;
}

export interface Invitation {
  id: string;
  email: string;
  role: MemberRole;
  token: string;
  accepted_at: string | null;
  created_at: string;
}

interface Props {
  workspace: Workspace;
  me: Membership | null;
  canManage: boolean;
  members: Membership[];
  teams: Team[];
  teamMembers: { team_id: string; membership_id: string }[];
  phases: Phase[];
  projects: Project[];
  invitations: Invitation[];
  requests: AccessRequest[];
}

/** 새로 만들 때 돌아가며 집어 주는 색. 매번 같은 파랑이 나오지 않게 한다. */
const PALETTE = [
  // 진한 줄
  '#2F3E6E',
  '#1F7A94',
  '#2E7D5B',
  '#7B3D8E',
  '#A33C5B',
  '#B05E22',
  '#4A5568',
  // 밝은 줄
  '#5B8DEF',
  '#2E9BB5',
  '#3FA372',
  '#A96AD1',
  '#D6455E',
  '#E8814A',
  '#7B8698',
];

type Tab = 'profile' | 'phases' | 'teams' | 'projects' | 'members' | 'requests';

const TAB_LABEL: Record<Tab, string> = {
  profile: '내 정보',
  phases: '업무구분',
  teams: '팀',
  projects: '프로젝트',
  members: '멤버',
  requests: '승인요청',
};

export function SettingsClient(props: Props) {
  const { workspace, canManage } = props;
  const [tab, setTab] = useState<Tab>('profile');
  const pendingCount = props.requests.filter((r) => r.status === 'pending').length;
  const [toast, setToast] = useState<string | null>(null);
  const [, startTx] = useTransition();
  const mainRef = useQuietScroll<HTMLElement>();

  const say = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 2600);
  };

  /** 액션 결과를 한 곳에서 처리한다 — 성공하면 조용히, 실패하면 이유를 띄운다. */
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg?: string) =>
    startTx(async () => {
      const res = await fn();
      if (!res.ok) return say(res.error ?? '처리하지 못했습니다.');
      if (okMsg) say(okMsg);
    });

  return (
    <div className="set">
      <header className="set__top">
        <Link className="btn btn--ghost" href={`/w/${workspace.slug}`}>
          ‹ 일정으로
        </Link>
        <h1 className="set__title">{workspace.name} 설정</h1>
        <span style={{ flex: 1 }} />
        {!canManage && <span className="chip">읽기 전용 — 관리자만 수정할 수 있습니다</span>}
      </header>

      <div className="set__body">
        <nav className="set__nav" aria-label="설정 항목">
          {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
            <button key={t} className="set__navitem" data-on={t === tab} onClick={() => setTab(t)}>
              {TAB_LABEL[t]}
              {/* 대기 건수는 눌러 보기 전에 보여야 한다 — 들어가 봐야 아는
                  숫자는 아무도 확인하지 않는다 */}
              {t === 'requests' && pendingCount > 0 && (
                <em className="badge badge--warn">{pendingCount}</em>
              )}
            </button>
          ))}
        </nav>

        <main className="set__main quiet-scroll" ref={mainRef}>
          {tab === 'profile' && <ProfileSection {...props} run={run} />}
          {tab === 'phases' && <PhaseSection {...props} run={run} />}
          {tab === 'teams' && <TeamSection {...props} run={run} />}
          {tab === 'projects' && <ProjectSection {...props} run={run} />}
          {tab === 'members' && <MemberSection {...props} run={run} say={say} />}
          {tab === 'requests' && <RequestSection {...props} run={run} />}
        </main>
      </div>

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

type RunFn = (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg?: string) => void;

/* ── 업무구분 ──────────────────────────────────────────────────────── */

function PhaseSection({
  workspace,
  phases,
  canManage,
  run,
}: Props & { run: RunFn }) {
  const [name, setName] = useState('');
  const color = PALETTE[phases.length % PALETTE.length];

  return (
    <section>
      <h2 className="set__h2">업무구분</h2>
      <p className="set__lead">
        로드맵에서 프로젝트 아래 줄이 되는 순서입니다. 위에서부터 차례로 표시됩니다.
      </p>

      <ul className="set__list">
        {phases.map((p, i) => (
          <li className="set__row" key={p.id}>
            <input
              type="color"
              className="set__color"
              defaultValue={p.color}
              disabled={!canManage}
              aria-label={`${p.name} 색상`}
              onBlur={(e) =>
                e.target.value !== p.color &&
                run(() => updatePhase(workspace.id, p.id, { color: e.target.value }))
              }
            />
            <input
              className="input"
              defaultValue={p.name}
              disabled={!canManage}
              aria-label="이름"
              onBlur={(e) =>
                e.target.value.trim() !== p.name &&
                run(() => updatePhase(workspace.id, p.id, { name: e.target.value }))
              }
            />
            {canManage && (
              <span className="set__actions">
                <button
                  className="btn btn--ghost"
                  disabled={i === 0}
                  aria-label="위로"
                  onClick={() => run(() => movePhase(workspace.id, p.id, 'up'))}
                >
                  ↑
                </button>
                <button
                  className="btn btn--ghost"
                  disabled={i === phases.length - 1}
                  aria-label="아래로"
                  onClick={() => run(() => movePhase(workspace.id, p.id, 'down'))}
                >
                  ↓
                </button>
                <button
                  className="btn btn--ghost btn--danger"
                  onClick={() =>
                    run(
                      () => deletePhase(workspace.id, p.id),
                      '삭제했습니다. 이 구분이던 일정은 미지정이 됩니다.',
                    )
                  }
                >
                  삭제
                </button>
              </span>
            )}
          </li>
        ))}
        {!phases.length && <li className="set__empty">업무구분이 없습니다.</li>}
      </ul>

      {canManage && (
        <form
          className="set__add"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            run(() => createPhase(workspace.id, name, color), '추가했습니다.');
            setName('');
          }}
        >
          <span className="set__swatch" style={{ background: color }} />
          <input
            className="input"
            placeholder="새 업무구분 (예: 검수)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button className="btn btn--primary" disabled={!name.trim()}>
            추가
          </button>
        </form>
      )}

      <p className="set__note">
        업무구분을 지우면 그 구분이던 일정은 <b>미지정</b>으로 내려갑니다. 일정 자체는 사라지지 않습니다.
      </p>
    </section>
  );
}

/* ── 팀 ────────────────────────────────────────────────────────────── */

function TeamSection({
  workspace,
  teams,
  teamMembers,
  members,
  canManage,
  run,
}: Props & { run: RunFn }) {
  const [name, setName] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const color = PALETTE[teams.length % PALETTE.length];

  const byTeam = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const tm of teamMembers) {
      if (!map.has(tm.team_id)) map.set(tm.team_id, new Set());
      map.get(tm.team_id)!.add(tm.membership_id);
    }
    return map;
  }, [teamMembers]);

  return (
    <section>
      <h2 className="set__h2">팀</h2>
      <p className="set__lead">
        팀 색이 월·주·일·타임라인 뷰에서 일정 막대의 색이 됩니다. 구성원은 참고용 기록입니다.
      </p>

      <ul className="set__list">
        {teams.map((t) => {
          const mine = byTeam.get(t.id) ?? new Set<string>();
          const expanded = open === t.id;
          return (
            <li className="set__row set__row--stack" key={t.id}>
              <div className="set__rowmain">
                <input
                  type="color"
                  className="set__color"
                  defaultValue={t.color}
                  disabled={!canManage}
                  aria-label={`${t.name} 색상`}
                  onBlur={(e) =>
                    e.target.value !== t.color &&
                    run(() => updateTeam(workspace.id, t.id, { color: e.target.value }))
                  }
                />
                <input
                  className="input"
                  defaultValue={t.name}
                  disabled={!canManage}
                  aria-label="팀 이름"
                  onBlur={(e) =>
                    e.target.value.trim() !== t.name &&
                    run(() => updateTeam(workspace.id, t.id, { name: e.target.value }))
                  }
                />
                <span className="set__actions">
                  <button
                    className="btn btn--ghost"
                    aria-expanded={expanded}
                    onClick={() => setOpen(expanded ? null : t.id)}
                  >
                    구성원 {mine.size} {expanded ? '▲' : '▼'}
                  </button>
                  {canManage && (
                    <button
                      className="btn btn--ghost btn--danger"
                      onClick={() =>
                        run(
                          () => deleteTeam(workspace.id, t.id),
                          '삭제했습니다. 이 팀이던 일정은 팀 없음이 됩니다.',
                        )
                      }
                    >
                      삭제
                    </button>
                  )}
                </span>
              </div>

              {expanded && (
                <div className="set__members">
                  {members.map((m) => {
                    const on = mine.has(m.id);
                    return (
                      <label className="set__check" key={m.id}>
                        <input
                          type="checkbox"
                          className="sidebar__box"
                          checked={on}
                          disabled={!canManage}
                          onChange={() => {
                            const next = new Set(mine);
                            if (on) next.delete(m.id);
                            else next.add(m.id);
                            run(() => setTeamMembers(workspace.id, t.id, [...next]));
                          }}
                        />
                        {m.display_name ?? '이름 없음'}
                      </label>
                    );
                  })}
                  {!members.length && <span className="set__empty">멤버가 없습니다.</span>}
                </div>
              )}
            </li>
          );
        })}
        {!teams.length && <li className="set__empty">팀이 없습니다.</li>}
      </ul>

      {canManage && (
        <form
          className="set__add"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            run(() => createTeam(workspace.id, name, color), '추가했습니다.');
            setName('');
          }}
        >
          <span className="set__swatch" style={{ background: color }} />
          <input
            className="input"
            placeholder="새 팀 (예: QA)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button className="btn btn--primary" disabled={!name.trim()}>
            추가
          </button>
        </form>
      )}
    </section>
  );
}

/* ── 프로젝트 ──────────────────────────────────────────────────────── */

function ProjectSection({ projects, canManage, run }: Props & { run: RunFn }) {
  const active = projects.filter((p) => !p.archived_at);
  const archived = projects.filter((p) => p.archived_at);

  const row = (p: Project) => (
    <li className="set__row" key={p.id}>
      <input
        type="color"
        className="set__color"
        defaultValue={p.color}
        disabled={!canManage}
        aria-label={`${p.name} 색상`}
        onBlur={(e) => e.target.value !== p.color && run(() => updateProject(p.id, { color: e.target.value }))}
      />
      <input
        className="input"
        defaultValue={p.name}
        disabled={!canManage}
        aria-label="프로젝트 이름"
        onBlur={(e) => e.target.value.trim() !== p.name && run(() => updateProject(p.id, { name: e.target.value }))}
      />
      {canManage && (
        <span className="set__actions">
          <button
            className="btn btn--ghost"
            onClick={() =>
              run(
                () => archiveProject(p.id, !p.archived_at),
                p.archived_at ? '복원했습니다.' : '보관했습니다.',
              )
            }
          >
            {p.archived_at ? '복원' : '보관'}
          </button>
        </span>
      )}
    </li>
  );

  return (
    <section>
      <h2 className="set__h2">프로젝트</h2>
      <p className="set__lead">프로젝트 색은 로드맵 좌측 세로 띠의 색입니다.</p>

      <ul className="set__list">
        {active.map(row)}
        {!active.length && <li className="set__empty">프로젝트가 없습니다.</li>}
      </ul>

      {archived.length > 0 && (
        <>
          <h3 className="set__h3">보관됨</h3>
          <ul className="set__list set__list--dim">{archived.map(row)}</ul>
        </>
      )}

      <p className="set__note">
        보관하면 사이드바와 로드맵에서 빠지지만 일정은 그대로 남습니다. 언제든 복원할 수 있습니다.
        새 프로젝트는 일정 화면 왼쪽에서 만듭니다.
      </p>
    </section>
  );
}

/* ── 멤버 ──────────────────────────────────────────────────────────── */

function MemberSection({
  workspace,
  me,
  members,
  invitations,
  canManage,
  run,
  say,
}: Props & { run: RunFn; say: (m: string) => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'member' | 'guest'>('member');
  const [, startTx] = useTransition();

  const pending = invitations.filter((i) => !i.accepted_at);
  const origin = typeof window === 'undefined' ? '' : window.location.origin;

  return (
    <section>
      <h2 className="set__h2">멤버</h2>
      <p className="set__lead">
        역할은 권한을 정합니다 — 게스트는 초대된 프로젝트만 읽고, 멤버는 일정을 만들고 고칠 수 있습니다.
      </p>

      <ul className="set__list">
        {members.map((m) => (
          <li className="set__row" key={m.id}>
            <span className="set__avatar">{(m.display_name ?? '?').slice(0, 1)}</span>
            <span className="set__name">
              {m.display_name ?? '이름 없음'}
              {m.id === me?.id && <span className="chip" style={{ marginLeft: 6 }}>나</span>}
            </span>
            <span className="set__actions">
              <select
                className="select"
                style={{ width: 'auto' }}
                value={m.role}
                disabled={!canManage || m.id === me?.id}
                onChange={(e) =>
                  run(() => updateMemberRole(workspace.id, m.id, e.target.value as MemberRole), '역할을 바꿨습니다.')
                }
              >
                {(Object.keys(ROLE_LABEL) as MemberRole[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
              {canManage && m.id !== me?.id && (
                <button
                  className="btn btn--ghost btn--danger"
                  onClick={() => run(() => removeMember(workspace.id, m.id), '내보냈습니다.')}
                >
                  내보내기
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>

      {canManage && (
        <>
          <h3 className="set__h3">초대</h3>
          <form
            className="set__add"
            onSubmit={(e) => {
              e.preventDefault();
              startTx(async () => {
                const res = await inviteMember(workspace.id, email, role);
                if (!res.ok) return say(res.error ?? '초대하지 못했습니다.');
                setEmail('');
                say('초대를 만들었습니다. 아래 링크를 전달하세요.');
              });
            }}
          >
            <input
              className="input"
              type="email"
              placeholder="member@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <select
              className="select"
              style={{ width: 'auto' }}
              value={role}
              onChange={(e) => setRole(e.target.value as typeof role)}
            >
              <option value="member">멤버</option>
              <option value="admin">관리자</option>
              <option value="guest">게스트</option>
            </select>
            <button className="btn btn--primary" disabled={!email.trim()}>
              초대 만들기
            </button>
          </form>

          {pending.length > 0 && (
            <ul className="set__list">
              {pending.map((inv) => {
                const url = `${origin}/invite/${inv.token}`;
                return (
                  <li className="set__row" key={inv.id}>
                    <span className="set__name">
                      {inv.email}
                      <span className="chip" style={{ marginLeft: 6 }}>{ROLE_LABEL[inv.role]}</span>
                      <span className="set__sub">
                        {format(new Date(inv.created_at), 'M월 d일')} 생성 · 수락 대기
                      </span>
                    </span>
                    <span className="set__actions">
                      <button
                        className="btn"
                        onClick={() => {
                          navigator.clipboard?.writeText(url);
                          say('초대 링크를 복사했습니다.');
                        }}
                      >
                        링크 복사
                      </button>
                      <button
                        className="btn btn--ghost btn--danger"
                        onClick={() => run(() => revokeInvitation(workspace.id, inv.id), '취소했습니다.')}
                      >
                        취소
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="set__note">
            초대 메일은 아직 자동 발송되지 않습니다. <b>링크 복사</b>로 직접 전달하세요.
            받는 사람이 <b>초대받은 이메일 계정</b>으로 로그인해야 수락됩니다 — 링크가 유출돼도
            다른 계정으로는 들어올 수 없습니다.
          </p>
        </>
      )}
    </section>
  );
}

/* ── 승인요청 ───────────────────────────────────────────────────────
   마스터가 이름과 이메일을 보고 들여보낼지 정한다.
   처리된 요청도 남겨 둔다 — 누구를 언제 왜 거절했는지가 사라지면
   같은 사람이 다시 신청했을 때 판단할 근거가 없다. */
function RequestSection({
  workspace,
  requests,
  canManage,
  run,
}: Props & { run: (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg?: string) => void }) {
  const [role, setRole] = useState<Record<string, MemberRole>>({});
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const pending = requests.filter((r) => r.status === 'pending');
  const decided = requests.filter((r) => r.status !== 'pending');

  return (
    <section>
      <h2 className="set__h2">승인요청</h2>
      <p className="set__lead">
        로그인 화면의 <b>승인 요청하기</b>로 접수된 목록입니다. 승인하면 그 이메일로 로그인할 때
        자동으로 멤버가 됩니다 — 따로 초대 링크를 보내지 않아도 됩니다.
      </p>

      {pending.length === 0 ? (
        <p className="set__empty">대기 중인 요청이 없습니다.</p>
      ) : (
        <ul className="req">
          {pending.map((r) => (
            <li className="req__item" key={r.id}>
              <div className="req__who">
                <b className="req__name">{r.display_name}</b>
                <span className="req__mail">{r.email}</span>
              </div>
              {r.note && <p className="req__note">{r.note}</p>}
              <span className="req__when">{format(new Date(r.created_at), 'M월 d일 HH:mm')}</span>

              {canManage && (
                <div className="req__act">
                  <select
                    className="select"
                    aria-label="역할"
                    value={role[r.id] ?? 'member'}
                    onChange={(e) => setRole({ ...role, [r.id]: e.target.value as MemberRole })}
                  >
                    {(['member', 'admin', 'guest'] as MemberRole[]).map((v) => (
                      <option key={v} value={v}>
                        {ROLE_LABEL[v]}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn btn--primary"
                    onClick={() =>
                      run(
                        () => approveRequest(workspace.id, r.id, role[r.id] ?? 'member'),
                        `${r.display_name} 님을 승인했습니다.`,
                      )
                    }
                  >
                    승인
                  </button>
                  <button className="btn" onClick={() => { setRejecting(r.id); setReason(''); }}>
                    거절
                  </button>
                </div>
              )}

              {rejecting === r.id && (
                <div className="req__reject">
                  <input
                    className="input"
                    placeholder="거절 사유 (선택) — 기록으로만 남습니다"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    autoFocus
                  />
                  <button
                    className="btn btn--danger"
                    onClick={() =>
                      run(() => {
                        setRejecting(null);
                        return rejectRequest(workspace.id, r.id, reason);
                      }, '거절했습니다.')
                    }
                  >
                    거절 확정
                  </button>
                  <button className="btn btn--ghost" onClick={() => setRejecting(null)}>
                    취소
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {decided.length > 0 && (
        <>
          <h3 className="set__h3" style={{ marginTop: 24 }}>
            처리된 요청
          </h3>
          <ul className="req req--done">
            {decided.map((r) => (
              <li className="req__item" key={r.id} data-status={r.status}>
                <div className="req__who">
                  <b className="req__name">{r.display_name}</b>
                  <span className="req__mail">{r.email}</span>
                  <span className={r.status === 'approved' ? 'badge' : 'badge badge--warn'}>
                    {r.status === 'approved' ? '승인' : '거절'}
                  </span>
                </div>
                {r.decided_note && <p className="req__note">사유: {r.decided_note}</p>}
                <span className="req__when">
                  {r.decided_at ? format(new Date(r.decided_at), 'M월 d일 HH:mm') : ''}
                </span>
                {canManage && (
                  <div className="req__act">
                    <button
                      className="btn btn--ghost"
                      onClick={() => run(() => deleteRequest(workspace.id, r.id), '기록을 지웠습니다.')}
                    >
                      기록 삭제
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/* ── 내 정보 ────────────────────────────────────────────────────────
   이메일은 로그인 계정 그 자체라 여기서 바꿀 수 없다. 바꿀 수 있게 하면
   로그인하는 주소와 표시되는 주소가 갈라져, 누가 누구인지 어긋난다. */
function ProfileSection({
  workspace,
  me,
  run,
}: Props & { run: (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg?: string) => void }) {
  const [name, setName] = useState(me?.display_name ?? '');
  const [mode, setMode] = useState<DisplayMode>(me?.display_as ?? 'name');

  if (!me) {
    return (
      <section>
        <h2 className="set__h2">내 정보</h2>
        <p className="set__empty">이 워크스페이스의 멤버가 아닙니다.</p>
      </section>
    );
  }

  const dirty = name.trim() !== (me.display_name ?? '') || mode !== me.display_as;
  // 지금 값이 아니라 고친 값으로 미리 보여 준다 — 저장 전에 결과를 알 수 있다
  const preview = memberLabel({ display_name: name.trim(), email: me.email, display_as: mode });

  return (
    <section>
      <h2 className="set__h2">내 정보</h2>
      <p className="set__lead">
        여기서 정한 이름이 담당자 목록·일정 상세·업무현황에 그대로 쓰입니다.
      </p>

      <div className="prof">
        <div className="field">
          <label htmlFor="pf-name">이름</label>
          <input
            id="pf-name"
            className="input"
            value={name}
            maxLength={60}
            placeholder="홍길동"
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="pf-mail">이메일</label>
          <input id="pf-mail" className="input" value={me.email ?? ''} readOnly disabled />
          <p className="set__note">
            로그인하는 계정이라 바꿀 수 없습니다. 바꾸시려면 새 주소로 승인을 받아야 합니다.
          </p>
        </div>

        <fieldset className="prof__mode">
          <legend>다른 사람에게 보일 방식</legend>
          {(['name', 'email'] as DisplayMode[]).map((v) => (
            <label className="prof__opt" key={v} data-on={mode === v}>
              <input
                type="radio"
                name="display-as"
                value={v}
                checked={mode === v}
                onChange={() => setMode(v)}
              />
              <span>
                <b>{v === 'name' ? '이름으로' : '이메일로'}</b>
                <em>{v === 'name' ? (name.trim() || '(이름을 적어 주세요)') : (me.email ?? '')}</em>
              </span>
            </label>
          ))}
        </fieldset>

        <p className="prof__preview">
          목록에 이렇게 보입니다 — <b>{preview}</b>
        </p>

        <div className="set__actions">
          <button
            className="btn btn--primary"
            disabled={!dirty || !name.trim()}
            onClick={() => run(() => updateMyProfile(workspace.id, name.trim(), mode), '저장했습니다.')}
          >
            저장
          </button>
          <button
            className="btn"
            disabled={!dirty}
            onClick={() => {
              setName(me.display_name ?? '');
              setMode(me.display_as);
            }}
          >
            되돌리기
          </button>
        </div>
      </div>
    </section>
  );
}
