export type Horizon = 'long' | 'mid' | 'short';
export type SchedStatus = 'planned' | 'active' | 'blocked' | 'done' | 'cancelled';
export type MilestoneStatus = 'upcoming' | 'reached' | 'missed';
export type MemberRole = 'owner' | 'admin' | 'member' | 'guest';
export type DepType = 'finish_to_start' | 'start_to_start' | 'finish_to_finish';

export type ViewKind =
  | 'roadmap'
  | 'month'
  | 'week'
  | 'day'
  | 'timeline'
  | 'milestone'
  | 'workload';
export type TimeScale = 'day' | 'week' | 'month' | 'quarter';

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  plan: string;
}

export interface Membership {
  id: string;
  workspace_id: string;
  user_id: string;
  role: MemberRole;
  display_name: string | null;
  avatar_url: string | null;
}

export interface Team {
  id: string;
  workspace_id: string;
  name: string;
  color: string;
}

/**
 * 업무 단계. 로드맵 뷰 좌측 두 번째 열의 행이 된다.
 * 기본값은 기획 / 분석 / UI·UX / 개발 / 운영.
 */
export interface Phase {
  id: string;
  workspace_id: string;
  name: string;
  color: string;
  sort_order: number;
}

export interface Project {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  starts_on: string | null;
  ends_on: string | null;
  archived_at: string | null;
  /** 로드맵 1열 세로 띠의 색 */
  color: string;
}

export interface Schedule {
  id: string;
  workspace_id: string;
  project_id: string | null;
  team_id: string | null;
  phase_id: string | null;
  parent_id: string | null;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string;
  all_day: boolean;
  horizon: Horizon;
  horizon_locked: boolean;
  status: SchedStatus;
  progress: number;
  sort_order: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Milestone {
  id: string;
  workspace_id: string;
  project_id: string;
  title: string;
  description: string | null;
  due_on: string;
  status: MilestoneStatus;
}

export interface Comment {
  id: string;
  schedule_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

export interface Dependency {
  predecessor_id: string;
  successor_id: string;
  type: DepType;
}

export interface Filters {
  projectIds: string[] | null;
  teamIds: string[] | null;
  phaseIds: string[] | null;
  assigneeIds: string[] | null;
}

export const HORIZON_LABEL: Record<Horizon, string> = {
  long: '장기',
  mid: '중기',
  short: '단기',
};

export const STATUS_LABEL: Record<SchedStatus, string> = {
  planned: '예정',
  active: '진행중',
  blocked: '지연',
  done: '완료',
  cancelled: '취소',
};

export const ROLE_LABEL: Record<MemberRole, string> = {
  owner: '소유자',
  admin: '관리자',
  member: '멤버',
  guest: '게스트',
};
