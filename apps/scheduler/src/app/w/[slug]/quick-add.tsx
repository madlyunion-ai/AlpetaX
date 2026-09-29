'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { format } from 'date-fns';
import { inferHorizon } from '@/lib/schedule-core/horizon';
import {
  HORIZON_LABEL,
  STATUS_LABEL,
  type Horizon,
  type Membership,
  type Phase,
  type Project,
  type SchedStatus,
  type Schedule,
  type Team,
} from '@/lib/schedule-core/types';
import { createSchedule } from '../../actions';

interface Props {
  workspaceId: string;
  teams: Team[];
  phases: Phase[];
  members: Membership[];
  projects: Project[];
  schedules: Schedule[];
  defaultProjectId: string | null;
  /** 캔버스에서 드래그·더블클릭으로 연 경우의 기간 */
  seed: { start: Date; end: Date; allDay: boolean } | null;
  onClose: () => void;
  onToast: (msg: string) => void;
}

/** datetime-local 입력은 로컬 시간 문자열을 쓴다. 상세 패널과 같은 변환을 쓴다. */
const toLocal = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm");
const toDate = (d: Date) => format(d, 'yyyy-MM-dd');

export function QuickAdd({
  workspaceId,
  teams,
  phases,
  members,
  projects,
  schedules,
  defaultProjectId,
  seed,
  onClose,
  onToast,
}: Props) {
  const now = useMemo(() => new Date(), []);
  const initialStart = seed?.start ?? now;
  const initialEnd = seed?.end ?? new Date(now.getTime() + 6 * 86_400_000);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [allDay, setAllDay] = useState(seed?.allDay ?? true);
  const [start, setStart] = useState(
    seed?.allDay === false ? toLocal(initialStart) : toDate(initialStart),
  );
  const [end, setEnd] = useState(seed?.allDay === false ? toLocal(initialEnd) : toDate(initialEnd));
  /** '' = 자동(기간으로 추론). 고르면 그 값으로 고정된다. */
  const [horizon, setHorizon] = useState<Horizon | ''>('');
  const [status, setStatus] = useState<SchedStatus>('planned');
  const [phaseId, setPhaseId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [projectId, setProjectId] = useState(defaultProjectId ?? '');
  const [parentId, setParentId] = useState('');
  const [assignees, setAssignees] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTx] = useTransition();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /** 종일을 켜고 끌 때 값의 형식이 달라진다 — 날짜 부분은 유지한다. */
  function toggleAllDay(next: boolean) {
    setAllDay(next);
    setStart((v) => (next ? v.slice(0, 10) : `${v.slice(0, 10)}T09:00`));
    setEnd((v) => (next ? v.slice(0, 10) : `${v.slice(0, 10)}T18:00`));
  }

  const startAt = allDay ? new Date(`${start}T00:00`) : new Date(start);
  const endAt = allDay ? new Date(`${end}T23:59`) : new Date(end);
  const valid = start && end && !Number.isNaN(+startAt) && !Number.isNaN(+endAt) && endAt >= startAt;
  const predicted = valid ? inferHorizon(startAt, endAt) : 'short';

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) return setError('제목을 입력해 주세요.');
    if (!valid) return setError('종료가 시작보다 빠릅니다.');

    startTx(async () => {
      const res = await createSchedule({
        workspaceId,
        title,
        description,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        allDay,
        projectId: projectId || null,
        teamId: teamId || null,
        phaseId: phaseId || null,
        parentId: parentId || null,
        horizon: horizon || null,
        status,
        assigneeIds: assignees,
      });
      if (!res.ok) return setError(res.error ?? '만들지 못했습니다.');
      onClose();
      onToast('일정을 추가했습니다.');
    });
  }

  return (
    <div className="quick" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="qf" onSubmit={submit}>
        <div className="qf__head">
          <h2 className="qf__title">새 일정</h2>
          <button type="button" className="btn btn--ghost" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>

        <div className="qf__body">
          <div className="field">
            <label htmlFor="q-title">제목</label>
            <input
              id="q-title"
              className="input"
              autoFocus
              required
              placeholder="예: 디자인 시스템 구축"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="detail__row">
            <div className="field">
              <label htmlFor="q-start">시작</label>
              <input
                id="q-start"
                className="input"
                type={allDay ? 'date' : 'datetime-local'}
                required
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="q-end">종료</label>
              <input
                id="q-end"
                className="input"
                type={allDay ? 'date' : 'datetime-local'}
                required
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
            <input type="checkbox" checked={allDay} onChange={(e) => toggleAllDay(e.target.checked)} />
            종일
          </label>

          <div className="detail__row">
            <div className="field">
              <label htmlFor="q-horizon">분류</label>
              <select
                id="q-horizon"
                className="select"
                value={horizon}
                onChange={(e) => setHorizon(e.target.value as Horizon | '')}
              >
                <option value="">자동 — {HORIZON_LABEL[predicted]}</option>
                {(Object.keys(HORIZON_LABEL) as Horizon[]).map((h) => (
                  <option key={h} value={h}>
                    {HORIZON_LABEL[h]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="q-status">상태</label>
              <select
                id="q-status"
                className="select"
                value={status}
                onChange={(e) => setStatus(e.target.value as SchedStatus)}
              >
                {(Object.keys(STATUS_LABEL) as SchedStatus[]).map((k) => (
                  <option key={k} value={k}>
                    {STATUS_LABEL[k]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <p className="qf__hint">
            분류를 <b>자동</b>으로 두면 기간이 바뀔 때마다 장기·중기·단기가 따라갑니다.
          </p>

          <div className="detail__row">
            <div className="field">
              <label htmlFor="q-project">프로젝트</label>
              <select
                id="q-project"
                className="select"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value="">지정 안 함</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="q-phase">업무구분</label>
              <select
                id="q-phase"
                className="select"
                value={phaseId}
                onChange={(e) => setPhaseId(e.target.value)}
              >
                <option value="">미지정</option>
                {phases.map((ph) => (
                  <option key={ph.id} value={ph.id}>
                    {ph.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="detail__row">
            <div className="field">
              <label htmlFor="q-team">팀</label>
              <select
                id="q-team"
                className="select"
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
              >
                <option value="">지정 안 함</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="q-parent">상위 일정</label>
              <select
                id="q-parent"
                className="select"
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
              >
                <option value="">없음</option>
                {schedules.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label>담당자</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {members.map((m) => {
                const on = assignees.includes(m.id);
                return (
                  <button
                    type="button"
                    key={m.id}
                    className="chip"
                    style={{
                      background: on ? 'var(--accent)' : undefined,
                      color: on ? 'var(--accent-ink)' : undefined,
                      borderColor: on ? 'var(--accent)' : undefined,
                      cursor: 'pointer',
                    }}
                    onClick={() =>
                      setAssignees((prev) =>
                        on ? prev.filter((x) => x !== m.id) : [...prev, m.id],
                      )
                    }
                  >
                    {m.display_name ?? '이름 없음'}
                  </button>
                );
              })}
              {!members.length && (
                <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>멤버가 없습니다.</span>
              )}
            </div>
          </div>

          <div className="field">
            <label htmlFor="q-desc">설명</label>
            <textarea
              id="q-desc"
              className="textarea"
              placeholder="선택 사항"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>

        <div className="qf__foot">
          {error && (
            <span className="qf__error" role="alert">
              {error}
            </span>
          )}
          <span style={{ flex: 1 }} />
          <button type="button" className="btn" onClick={onClose}>
            취소
          </button>
          <button className="btn btn--primary" disabled={pending || !title.trim()}>
            {pending ? '추가 중…' : '추가'}
          </button>
        </div>
      </form>
    </div>
  );
}
