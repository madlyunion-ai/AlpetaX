# TeamSync — 구현 로드맵

- Feature: `team-scheduler`
- 참조: [Plan](../01-plan/team-scheduler-plan.md) · [데이터 모델](./team-scheduler-data-model.md) · [UI](./team-scheduler-ui.md)

## 마일스톤

| # | 목표 | 산출물 | 완료 기준 |
|---|---|---|---|
| M1 | 기반 | 모노레포 분리(`apps/scheduler`, `packages/schedule-core`), Supabase 프로젝트, `0001_init.sql`, RLS | 마이그레이션 적용 후 다른 워크스페이스 데이터가 조회되지 않음을 테스트로 증명 |
| M2 | 인증·테넌시 | Supabase Auth(이메일 매직링크), 워크스페이스 생성, 멤버 초대, 역할 부여 | 초대 링크로 가입한 멤버가 자기 워크스페이스만 봄 |
| M3 | 일정 CRUD + 월 뷰 | `schedules_in_range`, Server Actions, 월 뷰, 상세 패널 | P0 스토리 1·2·5 통과 |
| M4 | 주·일 뷰 | 시간 그리드, 겹침 열 분할, now indicator, 드래그 생성 | P0 스토리 3 통과 |
| M5 | 타임라인 + 마일스톤 | horizon 3섹션, 4단 스케일, 바 드래그·리사이즈, 의존성 화살표, 마일스톤 마커 | P0 스토리 4·6 통과, 1,000건 렌더 200ms 이내 |
| M6 | 협업 | Realtime 구독, 낙관적 락 충돌 UI, 댓글, 팀·담당자 필터 | P1 스토리 7~11 통과 |
| M7 | 출시 준비 | 대시보드, 알림(Slack/메일), ICS 구독, 요금제 게이트 | P2 스토리 12~15 |

의존 관계: M1 → M2 → M3 → (M4 ∥ M5) → M6 → M7. M4와 M5는 `schedule-core`의 스케일 함수만 공유하므로 병렬 가능하다.

## 먼저 검증할 것 (M1 착수 전 스파이크)

1. **간트 렌더 성능** — 1,000건 더미로 가상 스크롤 프로토타입. 목표 미달이면 Canvas 렌더링으로 전환 판단.
2. **RLS 쿼리 플랜** — `auth_workspace_ids()`가 `in (select …)` 안에서 행마다 재평가되지 않는지 `explain analyze`로 확인.
3. **GiST 범위 인덱스 적중** — `schedules_in_range`가 `&&` 연산에서 인덱스를 타는지 확인(안 타면 `start_at`/`end_at` 복합 인덱스로 대체).

세 스파이크 모두 버리는 코드다. 여기서 실패하면 M5 설계를 바꿔야 하므로 순서를 앞당긴다.

## 테스트 전략

| 대상 | 방법 |
|---|---|
| `schedule-core` (레인 배정, 스케일, horizon 추론, 자연어 파서) | Vitest 단위 테스트. 뷰 없이 전부 검증 가능 — 커버리지 90% 목표 |
| RLS | 역할별(owner/admin/member/guest) 시나리오를 SQL 테스트로 고정. 교차 워크스페이스 접근은 반드시 0행 |
| Server Actions | 낙관적 락 충돌, 순환 의존성 거부, 권한 없는 삭제 거부 |
| 뷰 | Playwright — 일정 생성 5초 경로, 드래그 이동 후 값 반영, 뷰 전환 시 URL 복원 |

## 결정 대기 항목

- 기존 `apps/alpetax`와 스케줄러가 같은 도메인·같은 인증을 공유할지, 완전히 분리된 제품일지. 분리라면 모노레포 대신 신규 저장소가 더 단순하다.
- 요금제 경계(무료 플랜의 멤버 수·프로젝트 수 상한). M7 전까지는 정하지 않아도 진행에 지장 없다.
