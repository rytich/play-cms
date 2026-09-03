import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  root: 'src/admin',
  plugins: [react()],
  build: {
    emptyOutDir: true,
    outDir: '../../dist/admin',
  },
})
