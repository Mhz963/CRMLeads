import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    // In local dev, Vite does not run Vercel serverless functions from /api.
    // Proxy /api requests to deployed backend so GBM and form APIs work on localhost.
    proxy: {
      '/api': {
        target: 'https://crm-leads-beige.vercel.app',
        changeOrigin: true,
        secure: true,
      },
      // Local-dev only proxy for Google Places Text Search to avoid browser CORS.
      '/__gbm_proxy/textsearch': {
        target: 'https://maps.googleapis.com',
        changeOrigin: true,
        secure: true,
        rewrite: () => '/maps/api/place/textsearch/json',
      },
      '/__gbm_proxy/details': {
        target: 'https://maps.googleapis.com',
        changeOrigin: true,
        secure: true,
        rewrite: () => '/maps/api/place/details/json',
      },
    },
  },
})
