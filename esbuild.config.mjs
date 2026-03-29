// esbuild configuration for bundling content scripts
import * as esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname);

const isWatch = process.argv.includes('--watch');

// Content script entry point - dom-observer imports others
const entryPoints = {
  'content-bundle': path.join(rootDir, 'content/dom-observer.js'),
};

const buildOptions = {
  entryPoints,
  bundle: true,
  outdir: path.join(rootDir, 'dist'),
  format: 'iife',
  platform: 'browser',
  target: ['chrome120'],
  minify: !isWatch,
  sourcemap: isWatch,
  logLevel: 'info',
  // External modules that shouldn't be bundled
  external: [],
  // Define constants - no longer needed since we keep chrome as-is
  define: {},
};

async function build() {
  if (isWatch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log('Watching for changes...');
  } else {
    await esbuild.build(buildOptions);
    console.log('Build complete!');
  }
}

build().catch(() => process.exit(1));
