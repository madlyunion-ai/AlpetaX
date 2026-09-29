import path from 'node:path';
import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  typedRoutes: false,
  // 저장소 루트에 별도의 Vite 앱과 lockfile 이 있어 Next 가 워크스페이스 루트를
  // 잘못 추론한다. 이 앱 폴더를 추적 루트로 못박는다.
  outputFileTracingRoot: path.join(import.meta.dirname, '.'),
};

export default config;
