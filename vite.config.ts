import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
    // Relative, so the build works from any folder: GitHub Pages under /repo/, or opened from a static host.
    base: './',
    plugins: [vue()],
    worker: { format: 'es' },
    build: { sourcemap: true },
});
