import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // 使用相对路径基址，部署到 GitHub Pages 子路径（https://user.github.io/repo/）时无需写死仓库名
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    outDir: 'dist',
  },
})
