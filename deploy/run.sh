#!/usr/bin/env bash
#
# 배포 한 번에 실행.
#   ① Supabase 마이그레이션  ② Vercel 프로젝트·환경변수  ③ 프로덕션 배포
#
# 앞 단계가 실패하면 멈춘다 — DB 가 준비되지 않은 채 배포하면 앱은 뜨지만
# 모든 화면이 빈다. 그 상태는 "배포 성공" 으로 보여서 더 헷갈린다.
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"

if [ ! -f deploy/credentials.sh ]; then
  echo "deploy/credentials.sh 가 없습니다."
  echo "deploy/credentials.example.sh 를 복사해 값을 채우세요."
  exit 1
fi
# shellcheck disable=SC1091
source deploy/credentials.sh

need() {
  if [ -z "${!1:-}" ]; then echo "credentials.sh 에 $1 이 비어 있습니다."; exit 1; fi
}
need NEXT_PUBLIC_SUPABASE_URL
need NEXT_PUBLIC_SUPABASE_ANON_KEY
need SUPABASE_DB_URL
need VERCEL_TOKEN

# secret 키를 넣으면 RLS 를 우회하는 키가 브라우저 번들에 박힌다.
# 배포되고 나면 키를 폐기하기 전까지 되돌릴 방법이 없으므로 여기서 멈춘다.
case "$NEXT_PUBLIC_SUPABASE_ANON_KEY" in
  sb_secret_*|*service_role*)
    echo "중단: NEXT_PUBLIC_SUPABASE_ANON_KEY 에 secret 키가 들어 있습니다."
    echo "      이 값은 브라우저로 나가고, secret 키는 RLS 를 우회합니다."
    echo "      대시보드에서 'publishable' 키(sb_publishable_...)로 바꾸세요."
    exit 1 ;;
esac

SCOPE_ARG=()
if [ -n "${VERCEL_SCOPE:-}" ]; then SCOPE_ARG=(--scope "$VERCEL_SCOPE"); fi

echo "── ① Supabase 마이그레이션 ──────────────────────────────"
node deploy/migrate.mjs

echo
echo "── ② Vercel 프로젝트 연결 ───────────────────────────────"
cd "$ROOT/apps/scheduler"

# --yes: 대화형 질문을 넘긴다. 이 셸은 stdin 이 없어 물어보면 그대로 멈춘다.
npx --yes vercel@latest link --yes --project alpetax-scheduler \
  --token "$VERCEL_TOKEN" "${SCOPE_ARG[@]}"

# 환경변수는 넣기 전에 지운다 — vercel env add 는 같은 키가 있으면 실패한다.
put_env() {
  local key="$1" val="$2"
  for target in production preview development; do
    npx --yes vercel@latest env rm "$key" "$target" --yes \
      --token "$VERCEL_TOKEN" "${SCOPE_ARG[@]}" >/dev/null 2>&1 || true
    printf '%s' "$val" | npx --yes vercel@latest env add "$key" "$target" \
      --token "$VERCEL_TOKEN" "${SCOPE_ARG[@]}" >/dev/null
  done
  echo "  $key 등록"
}
put_env NEXT_PUBLIC_SUPABASE_URL      "$NEXT_PUBLIC_SUPABASE_URL"
put_env NEXT_PUBLIC_SUPABASE_ANON_KEY "$NEXT_PUBLIC_SUPABASE_ANON_KEY"

echo
echo "── ③ 첫 배포 (주소를 받기 위해) ─────────────────────────"
# NEXT_PUBLIC_SITE_URL 은 배포 주소가 정해진 뒤에야 알 수 있다. 그래서 두 번 배포한다:
# 먼저 올려 주소를 얻고, 그 값을 넣어 다시 올린다. 이 값이 비면 매직링크가
# 돌아올 곳을 몰라 로그인이 끝나지 않는다.
URL=$(npx --yes vercel@latest deploy --prod --yes \
  --token "$VERCEL_TOKEN" "${SCOPE_ARG[@]}" 2>/dev/null | tail -1)
echo "  배포 주소: $URL"

echo
echo "── ④ 로그인 주소 등록 후 재배포 ─────────────────────────"
put_env NEXT_PUBLIC_SITE_URL "$URL"
FINAL=$(npx --yes vercel@latest deploy --prod --yes \
  --token "$VERCEL_TOKEN" "${SCOPE_ARG[@]}" 2>/dev/null | tail -1)

echo
echo "════════════════════════════════════════════════════════"
echo " 배포 완료: $FINAL"
echo "════════════════════════════════════════════════════════"
echo
echo "남은 수동 작업 — Supabase 대시보드에서 두 곳만 채우세요:"
echo
echo " Authentication → URL Configuration"
echo "   Site URL      : $FINAL"
echo "   Redirect URLs : $FINAL/auth/callback"
echo "                   http://localhost:3000/auth/callback"
echo
echo " Authentication → Providers → Email : Enable 켜기"
echo
echo "이 둘을 넣지 않으면 매직링크가 차단되어 로그인이 되지 않습니다."
