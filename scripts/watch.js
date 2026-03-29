#!/usr/bin/env node
/**
 * Watch for file changes and rebuild
 */

const chokidar = require('chokidar');
const { execSync } = require('child_process');
const path = require('path');

const SRC_DIR = path.resolve(__dirname, '..');

console.log('👀 Watching for changes...\n');

const watcher = chokidar.watch([
  'manifest.json',
  '_locales/**/*',
  'background/**/*.js',
  'content/**/*.js',
  'icons/**/*',
  'storage/**/*.js',
  'styles/**/*.css',
  'ui/**/*',
  'utils/**/*.js'
], {
  cwd: SRC_DIR,
  ignored: /node_modules/,
  persistent: true
});

let isBuilding = false;

async function rebuild() {
  if (isBuilding) return;
  isBuilding = true;
  
  console.log('\n🔄 Change detected, rebuilding...\n');
  
  try {
    execSync('node scripts/build.js', {
      cwd: SRC_DIR,
      stdio: 'inherit'
    });
    console.log('\n👀 Watching for changes...');
  } catch (err) {
    console.error('\n❌ Build failed');
  } finally {
    isBuilding = false;
  }
}

watcher
  .on('change', rebuild)
  .on('add', rebuild)
  .on('unlink', rebuild)
  .on('ready', () => {
    console.log('Initial build...\n');
    rebuild();
  });

process.on('SIGINT', () => {
  console.log('\n\n👋 Stopping watcher...');
  watcher.close();
  process.exit(0);
});
