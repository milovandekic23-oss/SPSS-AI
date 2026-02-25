import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Required for GitHub Pages (project site): use repo name, e.g. base: '/AI-SPSS/'
  base: process.env.GITHUB_ACTIONS ? '/SPSS-AI/' : '/',
})
