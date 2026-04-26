import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    allowedHosts: ['.ts.net'],
  },
  // Pre-bundle these heavyweight dependencies on dev-server start so the first
  // navigation into a page that uses them isn't janky, and the HMR pipeline
  // doesn't re-transform them on every touch.
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'lucide-react',
      '@supabase/supabase-js',
      'recharts',
      'xlsx',
      'md5',
    ],
  },
  build: {
    // Split the biggest third-party chunks so they can be cached independently
    // and don't force a re-download of the whole app on a small update.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined
          }

          if (id.includes('recharts') || id.includes('d3-')) {
            return 'vendor-charts'
          }

          if (id.includes('xlsx')) {
            return 'vendor-xlsx'
          }

          if (id.includes('@supabase')) {
            return 'vendor-supabase'
          }

          if (id.includes('lucide-react')) {
            return 'vendor-icons'
          }

          return 'vendor'
        },
      },
    },
  },
})
