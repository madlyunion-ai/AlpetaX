import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages 프로젝트 페이지(https://hoob300.github.io/AlpetaX/) 하위 경로 배포용
  base: process.env.VITE_BASE ?? '/AlpetaX/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
