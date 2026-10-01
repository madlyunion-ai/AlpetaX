'use client';

import { useRef, useEffect, useMemo, useState, useTransition } from 'react';
import { format } from 'date-fns';
import { inferHorizon } from '@/lib/schedule-core/horizon';
import {
  HORIZON_LABEL,
  STATUS_LABEL,
  memberLabel,
  type Horizon,
  type Membership,
  type Phase,
  type Project,
  type SchedStatus,
  type Schedule,
  type Team,
} from '@/lib/schedule-core/types';
import { createProject, createSchedule } from '../../actions';

interface Props {
  workspaceId: string;
  teams: Team[];
  phases: Phase[];
  members: Membership[];
  projects: Project[];
  schedules: Schedule[];
  defaultProjectId: string | null;
  /** 눌러서 연 자리의 업무구분. 그 줄에서 만들기 시작했으므로 미리 고른다. */
  defaultPhaseId?: string | null;
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
  defaultPhaseId,
  seed,
  onClose,
  onToast,
}: Props) {
  const now = useMemo(() => new Date(), []);
  const initialStart = seed?.start ?? now;
  const initialEnd = seed?.end ?? new Date(now.getTime() + 6 * 86_400_000);

  // 'new' 는 실제 id 가 아니라 '지금 만들겠다'는 표시다.
  const [newProject, setNewProject] = useState('');
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
  const [phaseId, setPhaseId] = useState(defaultPhaseId ?? '');
  const [teamId, setTeamId] = useState('');
  const [projectId, setProjectId] = useState(defaultProjectId ?? '');
  const [parentId, setParentId] = useState('');
  const [assignees, setAssignees] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  /*
   * 창 옮기기.
   *
   * 화면을 가린 일정 막대를 확인하며 값을 채워야 할 때가 있다. 창을 닫았다
   * 다시 열면 적던 내용이 날아가므로, 옮길 수 있는 편이 낫다.
   *
   * 위치를 transform 으로만 준다 — left/top 을 건드리면 가운데 정렬이
   * 풀려서 창 크기가 바뀔 때 자리가 어긋난다.
   */
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const dragFrom = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  function onHeadPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    // 닫기 버튼 위에서 시작한 것은 옮기기가 아니다
    if ((e.target as HTMLElement).closest('button')) return;
    dragFrom.current = { px: e.clientX, py: e.clientY, x: drag.x, y: drag.y };
    // 포인터를 붙잡아 둔다 — 창 밖으로 빠르게 끌어도 놓침 없이 따라온다
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onHeadPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const from = dragFrom.current;
    if (!from) return;
    /*
     * 화면 밖으로 완전히 내보내지 않는다. 머리 부분이 남아 있어야 다시
     * 끌어올 수 있고, 아예 사라지면 닫을 방법이 Esc 뿐이다.
     */
    const room = 80;
    const maxX = window.innerWidth / 2 + 200;
    const maxY = window.innerHeight - room;
    setDrag({
      x: Math.max(-maxX, Math.min(maxX, from.x + e.clientX - from.px)),
      y: Math.max(-room, Math.min(maxY, from.y + e.clientY - from.py)),
    });
  }

  function onHeadPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    dragFrom.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }
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

  /*
   * 상위로 고를 수 있는 일정 — 지금 고른 프로젝트 안의 것만.
   *
   * 다른 프로젝트의 일을 상위로 두면 그 일정이 어느 쪽에도 온전히 속하지
   * 않는 모양이 된다. 프로젝트를 안 골랐으면 소속 없는 일정끼리만 묶는다.
   */
  const parentChoices = useMemo(() => {
    // 아직 만들지 않은 프로젝트에는 상위로 삼을 일정이 없다
    if (projectId === 'new') return [];
    return schedules.filter((s) => (s.project_id ?? '') === projectId);
  }, [schedules, projectId]);

  const startAt = allDay ? new Date(`${start}T00:00`) : new Date(start);
  const endAt = allDay ? new Date(`${end}T23:59`) : new Date(end);
  const valid = start && end && !Number.isNaN(+startAt) && !Number.isNaN(+endAt) && endAt >= startAt;
  const predicted = valid ? inferHorizon(startAt, endAt) : 'short';

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (projectId === 'new' && !newProject.trim()) return setError('프로젝트 이름을 입력해 주세요.');
    if (!title.trim()) return setError('제목을 입력해 주세요.');
    if (!valid) return setError('종료가 시작보다 빠릅니다.');

    startTx(async () => {
      /*
       * 새 프로젝트를 먼저 만든다. 일정을 만든 뒤에 프로젝트를 만들면, 중간에
       * 실패했을 때 프로젝트 없는 일정이 남는다. 순서를 뒤집으면 최악의 경우
       * 빈 프로젝트 하나가 남을 뿐이고, 그건 설정에서 지울 수 있다.
       */
      let pid = projectId;
      if (pid === 'new') {
        const made = await createProject(workspaceId, newProject.trim());
        if (!made.ok || !made.data) return setError(made.error ?? '프로젝트를 만들지 못했습니다.');
        pid = made.data.id;
      }

      const res = await createSchedule({
        workspaceId,
        title,
        description,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        allDay,
        projectId: pid || null,
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
      <form
        className="qf"
        onSubmit={submit}
        style={drag.x || drag.y ? { transform: `translate(${drag.x}px, ${drag.y}px)` } : undefined}
      >
        <div
          className="qf__head"
          data-drag="true"
          onPointerDown={onHeadPointerDown}
          onPointerMove={onHeadPointerMove}
          onPointerUp={onHeadPointerUp}
          onPointerCancel={onHeadPointerUp}
        >
          <h2 className="qf__title">새 일정</h2>
          <button type="button" className="btn btn--ghost" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>

        <div className="qf__body">
          {/* 프로젝트를 맨 위에 둔다 — 어느 프로젝트의 일인지 정하고 나서
              제목을 쓰는 것이 순서에 맞고, 프로젝트가 하나도 없을 때
              여기서 바로 만들 수 있다 */}
          <div className="field">
            <label htmlFor="q-project">프로젝트</label>
            <select
              id="q-project"
              className="select"
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value);
                // 상위 일정은 같은 프로젝트 안에서만 고른다. 프로젝트가 바뀌면
                // 이미 고른 값이 그 밖이 되므로 함께 비운다 — 남겨 두면
                // 화면에는 '없음' 인데 저장은 옛 값으로 된다.
                setParentId('');
              }}
            >
              <option value="">지정 안 함</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              <option value="new">+ 새 프로젝트 만들기…</option>
            </select>
          </div>

          {projectId === 'new' && (
            <div className="field">
              <label htmlFor="q-newproject">새 프로젝트 이름</label>
              <input
                id="q-newproject"
                className="input"
                autoFocus
                required
                maxLength={60}
                placeholder="예) 스마트 예약 시스템"
                value={newProject}
                onChange={(e) => setNewProject(e.target.value)}
              />
            </div>
          )}

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
                {parentChoices.map((s) => (
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
                    {memberLabel(m)}
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
