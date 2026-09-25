import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  // BACKEND_URL may come from the shell or from frontend/.env*.local (not only VITE_-prefixed vars).
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env }
  const backend = env.BACKEND_URL || 'http://localhost:8000'
  const proxy = { target: backend, changeOrigin: true }

  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: true, // listen on the LAN so a phone can open http://<laptop-ip>:5173
      proxy: { '/api': proxy, '/media': proxy },
    },
    preview: {
      host: true,
      proxy: { '/api': proxy, '/media': proxy },
    },
  }
})
