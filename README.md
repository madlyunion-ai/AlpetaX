# AlpetaX

퍼블리싱 산출물 (Vite + React + TypeScript).

## 프리뷰 URL

| 환경 | 주소 |
| --- | --- |
| 웹 (자동 배포) | https://madlyunion-ai.github.io/AlpetaX/ |
| 로컬 | http://localhost:5173/AlpetaX/ |
| 내부망 (같은 LAN의 다른 기기) | http://\<이 PC의 IP\>:5173/AlpetaX/ |

`main` 브랜치에 push하면 GitHub Actions가 빌드해 Pages로 배포한다.

## 로컬 실행

```bash
npm install
npm run dev
```

`dev`/`preview` 모두 `--host`로 실행되므로 터미널에 Local과 Network 주소가 함께 출력된다.
내부망 주소는 그 Network 줄을 그대로 쓰면 된다.

경로에 `/AlpetaX/`가 붙는 이유는 GitHub Pages 프로젝트 페이지가 하위 경로로 서비스되기 때문이다
(`vite.config.ts`의 `base`). 루트 경로로 띄우고 싶으면 base를 덮어쓴다.

```bash
VITE_BASE=/ npm run dev      # http://localhost:5173/ 로 서비스
```

라우터 `basename`과 `public/` 에셋 경로가 모두 `import.meta.env.BASE_URL`을 따르므로,
base를 바꿔도 그 외에 손댈 곳은 없다.

다른 기기에서 접속이 안 되면 Windows 방화벽에서 5173 인바운드를 열어야 한다
(관리자 PowerShell).

```powershell
New-NetFirewallRule -DisplayName "Vite dev 5173" -Direction Inbound -Protocol TCP -LocalPort 5173 -Action Allow
```

## 참고: Vite 템플릿 문서

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```
