import { defineConfig } from 'vite'

export default defineConfig({
  oxc: { jsx: { importSource: 'preact' } },
  optimizeDeps: { rolldownOptions: { transform: { jsx: { importSource: 'preact' } } } },
})
