'use client'

import { useState, useTransition } from 'react'
import { useQuietScroll } from '@/lib/hooks/use-quiet-scroll'
import { createProject } from '../../actions'
import { TeamSyncLogo } from './logo'
import type { Filters, Membership, Phase, Project, Team } from '@/lib/schedule-core/types'

interface Props {
  workspaceSlug: string
  projects: Project[]
  teams: Team[]
  phases: Phase[]
  members: Membership[]
  filters: Filters
  workspaceId: string
  onChange: (patch: Record<string, string | null>) => void
  onToast: (msg: string) => void
}

/**
 * 필터 값의 세 상태를 URL 하나로 표현한다.
 *   키 없음(null) = 전부 선택 — 첫 진입의 기본값
 *   "a,b"         = 그 항목만
 *   "-"           = 전부 해제(아무것도 안 보임)
 *
 * 전부 선택을 "키 없음"으로 두는 이유: 기본 상태에서 쿼리스트링이 깨끗하고,
 * 나중에 항목이 추가돼도 "전부"의 의미가 자동으로 따라온다.
 */
function nextValue(selected: string[] | null, allIds: string[], id: string): string | null {
  const current = selected ?? allIds
  const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
  if (next.length === allIds.length) return null
  if (next.length === 0) return '-'
  return next.join(',')
}

interface FilterItem {
  id: string
  name: string
  color?: string
}

function FilterGroup({
  label,
  paramKey,
  items,
  selected,
  onChange,
  emptyText,
  children,
}: {
  label: string
  paramKey: string
  items: FilterItem[]
  selected: string[] | null
  onChange: Props['onChange']
  emptyText: string
  children?: React.ReactNode
}) {
  const allIds = items.map((i) => i.id)
  const current = selected ?? allIds
  const allOn = allIds.length > 0 && current.length === allIds.length

  return (
    <div className="sidebar__group">
      <div className="sidebar__grouphead">
        <h3>{label}</h3>
        {items.length > 0 && (
          <button
            type="button"
            className="sidebar__all"
            onClick={() => onChange({ [paramKey]: allOn ? '-' : null })}
          >
            {allOn ? '전체 해제' : '전체 선택'}
          </button>
        )}
      </div>

      {items.map((item) => {
        const on = current.includes(item.id)
        return (
          <label className="sidebar__item" key={item.id} data-on={on}>
            <input
              type="checkbox"
              className="sidebar__box"
              checked={on}
              onChange={() => onChange({ [paramKey]: nextValue(selected, allIds, item.id) })}
            />
            {item.color && <span className="sidebar__dot" style={{ background: item.color }} />}
            <span className="sidebar__name">{item.name}</span>
          </label>
        )
      })}

      {!items.length && <p className="sidebar__empty">{emptyText}</p>}
      {children}
    </div>
  )
}

export function Sidebar({
  projects,
  teams,
  phases,
  members,
  filters,
  workspaceId,
  onChange,
  onToast,
}: Props) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [pending, start] = useTransition()
  const scrollRef = useQuietScroll<HTMLDivElement>()

  function addProject(e: React.FormEvent) {
    e.preventDefault()
    start(async () => {
      const res = await createProject(workspaceId, name)
      if (!res.ok) return onToast(res.error ?? '만들지 못했습니다.')
      setName('')
      setAdding(false)
      onToast('프로젝트를 만들었습니다.')
    })
  }

  return (
    <nav className="sidebar" aria-label="필터">
      {/* 상단 헤더가 없어진 자리 — 브랜드와 프로젝트 선택이 여기로 왔다 */}
      <div className="sidebar__brandbox">
        <TeamSyncLogo className="sidebar__logo" />
        <select
          className="select"
          value={filters.projectIds?.length === 1 ? filters.projectIds[0] : ''}
          onChange={(e) => onChange({ projects: e.target.value || null })}
          aria-label="프로젝트 선택"
        >
          <option value="">전체 프로젝트</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="sidebar__list quiet-scroll" ref={scrollRef}>
        <FilterGroup
          label="프로젝트"
          paramKey="projects"
          items={projects.map((p) => ({ id: p.id, name: p.name, color: p.color }))}
          selected={filters.projectIds}
          onChange={onChange}
          emptyText="프로젝트가 없습니다."
        >
          {adding ? (
            <form onSubmit={addProject} style={{ display: 'grid', gap: 4, padding: '4px 4px 0' }}>
              <input
                className="input"
                autoFocus
                required
                placeholder="프로젝트 이름"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setAdding(false)}
              />
              <button className="btn btn--primary" style={{ height: 28 }} disabled={pending}>
                추가
              </button>
            </form>
          ) : (
            <button type="button" className="sidebar__add" onClick={() => setAdding(true)}>
              + 새 프로젝트
            </button>
          )}
        </FilterGroup>

        <FilterGroup
          label="업무구분"
          paramKey="phases"
          items={phases.map((p) => ({ id: p.id, name: p.name, color: p.color }))}
          selected={filters.phaseIds}
          onChange={onChange}
          emptyText="업무구분이 없습니다."
        />

        <FilterGroup
          label="팀"
          paramKey="teams"
          items={teams.map((t) => ({ id: t.id, name: t.name, color: t.color }))}
          selected={filters.teamIds}
          onChange={onChange}
          emptyText="팀이 없습니다."
        />

        <FilterGroup
          label="담당자"
          paramKey="assignees"
          items={members.map((m) => ({ id: m.id, name: m.display_name ?? '이름 없음' }))}
          selected={filters.assigneeIds}
          onChange={onChange}
          emptyText="멤버가 없습니다."
        />
      </div>
    </nav>
  )
}
