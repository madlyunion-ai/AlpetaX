'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  HORIZON_LABEL,
  STATUS_LABEL,
  type Dependency,
  type Horizon,
  type Membership,
  type Phase,
  type Project,
  type SchedStatus,
  type Schedule,
  type Team,
  type Workspace,
} from '@/lib/schedule-core/types';
import { inferHorizon } from '@/lib/schedule-core/horizon';
import {
  addComment,
  addDependency,
  deleteSchedule,
  removeDependency,
  setAssignees,
  updateSchedule,
  type SchedulePatch,
} from '../../actions';

interface Props {
  schedule: Schedule;
  workspace: Workspace;
  teams: Team[];
  phases: Phase[];
  projects: Project[];
  members: Membership[];
  allSchedules: Schedule[];
  dependencies: Dependency[];
  assigneeIds: string[];
  canEdit: boolean;
  onClose: () => void;
  onToast: (msg: string) => void;
}

/** datetime-local 입력은 로컬 시간 문자열을 쓴다. ISO 와의 변환을 한 곳에 모은다. */
const toLocal = (iso: string) => format(new Date(iso), "yyyy-MM-dd'T'HH:mm");
const toDate = (iso: string) => format(new Date(iso), 'yyyy-MM-dd');

interface Draft {
  title: string;
  description: string;
  allDay: boolean;
  start: string;
  end: string;
  horizon: Horizon;
  status: SchedStatus;
  progress: number;
  phaseId: string;
  teamId: string;
  projectId: string;
  parentId: string;
  assignees: string[];
}

function draftOf(s: Schedule, assignees: string[]): Draft {
  return {
    title: s.title,
    description: s.description ?? '',
    allDay: s.all_day,
    start: s.all_day ? toDate(s.start_at) : toLocal(s.start_at),
    end: s.all_day ? toDate(s.end_at) : toLocal(s.end_at),
    horizon: s.horizon,
    status: s.status,
    progress: s.progress,
    phaseId: s.phase_id ?? '',
    teamId: s.team_id ?? '',
    projectId: s.project_id ?? '',
    parentId: s.parent_id ?? '',
    assignees: [...assignees].sort(),
  };
}

const sameList = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

export function DetailPanel(props: Props) {
  const { schedule: s, canEdit, onToast } = props;
  const router = useRouter();
  const [, startTx] = useTransition();

  const base = draftOf(s, props.assigneeIds);
  const [draft, setDraft] = useState<Draft>(base);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [comments, setComments] = useState<{ id: string; body: string; created_at: string }[]>([]);

  /**
   * 서버 값이 바뀌면(다른 멤버의 편집, 새로고침) 기준선을 다시 잡는다.
   * 이펙트가 아니라 렌더 중 상태 조정 — 연쇄 렌더 없이 한 번에 반영된다.
   * 내가 고치던 중이면 건드리지 않는다. 남의 저장이 내 입력을 지워선 안 된다.
   */
  const [synced, setSynced] = useState(s.updated_at);
  const dirty =
    draft.title !== base.title ||
    draft.description !== base.description ||
    draft.allDay !== base.allDay ||
    draft.start !== base.start ||
    draft.end !== base.end ||
    draft.horizon !== base.horizon ||
    draft.status !== base.status ||
    draft.progress !== base.progress ||
    draft.phaseId !== base.phaseId ||
    draft.teamId !== base.teamId ||
    draft.projectId !== base.projectId ||
    draft.parentId !== base.parentId ||
    !sameList(draft.assignees, base.assignees);

  if (synced !== s.updated_at && !dirty) {
    setSynced(s.updated_at);
    setDraft(base);
    setConflict(false);
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  /** 종일을 켜고 끌 때 입력 형식이 달라진다 — 날짜 부분은 유지한다. */
  function toggleAllDay(next: boolean) {
    setDraft((d) => ({
      ...d,
      allDay: next,
      start: next ? d.start.slice(0, 10) : `${d.start.slice(0, 10)}T09:00`,
      end: next ? d.end.slice(0, 10) : `${d.end.slice(0, 10)}T18:00`,
    }));
  }

  const startAt = draft.allDay ? new Date(`${draft.start}T00:00`) : new Date(draft.start);
  const endAt = draft.allDay ? new Date(`${draft.end}T23:59`) : new Date(draft.end);
  const datesValid = !Number.isNaN(+startAt) && !Number.isNaN(+endAt) && endAt >= startAt;
  const predicted = datesValid ? inferHorizon(startAt, endAt) : draft.horizon;

  function save() {
    setError(null);
    if (!draft.title.trim()) return setError('제목을 입력해 주세요.');
    if (!datesValid) return setError('종료가 시작보다 빠릅니다.');

    const patch: SchedulePatch = {};
    if (draft.title !== base.title) patch.title = draft.title;
    if (draft.description !== base.description) patch.description = draft.description;
    if (draft.allDay !== base.allDay) patch.allDay = draft.allDay;
    if (draft.start !== base.start || draft.allDay !== base.allDay)
      patch.startAt = startAt.toISOString();
    if (draft.end !== base.end || draft.allDay !== base.allDay) patch.endAt = endAt.toISOString();
    if (draft.horizon !== base.horizon) patch.horizon = draft.horizon;
    if (draft.status !== base.status) patch.status = draft.status;
    if (draft.progress !== base.progress) patch.progress = draft.progress;
    if (draft.phaseId !== base.phaseId) patch.phaseId = draft.phaseId || null;
    if (draft.teamId !== base.teamId) patch.teamId = draft.teamId || null;
    if (draft.projectId !== base.projectId) patch.projectId = draft.projectId || null;
    if (draft.parentId !== base.parentId) patch.parentId = draft.parentId || null;

    const assigneesChanged = !sameList(draft.assignees, base.assignees);

    startTx(async () => {
      if (Object.keys(patch).length) {
        const res = await updateSchedule(s.id, patch, s.updated_at);
        if (!res.ok) {
          if (res.conflict) return setConflict(true);
          return setError(res.error ?? '저장하지 못했습니다.');
        }
      }
      if (assigneesChanged) {
        const res = await setAssignees(s.id, draft.assignees);
        if (!res.ok) return setError(res.error ?? '담당자를 바꾸지 못했습니다.');
      }
      onToast('수정했습니다.');
      router.refresh();
    });
  }

  const deps = props.dependencies.filter((d) => d.predecessor_id === s.id || d.successor_id === s.id);
  const byId = new Map(props.allSchedules.map((x) => [x.id, x]));
  const team = draft.teamId ? props.teams.find((t) => t.id === draft.teamId) : undefined;

  return (
    <aside className="detail detail--enter" aria-label="일정 상세">
      <div className="detail__head">
        <span className="sidebar__dot" style={{ background: team?.color ?? 'var(--ink-3)' }} />
        <span className="detail__headtitle">일정 상세</span>
        {dirty && <span className="detail__badge">수정 중</span>}
        <button className="btn btn--ghost" onClick={props.onClose} aria-label="닫기">
          ✕
        </button>
      </div>

      <div className="detail__body">
        {conflict && (
          <div className="detail__conflict" role="alert">
            <b>다른 멤버가 이 일정을 수정했습니다.</b>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                className="btn"
                style={{ height: 28, fontSize: 13 }}
                onClick={() => {
                  setConflict(false);
                  setDraft(draftOf(s, props.assigneeIds));
                  setSynced(s.updated_at);
                  router.refresh();
                }}
              >
                최신 내용 불러오기
              </button>
              <button
                className="btn"
                style={{ height: 28, fontSize: 13 }}
                onClick={() => {
                  setConflict(false);
                  router.refresh();
                }}
              >
                내 수정 유지
              </button>
            </div>
          </div>
        )}

        <div className="field">
          <label htmlFor="d-title">제목</label>
          <input
            id="d-title"
            className="input"
            value={draft.title}
            disabled={!canEdit}
            onChange={(e) => set('title', e.target.value)}
          />
        </div>

        <div className="detail__row">
          <div className="field">
            <label htmlFor="d-start">시작</label>
            <input
              id="d-start"
              className="input"
              type={draft.allDay ? 'date' : 'datetime-local'}
              disabled={!canEdit}
              value={draft.start}
              onChange={(e) => set('start', e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="d-end">종료</label>
            <input
              id="d-end"
              className="input"
              type={draft.allDay ? 'date' : 'datetime-local'}
              disabled={!canEdit}
              value={draft.end}
              onChange={(e) => set('end', e.target.value)}
            />
          </div>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
          <input
            type="checkbox"
            checked={draft.allDay}
            disabled={!canEdit}
            onChange={(e) => toggleAllDay(e.target.checked)}
          />
          종일
        </label>

        <div className="detail__row">
          <div className="field">
            <label htmlFor="d-horizon">분류</label>
            <select
              id="d-horizon"
              className="select"
              value={draft.horizon}
              disabled={!canEdit}
              onChange={(e) => set('horizon', e.target.value as Horizon)}
            >
              {(Object.keys(HORIZON_LABEL) as Horizon[]).map((h) => (
                <option key={h} value={h}>
                  {HORIZON_LABEL[h]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="d-status">상태</label>
            <select
              id="d-status"
              className="select"
              value={draft.status}
              disabled={!canEdit}
              onChange={(e) => {
                const next = e.target.value as SchedStatus;
                setDraft((d) => ({
                  ...d,
                  status: next,
                  // 완료로 옮기면 진행률도 따라간다 — 둘이 어긋나면 차트가 거짓말을 한다
                  progress: next === 'done' ? 100 : d.progress,
                }));
              }}
            >
              {(Object.keys(STATUS_LABEL) as SchedStatus[]).map((k) => (
                <option key={k} value={k}>
                  {STATUS_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {!s.horizon_locked && predicted !== draft.horizon && (
          <p className="detail__hint">
            기간으로 보면 <b>{HORIZON_LABEL[predicted]}</b> 입니다. 그대로 두면 저장할 때 따라갑니다.
          </p>
        )}
        {s.horizon_locked && (
          <p className="detail__hint">분류를 직접 지정했습니다 — 기간이 바뀌어도 유지됩니다.</p>
        )}

        <div className="field">
          <label htmlFor="d-progress">진행률 · {draft.progress}%</label>
          <input
            id="d-progress"
            type="range"
            min={0}
            max={100}
            step={5}
            disabled={!canEdit}
            value={draft.progress}
            onChange={(e) => set('progress', Number(e.target.value))}
          />
        </div>

        <div className="field">
          <label htmlFor="d-phase">업무구분</label>
          <select
            id="d-phase"
            className="select"
            value={draft.phaseId}
            disabled={!canEdit}
            onChange={(e) => set('phaseId', e.target.value)}
          >
            <option value="">미지정</option>
            {props.phases.map((ph) => (
              <option key={ph.id} value={ph.id}>
                {ph.name}
              </option>
            ))}
          </select>
          <p className="detail__hint">로드맵에서 프로젝트 아래 어느 줄에 놓일지 정합니다.</p>
        </div>

        <div className="detail__row">
          <div className="field">
            <label htmlFor="d-team">팀</label>
            <select
              id="d-team"
              className="select"
              value={draft.teamId}
              disabled={!canEdit}
              onChange={(e) => set('teamId', e.target.value)}
            >
              <option value="">지정 안 함</option>
              {props.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="d-project">프로젝트</label>
            <select
              id="d-project"
              className="select"
              value={draft.projectId}
              disabled={!canEdit}
              onChange={(e) => set('projectId', e.target.value)}
            >
              <option value="">지정 안 함</option>
              {props.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label>담당자</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {props.members.map((m) => {
              const on = draft.assignees.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  className="chip"
                  disabled={!canEdit}
                  style={{
                    background: on ? 'var(--accent)' : undefined,
                    color: on ? 'var(--accent-ink)' : undefined,
                    borderColor: on ? 'var(--accent)' : undefined,
                    cursor: canEdit ? 'pointer' : 'default',
                  }}
                  onClick={() =>
                    set(
                      'assignees',
                      (on ? draft.assignees.filter((x) => x !== m.id) : [...draft.assignees, m.id]).sort(),
                    )
                  }
                >
                  {m.display_name ?? '이름 없음'}
                </button>
              );
            })}
          </div>
        </div>

        <div className="field">
          <label htmlFor="d-parent">상위 일정</label>
          <select
            id="d-parent"
            className="select"
            value={draft.parentId}
            disabled={!canEdit}
            onChange={(e) => set('parentId', e.target.value)}
          >
            <option value="">없음</option>
            {props.allSchedules
              .filter((x) => x.id !== s.id && x.parent_id !== s.id)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.title}
                </option>
              ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="d-desc">설명</label>
          <textarea
            id="d-desc"
            className="textarea"
            value={draft.description}
            disabled={!canEdit}
            onChange={(e) => set('description', e.target.value)}
          />
        </div>

        {/* 아래 둘은 목록 조작이라 누르는 즉시 반영된다 — 되돌릴 초안이 없다 */}
        <div className="field">
          <label>선행 · 후행</label>
          {deps.length ? (
            <div style={{ display: 'grid', gap: 4 }}>
              {deps.map((d) => {
                const other =
                  d.predecessor_id === s.id ? byId.get(d.successor_id) : byId.get(d.predecessor_id);
                const dir = d.predecessor_id === s.id ? '→ 이후' : '← 이전';
                return (
                  <span
                    key={`${d.predecessor_id}-${d.successor_id}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
                  >
                    <span className="mono" style={{ fontSize: 11 }}>
                      {dir}
                    </span>
                    <span style={{ flex: 1 }}>{other?.title ?? '(범위 밖)'}</span>
                    {canEdit && (
                      <button
                        className="btn btn--ghost"
                        style={{ height: 24, fontSize: 12 }}
                        onClick={() =>
                          startTx(async () => {
                            const res = await removeDependency(d.predecessor_id, d.successor_id);
                            if (!res.ok) onToast(res.error ?? '끊지 못했습니다.');
                          })
                        }
                      >
                        끊기
                      </button>
                    )}
                  </span>
                );
              })}
            </div>
          ) : (
            <p className="detail__hint">없음</p>
          )}

          {canEdit && (
            <select
              className="select"
              value=""
              onChange={(e) => {
                const target = e.target.value;
                if (!target) return;
                startTx(async () => {
                  const res = await addDependency(s.id, target);
                  if (!res.ok) onToast(res.error ?? '연결하지 못했습니다.');
                });
              }}
            >
              <option value="">이 일정 다음에 올 일정 추가…</option>
              {props.allSchedules
                .filter((x) => x.id !== s.id)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.title}
                  </option>
                ))}
            </select>
          )}
        </div>

        {canEdit && (
          <div className="field">
            <label htmlFor="d-comment">댓글</label>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const body = comment;
                startTx(async () => {
                  const res = await addComment(props.workspace.id, s.id, body);
                  if (!res.ok) return onToast(res.error ?? '남기지 못했습니다.');
                  setComments((c) => [
                    ...c,
                    { id: crypto.randomUUID(), body, created_at: new Date().toISOString() },
                  ]);
                  setComment('');
                });
              }}
              style={{ display: 'flex', gap: 6 }}
            >
              <input
                id="d-comment"
                className="input"
                placeholder="맥락을 남겨 두세요"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              <button className="btn" disabled={!comment.trim()}>
                등록
              </button>
            </form>
            {comments.map((c) => (
              <div className="detail__comment" key={c.id}>
                <b>나</b>
                <time>{format(new Date(c.created_at), 'M/d HH:mm')}</time>
                <div>{c.body}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="detail__foot">
        {error ? (
          <span className="detail__error" role="alert">
            {error}
          </span>
        ) : (
          <span className="mono" style={{ fontSize: 11 }}>
            {format(new Date(s.updated_at), 'M/d HH:mm')} 저장됨
          </span>
        )}
        <span style={{ flex: 1 }} />
        {canEdit && (
          <>
            <button
              className="btn btn--danger"
              onClick={() =>
                startTx(async () => {
                  const res = await deleteSchedule(s.id);
                  if (!res.ok) return onToast(res.error ?? '삭제하지 못했습니다.');
                  props.onClose();
                  onToast('삭제했습니다.');
                })
              }
            >
              삭제
            </button>
            <button
              className="btn"
              disabled={!dirty}
              onClick={() => {
                setDraft(base);
                setError(null);
              }}
            >
              되돌리기
            </button>
            <button className="btn btn--primary" disabled={!dirty} onClick={save}>
              수정
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
