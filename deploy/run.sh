#!/usr/bin/env bash
#
# 배포 전체를 한 번에.
#   ① Supabase 프로젝트 생성 + 마이그레이션
#   ② Vercel 프로젝트 생성 + 환경변수
#   ③ 배포 → 주소 확보 → 로그인 주소 등록 → 재배포
#
# Git 연동을 쓰지 않는다. 저장소가 아니라 이 디렉터리를 그대로 올리므로
# 브랜치가 무엇이든, 앱이 하위 폴더에 있든 상관없다.
#
# 앞 단계가 실패하면 멈춘다 — DB 없이 배포하면 앱은 뜨지만 모든 화면이 빈다.
# 그 상태가 "배포 성공" 으로 보여서 더 헷갈린다.
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"

if [ ! -f deploy/credentials.sh ]; then
  echo "deploy/credentials.sh 가 없습니다."
  echo "deploy/credentials.example.sh 를 복사해 토큰 두 개를 채우세요."
  exit 1
fi
# shellcheck disable=SC1091
source deploy/credentials.sh

need() {
  if [ -z "${!1:-}" ]; then echo "credentials.sh 에 $1 이 비어 있습니다."; exit 1; fi
}
need SUPABASE_ACCESS_TOKEN
need VERCEL_TOKEN

SCOPE_ARG=()
if [ -n "${VERCEL_SCOPE:-}" ]; then SCOPE_ARG=(--scope "$VERCEL_SCOPE"); fi

echo "══ ① Supabase ═══════════════════════════════════════════"
node deploy/provision.mjs

SUPABASE_URL=$(node -p "require('./deploy/.provisioned.json').NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY=$(node -p "require('./deploy/.provisioned.json').NEXT_PUBLIC_SUPABASE_ANON_KEY")

# 여기까지 왔는데 키가 secret 이면 브라우저 번들에 RLS 우회 키가 박힌다.
# 배포되고 나면 키를 폐기하기 전까지 되돌릴 수 없으므로 멈춘다.
case "$SUPABASE_KEY" in
  sb_secret_*|*service_role*)
    echo "중단: publishable 이 아닌 키를 받았습니다."; exit 1 ;;
esac

echo
echo "══ ② Vercel 연결 ════════════════════════════════════════"
cd "$ROOT/apps/scheduler"

V() { npx --yes vercel@latest "$@" --token "$VERCEL_TOKEN" "${SCOPE_ARG[@]}"; }

# --yes: 대화형 질문을 넘긴다. 이 셸은 stdin 이 없어 물어보면 그대로 멈춘다.
V link --yes --project alpetax-scheduler >/dev/null
echo "  프로젝트 alpetax-scheduler 연결됨"

# 넣기 전에 지운다 — vercel env add 는 같은 키가 있으면 실패한다.
put_env() {
  local key="$1" val="$2"
  for target in production preview development; do
    V env rm "$key" "$target" --yes >/dev/null 2>&1 || true
    printf '%s' "$val" | V env add "$key" "$target" >/dev/null
  done
  echo "  $key 등록"
}
put_env NEXT_PUBLIC_SUPABASE_URL      "$SUPABASE_URL"
put_env NEXT_PUBLIC_SUPABASE_ANON_KEY "$SUPABASE_KEY"

echo
echo "══ ③ 배포 ═══════════════════════════════════════════════"
# NEXT_PUBLIC_SITE_URL 은 배포 주소가 정해진 뒤에야 알 수 있다. 그래서 두 번 올린다:
# 먼저 올려 주소를 얻고, 그 값을 넣어 다시 올린다. 이 값이 비면 매직링크가
# 돌아올 곳을 몰라 로그인이 끝나지 않는다.
echo "  1차 — 주소를 받기 위해"
URL=$(V deploy --prod --yes 2>/dev/null | tail -1)
echo "     $URL"

echo "  로그인 주소 등록 후 2차"
put_env NEXT_PUBLIC_SITE_URL "$URL"
FINAL=$(V deploy --prod --yes 2>/dev/null | tail -1)

REF=$(node -p "require('$ROOT/deploy/.provisioned.json').PROJECT_REF")

echo
echo "════════════════════════════════════════════════════════"
echo " 배포 완료"
echo "   앱        $FINAL"
echo "   Supabase  https://supabase.com/dashboard/project/$REF"
echo "════════════════════════════════════════════════════════"
echo
echo "마지막 한 가지 — 대시보드에서 직접 켜셔야 합니다:"
echo
echo "  Authentication → URL Configuration"
echo "    Site URL      : $FINAL"
echo "    Redirect URLs : $FINAL/auth/callback"
echo "                    http://localhost:3000/auth/callback"
echo
echo "  Authentication → Providers → Email : Enable"
echo
echo "이 둘이 없으면 매직링크가 차단되어 로그인이 되지 않습니다."
echo
echo "배포가 끝났으니 Vercel 토큰은 폐기하세요:"
echo "  https://vercel.com/account/tokens"
