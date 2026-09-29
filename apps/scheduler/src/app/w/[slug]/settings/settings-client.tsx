'use client';

import { useMemo, useState, useTransition } from 'react';
import { useQuietScroll } from '@/lib/hooks/use-quiet-scroll';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  ROLE_LABEL,
  type MemberRole,
  type Membership,
  type Phase,
  type Project,
  type Team,
  type Workspace,
} from '@/lib/schedule-core/types';
import { inviteMember } from '../../../actions';
import {
  archiveProject,
  createPhase,
  createTeam,
  deletePhase,
  deleteTeam,
  movePhase,
  removeMember,
  revokeInvitation,
  setTeamMembers,
  updateMemberRole,
  updatePhase,
  updateProject,
  updateTeam,
} from '../../../settings-actions';
import './settings.css';

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

type Tab = 'phases' | 'teams' | 'projects' | 'members';

const TAB_LABEL: Record<Tab, string> = {
  phases: '업무구분',
  teams: '팀',
  projects: '프로젝트',
  members: '멤버',
};

export function SettingsClient(props: Props) {
  const { workspace, canManage } = props;
  const [tab, setTab] = useState<Tab>('phases');
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
            </button>
          ))}
        </nav>

        <main className="set__main quiet-scroll" ref={mainRef}>
          {tab === 'phases' && <PhaseSection {...props} run={run} />}
          {tab === 'teams' && <TeamSection {...props} run={run} />}
          {tab === 'projects' && <ProjectSection {...props} run={run} />}
          {tab === 'members' && <MemberSection {...props} run={run} say={say} />}
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
