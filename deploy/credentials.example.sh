# ─────────────────────────────────────────────────────────────────────
#  이 파일을 credentials.sh 로 복사한 뒤 값을 채우세요.
#  credentials.sh 는 .gitignore 에 걸려 있어 커밋되지 않습니다.
#  값을 채운 다음 "적용해줘" 라고만 말씀하시면 나머지는 제가 실행합니다.
# ─────────────────────────────────────────────────────────────────────

# ── 1. Supabase ──────────────────────────────────────────────────────
# 대시보드 → Project Settings → API
#   Project URL
export NEXT_PUBLIC_SUPABASE_URL='https://xxxxxxxxxxxxxxxx.supabase.co'
#   두 종류가 보이면 'publishable' 쪽입니다 (sb_publishable_... 로 시작).
#   예전 이름이 'anon public' 이라 변수명은 그대로 두었습니다.
#
#   'secret' 키(sb_secret_...)는 절대 넣지 마세요. 그 키는 RLS 를 우회하는데,
#   NEXT_PUBLIC_ 이 붙은 값은 브라우저로 그대로 나갑니다.
export NEXT_PUBLIC_SUPABASE_ANON_KEY='sb_publishable_...'

# 대시보드 → Connect → ORMs / Session pooler 의 연결 문자열.
# 마이그레이션(테이블·RLS 생성)에만 씁니다 — 앱은 이 값을 쓰지 않습니다.
# [YOUR-PASSWORD] 자리에 프로젝트 만들 때 정한 DB 비밀번호를 넣으세요.
export SUPABASE_DB_URL='postgresql://postgres.xxxx:[YOUR-PASSWORD]@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres'

# ── 2. Vercel ────────────────────────────────────────────────────────
# https://vercel.com/account/tokens → Create Token
# Scope 는 이 프로젝트를 만들 팀/개인 계정으로, 기간은 짧게 잡으세요.
export VERCEL_TOKEN='...'

# 팀 계정에 배포할 때만 채우세요. 개인 계정이면 비워 둡니다.
export VERCEL_SCOPE=''
