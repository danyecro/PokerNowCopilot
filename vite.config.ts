import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync } from 'fs';

function copyExtensionAssets() {
  return {
    name: 'copy-extension-assets',
    closeBundle() {
      const htmlFiles = [
        ['src/sidepanel/sidepanel.html', 'dist/sidepanel.html'],
        ['src/options/options.html', 'dist/options.html'],
      ];
      for (const [src, dest] of htmlFiles) {
        if (existsSync(src)) copyFileSync(src, dest);
      }

      const cssFiles = [
        ['src/sidepanel/sidepanel.css', 'dist/sidepanel.css'],
        ['src/options/options.css', 'dist/options.css'],
      ];
      for (const [src, dest] of cssFiles) {
        if (existsSync(src)) copyFileSync(src, dest);
      }

      if (existsSync('manifest.json')) copyFileSync('manifest.json', 'dist/manifest.json');

      const iconsDir = 'dist/icons';
      if (!existsSync(iconsDir)) mkdirSync(iconsDir, { recursive: true });
      const iconSrc = 'public/icons/image.png';
      if (existsSync(iconSrc)) copyFileSync(iconSrc, `${iconsDir}/image.png`);
    },
  };
}

// Build 1: Content script as IIFE (no ES module imports — required for content scripts)
const contentBuild = defineConfig({
  plugins: [],
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      input: { content: resolve(__dirname, 'src/content/index.ts') },
      output: {
        entryFileNames: '[name].js',
        format: 'iife',
        name: 'PokerNowCopilotContent',
        inlineDynamicImports: true,
      },
    },
    target: 'chrome120',
    minify: false,
    sourcemap: true,
  },
  resolve: { alias: { '@': resolve(__dirname, 'src') } },
});

// Build 2: Service worker + side panel + options as ESM
const extensionBuild = defineConfig({
  plugins: [copyExtensionAssets()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        serviceWorker: resolve(__dirname, 'src/background/serviceWorker.ts'),
        sidepanel: resolve(__dirname, 'src/sidepanel/sidepanel.ts'),
        options: resolve(__dirname, 'src/options/options.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: '[name].[ext]',
        format: 'esm',
      },
    },
    target: 'chrome120',
    minify: false,
    sourcemap: true,
  },
  resolve: { alias: { '@': resolve(__dirname, 'src') } },
});

export default process.env.BUILD_TARGET === 'content' ? contentBuild : extensionBuild;
