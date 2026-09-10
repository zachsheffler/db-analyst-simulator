import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// base './' so the built site works from any sub-path (GitHub Pages, LMS file hosting, etc.)
export default defineConfig({
  plugins: [react()],
  base: './',
  optimizeDeps: { exclude: ['sql.js'] },
})
