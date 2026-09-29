# ─────────────────────────────────────────────────────────────────────
#  이 파일을 credentials.sh 로 복사한 뒤 토큰 두 개만 채우세요.
#  credentials.sh 는 .gitignore 에 걸려 있어 커밋되지 않습니다.
#
#  URL·API 키·DB 비밀번호는 적지 않습니다 — 스크립트가 직접 받아 옵니다.
#  Git 연동도 필요 없습니다. 저장소가 아니라 로컬 디렉터리를 올립니다.
# ─────────────────────────────────────────────────────────────────────

# ── 1. Supabase ──────────────────────────────────────────────────────
# https://supabase.com/dashboard/account/tokens → Generate new token
# 프로젝트 생성과 마이그레이션 적용에 씁니다.
export SUPABASE_ACCESS_TOKEN=''

# ── 2. Vercel ────────────────────────────────────────────────────────
# https://vercel.com/account/tokens → Create Token
# 기간을 짧게 잡으세요. 배포가 끝나면 폐기하시라고 안내해 드립니다.
export VERCEL_TOKEN=''

# 팀 계정에 배포할 때만 채우세요. 개인 계정이면 비워 둡니다.
export VERCEL_SCOPE=''

# ── 3. 메일 발송 (Resend) ────────────────────────────────────────────
# https://resend.com → 가입 → API Keys → Create API Key
# Supabase 기본 발송은 시간당 2통이라 팀을 한꺼번에 들일 수 없습니다.
# 이 키를 넣으면 SMTP 를 붙이고 한도도 함께 올립니다.
export RESEND_API_KEY=''

# 보내는 주소. 비우면 onboarding@resend.dev (시험용) 를 씁니다.
# 시험용 주소는 Resend 가입에 쓴 본인 메일로만 발송됩니다 — 팀원에게 보내려면
# Resend → Domains 에서 자기 도메인을 인증한 뒤 그 도메인 주소를 적으세요.
export RESEND_FROM=''
export RESEND_FROM_NAME='TeamSync'

# ── 선택 ─────────────────────────────────────────────────────────────
# 이미 만들어 둔 Supabase 프로젝트를 쓰려면 그 이름과 DB 비밀번호를 적으세요.
# 비우면 alpetax-scheduler 라는 이름으로 서울 리전에 새로 만듭니다.
# export SUPABASE_PROJECT_NAME='alpetax-scheduler'
# export SUPABASE_DB_PASSWORD=''
