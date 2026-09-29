# TeamSync — 배포 가이드 (Supabase + Vercel)

앱 코드는 [apps/scheduler/](../../apps/scheduler/), DB 마이그레이션은 [supabase/migrations/](../../supabase/migrations/)에 있습니다.
아래 4단계는 **계정 자격증명이 필요해 제가 대신 실행할 수 없는 부분**입니다. 순서대로 15분이면 끝납니다.

---

## 0. 브랜치 병합

앱 코드는 `feat/team-scheduler` 브랜치에 올라가 있습니다.
Vercel은 기본적으로 `main` 을 프로덕션으로 빌드하므로, 먼저 병합하세요.

<https://github.com/madlyunion-ai/AlpetaX/pull/new/feat/team-scheduler>

> 병합 전에도 Vercel이 이 브랜치로 **프리뷰 배포**를 만들어 줍니다.
> 먼저 프리뷰에서 확인한 뒤 병합하는 편이 안전합니다.

---

## 1. Supabase 프로젝트 만들기

1. <https://supabase.com/dashboard> → **New project**
2. Region은 **Northeast Asia (Seoul)** 을 고르세요. Vercel 배포 지역(`icn1`)과 맞춰야 왕복 지연이 줄어듭니다.
3. 생성 후 **SQL Editor** 에서 아래 네 파일을 **번호 순서대로** 붙여넣고 각각 Run:

   | 순서 | 파일 | 내용 |
   |---|---|---|
   | 1 | [`supabase/migrations/0001_init.sql`](../../supabase/migrations/0001_init.sql) | 테이블, 열거형, 인덱스, 순환 의존성 차단 트리거 |
   | 2 | [`supabase/migrations/0002_rls.sql`](../../supabase/migrations/0002_rls.sql) | RLS 정책 전체 |
   | 3 | [`supabase/migrations/0003_functions.sql`](../../supabase/migrations/0003_functions.sql) | 범위 조회 RPC, 워크스페이스 부트스트랩, 초대, Realtime |
   | 4 | [`supabase/migrations/0004_phases.sql`](../../supabase/migrations/0004_phases.sql) | 업무구분(`phases`), `schedules.phase_id`, `projects.color`, 기본 업무구분 5개 |

   > Supabase CLI를 쓴다면 `supabase link --project-ref <ref> && supabase db push` 로 대체할 수 있습니다.

4. **Project Settings → API** 에서 두 값을 복사해 둡니다.
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` 키 → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

   `service_role` 키는 **쓰지 않습니다.** 이 앱은 모든 접근을 RLS로 통제하므로 서버에서도 anon 키만 씁니다.

---

## 2. 인증 설정

**Authentication → URL Configuration**

| 항목 | 값 |
|---|---|
| Site URL | `https://<your-app>.vercel.app` |
| Redirect URLs | `https://<your-app>.vercel.app/auth/callback`<br>`http://localhost:3000/auth/callback` |

**Authentication → Providers → Email**: `Enable Email provider` 켜기, `Confirm email` 켜기.
비밀번호 없이 매직링크만 씁니다.

> 무료 플랜의 기본 메일 발송은 시간당 건수 제한이 있습니다. 실사용 전에
> **Authentication → SMTP Settings** 에서 자체 SMTP(Resend, SendGrid 등)를 연결하세요.

---

## 3. Vercel 배포

1. <https://vercel.com/new> → GitHub 저장소 `madlyunion-ai/AlpetaX` 임포트
2. **Root Directory 를 `apps/scheduler` 로 지정** — 이게 가장 중요합니다.
   저장소 루트에는 기존 Vite 앱이 있어서, 루트로 두면 엉뚱한 앱이 빌드됩니다.
3. Framework Preset은 자동으로 **Next.js** 로 잡힙니다.
4. **Environment Variables** 에 3개 등록 (Production · Preview · Development 모두 체크):

   ```
   NEXT_PUBLIC_SUPABASE_URL       = https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY  = eyJhbGciOi...
   NEXT_PUBLIC_SITE_URL           = https://<your-app>.vercel.app
   ```

   `NEXT_PUBLIC_SITE_URL` 은 매직링크가 돌아올 주소입니다. 배포 도메인이 정해진 뒤
   값을 채우고 **한 번 더 재배포**해야 로그인이 정상 동작합니다.

5. Deploy.

---

## 4. 첫 로그인

1. 배포 주소 접속 → `/login` 으로 이동됩니다.
2. 이메일 입력 → 메일함의 링크 클릭.
3. 워크스페이스 이름과 주소를 입력하면 기본 팀(기획·디자인·개발), 기본 업무구분(기획·분석·UI·UX·개발·운영), 첫 프로젝트가 함께 생성됩니다.
4. 첫 화면은 **로드맵**입니다 — 년/월/주 3단 헤더에 구분별 띠가 쌓입니다.
5. **+ 일정** 버튼으로 추가 폼을 엽니다. 제목과 기간만 필수이고,
   **업무구분**을 지정하면 로드맵의 해당 줄로 들어갑니다.

### 설정 화면

우측 상단 **설정**에서 아래를 직접 관리합니다 — SQL 을 만질 필요가 없습니다.

| 탭 | 할 수 있는 것 |
|---|---|
| 업무구분 | 추가·이름·색·순서 변경·삭제 (로드맵 줄 순서가 여기서 정해집니다) |
| 팀 | 추가·이름·색·삭제, 팀 구성원 배정 |
| 프로젝트 | 이름·색 변경, 보관/복원 (색은 로드맵 좌측 세로 띠) |
| 멤버 | 역할 변경, 내보내기, 초대 링크 생성·복사·취소 |

수정은 **소유자·관리자**만 가능하고, 일반 멤버에게는 읽기 전용으로 보입니다.
마지막 소유자는 강등하거나 내보낼 수 없습니다.

---

## 로컬 개발

```bash
cd apps/scheduler
cp .env.example .env.local     # 값을 채웁니다 (SITE_URL 은 http://localhost:3000)
npm install
npm run dev                    # http://localhost:3000
```

| 명령 | 용도 |
|---|---|
| `npm test` | `schedule-core` 단위 테스트 54개 (레인 배정·패킹, 겹침 분할, 스케일, 트리, 공휴일, 마일스톤, 지연 판정, 업무량) |
| `npm run typecheck` | 타입 검사 |
| `npm run build` | 프로덕션 빌드 — 배포 전 여기서 먼저 확인 |

---

## 멤버 초대

현재 초대는 **링크 방식**입니다. 초대 메일 자동 발송은 붙이지 않았습니다.

1. **설정 → 멤버 → 초대**에서 이메일과 역할을 넣고 초대를 만듭니다.
2. 목록에 뜬 초대의 **링크 복사**를 눌러 상대에게 전달합니다 (`/invite/<토큰>`).
3. 상대가 **초대받은 이메일 계정으로** 로그인하면 자동으로 멤버가 됩니다.
   다른 계정으로 열면 거부됩니다 — 링크가 유출돼도 남의 이메일로는 들어올 수 없습니다.

메일 자동 발송이 필요하면 Supabase Edge Function + Resend를 붙이는 것이 다음 단계입니다.

---

## 배포 후 확인할 것

- [ ] 두 개의 다른 계정으로 각각 워크스페이스를 만들고, 서로의 일정이 **보이지 않는지** 확인 (RLS 검증)
- [ ] 한 일정을 두 브라우저에서 동시에 열고 양쪽에서 수정 → 나중 쪽에 충돌 배너가 뜨는지
- [ ] 한쪽에서 일정을 추가하면 다른 쪽 화면이 새로고침 없이 갱신되는지 (Realtime)
- [ ] 타임라인에서 스케일을 `분기`로 바꿨을 때 단기 섹션이 자동으로 접히는지
- [ ] 로드맵에서 기간이 겹치는 일정들이 서로 다른 줄(레인)로 갈라지는지
- [ ] 일반 멤버 계정으로 설정 화면에 들어가면 읽기 전용으로 보이는지
- [ ] 우측 상단 **지연** 스위치를 껐을 때 항목이 사라지지 않고 색만 제 색으로 돌아가는지

## 알려진 제약

- 댓글은 작성 후 패널에 즉시 보이지만, 기존 댓글 목록을 서버에서 다시 읽어오지는 않습니다 (P1 잔여 작업).
- 의존성 화살표는 선행 일정이 현재 조회 범위 안에 있을 때만 그려집니다. 범위 밖 연결은 상세 패널에 `(범위 밖)` 으로 표시됩니다.
- 반복 일정, ICS 구독, Slack 알림은 로드맵 M7 항목으로 아직 없습니다.
- 로드맵 뷰는 바 드래그 이동을 아직 지원하지 않습니다(타임라인 뷰에서는 됩니다).
