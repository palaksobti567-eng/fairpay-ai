import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { readFileSync } from 'node:fs'

// .env.example is the single committed env template. Values from real
// .env files and the shell win; the template only fills gaps, so a fresh
// clone works after editing .env.example alone.
function loadExampleEnv(mode: string) {
  const env = loadEnv(mode, process.cwd(), ['VITE_', 'API_BASE_URL'])
  try {
    for (const line of readFileSync('.env.example', 'utf8').split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (match && env[match[1]] === undefined) {
        process.env[match[1]] = match[2]
      }
    }
  } catch {
    // .env.example is optional
  }
}

export default defineConfig(({ mode }) => {
  loadExampleEnv(mode)
  return {
    plugins: [react()],
    envPrefix: ['VITE_', 'API_BASE_URL'],
    server: {
      port: 5173,
      strictPort: true,
    },
    preview: {
      port: 5173,
      strictPort: true,
    },
  }
})
