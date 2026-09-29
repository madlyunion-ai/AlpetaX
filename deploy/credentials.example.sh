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

# ── 3. 구글 로그인 ───────────────────────────────────────────────────
# 메일을 쓰지 않는 로그인 수단입니다. 결제 없이 무료입니다.
#
#  1) https://console.cloud.google.com → 프로젝트 만들기 (이름 아무거나)
#  2) 좌측 'API 및 서비스' → 'OAuth 동의 화면'
#       User Type: 외부  /  앱 이름·지원 이메일만 채우고 저장
#       (테스트 모드로 두면 '테스트 사용자'에 넣은 주소만 로그인됩니다.
#        팀 전체가 쓰려면 '앱 게시'를 누르세요 — 심사 없이 바로 됩니다.)
#  3) '사용자 인증 정보' → '사용자 인증 정보 만들기' → 'OAuth 클라이언트 ID'
#       유형: 웹 애플리케이션
#       승인된 리디렉션 URI 에 아래 한 줄을 그대로 붙여 넣으세요:
#
#         https://iznjnqthavjzkfawtbfc.supabase.co/auth/v1/callback
#
#  4) 만들면 나오는 두 값을 아래에 넣으세요.
export GOOGLE_CLIENT_ID=''
export GOOGLE_CLIENT_SECRET=''

# ── 선택 ─────────────────────────────────────────────────────────────
# 이미 만들어 둔 Supabase 프로젝트를 쓰려면 그 이름과 DB 비밀번호를 적으세요.
# 비우면 alpetax-scheduler 라는 이름으로 서울 리전에 새로 만듭니다.
# export SUPABASE_PROJECT_NAME='alpetax-scheduler'
# export SUPABASE_DB_PASSWORD=''
