import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Preserve the Vite 7 WebView baseline across the Vite 8 upgrade.
  build: {
    target: ['chrome107', 'edge107', 'firefox104', 'safari16'],
  },
})
