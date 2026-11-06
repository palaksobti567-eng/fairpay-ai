import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Port is part of the CORS contract with the backend. Tell the backend
// to allow http://localhost:5173.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 5173,
    strictPort: true,
  },
})
