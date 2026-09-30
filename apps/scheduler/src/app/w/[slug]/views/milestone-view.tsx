'use client';

import { useMemo, useState, useTransition } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { milestoneStat, milestoneTiming } from '@/lib/schedule-core/milestone';
import type { Milestone, Project, Schedule } from '@/lib/schedule-core/types';
import { deleteMilestone, upsertMilestone } from '../../../actions';

interface Props {
  projects: Project[];
  milestones: Milestone[];
  schedules: Schedule[];
  workspaceId: string;
  canEdit: boolean;
  onToast: (msg: string) => void;
}

export function MilestoneView({ projects, milestones, schedules, workspaceId, canEdit, onToast }: Props) {
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [dueOn, setDueOn] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [desc, setDesc] = useState('');
  const [pending, start] = useTransition();

  /*
   * 고치는 중인 마일스톤의 초안.
   *
   * 입력할 때마다 저장하지 않는다 — 제목을 지웠다 다시 쓰는 도중의 값이
   * 저장되면 다른 사람 화면에 그 중간 상태가 그대로 보인다. 저장을 눌렀을
   * 때만 보낸다.
   */
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ title: '', dueOn: '', description: '', projectId: '' });

  function beginEdit(m: Milestone) {
    setEditing(m.id);
    setDraft({
      title: m.title,
      dueOn: m.due_on,
      description: m.description ?? '',
      projectId: m.project_id,
    });
  }

  function saveEdit(id: string) {
    if (!draft.title.trim()) return onToast('이름을 입력해 주세요.');
    start(async () => {
      const res = await upsertMilestone({
        id,
        workspaceId,
        projectId: draft.projectId,
        title: draft.title,
        dueOn: draft.dueOn,
        description: draft.description,
        // 상태는 여기서 건드리지 않는다 — '달성' 버튼이 따로 맡는다
        status: milestones.find((m) => m.id === id)?.status,
      });
      if (!res.ok) return onToast(res.error ?? '저장하지 못했습니다.');
      setEditing(null);
      onToast('마일스톤을 수정했습니다.');
    });
  }

  // 로드맵 호버 카드와 같은 계산을 쓴다(schedule-core/milestone.ts)
  const statFor = useMemo(() => (m: Milestone) => milestoneStat(m, schedules), [schedules]);

  function submit(projectId: string) {
    start(async () => {
      const res = await upsertMilestone({ workspaceId, projectId, title, dueOn, description: desc });
      if (!res.ok) return onToast(res.error ?? '만들지 못했습니다.');
      setTitle('');
      setDesc('');
      setAddingTo(null);
      onToast('마일스톤을 추가했습니다.');
    });
  }

  if (!projects.length) {
    return (
      <div className="empty">
        <b>프로젝트가 없습니다.</b>
        <span style={{ fontSize: 12 }}>왼쪽에서 프로젝트를 먼저 만들어 주세요.</span>
      </div>
    );
  }

  return (
    <div className="ms">
      {projects.map((p) => {
        const list = milestones
          .filter((m) => m.project_id === p.id)
          .sort((a, b) => a.due_on.localeCompare(b.due_on));

        return (
          <section className="panel ms__proj" key={p.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h3 className="ms__projname" style={{ flex: 1 }}>
                {p.name}
              </h3>
              {canEdit && (
                <button
                  className="btn btn--ghost"
                  style={{ height: 26, fontSize: 12 }}
                  onClick={() => setAddingTo(addingTo === p.id ? null : p.id)}
                >
                  + 마일스톤
                </button>
              )}
            </div>

            {addingTo === p.id && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submit(p.id);
                }}
                style={{ display: 'grid', gap: 6, marginBottom: 10 }}
              >
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    className="input"
                    autoFocus
                    required
                    maxLength={120}
                    placeholder="예: 베타 오픈"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                  <input
                    className="input"
                    type="date"
                    required
                    style={{ width: 150 }}
                    value={dueOn}
                    onChange={(e) => setDueOn(e.target.value)}
                  />
                  <button className="btn btn--primary" disabled={pending}>
                    추가
                  </button>
                </div>
                {/* 만들 때도 설명을 받는다 — 고칠 때만 받으면 왜 지금은 없냐가 된다 */}
                <textarea
                  className="textarea"
                  rows={2}
                  maxLength={500}
                  placeholder="설명 (선택) — 로드맵에서 이 표시에 마우스를 올리면 보입니다."
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                />
              </form>
            )}

            {list.length ? (
              <div className="ms__track">
                {list.map((m) => {
                  const due = new Date(`${m.due_on}T00:00:00`);
                  const stat = statFor(m);
                  const late = stat.late;
                  const pct = stat.progress;

                  if (editing === m.id) {
                    return (
                      <form
                        className="ms__edit"
                        key={m.id}
                        onSubmit={(e) => {
                          e.preventDefault();
                          saveEdit(m.id);
                        }}
                      >
                        <div className="ms__editrow">
                          <label className="field">
                            <span>이름</span>
                            <input
                              className="input"
                              autoFocus
                              required
                              maxLength={120}
                              value={draft.title}
                              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                            />
                          </label>
                          <label className="field" style={{ maxWidth: 170 }}>
                            <span>마감일</span>
                            <input
                              className="input"
                              type="date"
                              required
                              value={draft.dueOn}
                              onChange={(e) => setDraft({ ...draft, dueOn: e.target.value })}
                            />
                          </label>
                        </div>

                        <label className="field">
                          <span>프로젝트</span>
                          <select
                            className="select"
                            value={draft.projectId}
                            onChange={(e) => setDraft({ ...draft, projectId: e.target.value })}
                          >
                            {projects.map((pr) => (
                              <option key={pr.id} value={pr.id}>
                                {pr.name}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="field">
                          <span>설명 (선택)</span>
                          <textarea
                            className="textarea"
                            rows={2}
                            maxLength={500}
                            placeholder="로드맵에서 이 표시에 마우스를 올리면 보입니다."
                            value={draft.description}
                            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                          />
                        </label>

                        <div className="ms__editfoot">
                          <button className="btn btn--primary" disabled={pending}>
                            저장
                          </button>
                          <button type="button" className="btn" onClick={() => setEditing(null)}>
                            취소
                          </button>
                        </div>
                      </form>
                    );
                  }

                  return (
                    <div className="ms__item" key={m.id}>
                      <span className="ms__date">
                        {format(due, 'M/d', { locale: ko })}
                        <br />
                        <span style={{ fontSize: 10 }}>{format(due, 'yyyy')}</span>
                      </span>

                      <span>
                        <span className="ms__title">{m.title}</span>
                        <span className="ms__meta" style={{ display: 'block' }}>
                          {milestoneTiming(stat, m.status)}
                          {pct !== null && ` · 관련 일정 ${stat.relatedCount}건 · ${pct}%`}
                        </span>
                      </span>

                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {late && <span className="chip" style={{ color: 'var(--warn)' }}>지연</span>}
                        <span
                          className="ms__ring"
                          style={{ ['--pct' as string]: String(pct ?? 0) }}
                          title={pct === null ? '관련 일정 없음' : `${pct}%`}
                        >
                          <span>{pct ?? '–'}</span>
                        </span>
                        {canEdit && (
                          <>
                            <button
                              className="btn btn--ghost"
                              style={{ height: 24, fontSize: 11 }}
                              onClick={() => beginEdit(m)}
                            >
                              수정
                            </button>
                            <button
                              className="btn btn--ghost"
                              style={{ height: 24, fontSize: 11 }}
                              onClick={() =>
                                start(async () => {
                                  const next = m.status === 'reached' ? 'upcoming' : 'reached';
                                  const res = await upsertMilestone({
                                    id: m.id,
                                    workspaceId,
                                    projectId: p.id,
                                    title: m.title,
                                    dueOn: m.due_on,
                                    status: next,
                                  });
                                  if (!res.ok) onToast(res.error ?? '바꾸지 못했습니다.');
                                })
                              }
                            >
                              {m.status === 'reached' ? '되돌리기' : '달성'}
                            </button>
                            <button
                              className="btn btn--ghost btn--danger"
                              style={{ height: 24, fontSize: 11 }}
                              onClick={() =>
                                start(async () => {
                                  const res = await deleteMilestone(m.id);
                                  if (!res.ok) onToast(res.error ?? '삭제하지 못했습니다.');
                                })
                              }
                            >
                              삭제
                            </button>
                          </>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style={{ color: 'var(--ink-3)', fontSize: 12, margin: 0 }}>
                마일스톤이 없습니다. 기준이 되는 날짜를 찍어 두면 타임라인에 수직선으로 표시됩니다.
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
