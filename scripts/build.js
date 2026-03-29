#!/usr/bin/env node
/**
 * Bilibili Quality Filter - Build Script
 * Copies source files to dist/
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SRC_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.resolve(__dirname, '../dist');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
  console.log(`  ✓ ${path.relative(SRC_DIR, src)}`);
}

function copyDir(src, dest) {
  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFile(srcPath, destPath);
    }
  }
}

function runContentBundleBuild() {
  console.log('\nBundling content script:');

  const result = spawnSync(process.execPath, [path.join(SRC_DIR, 'esbuild.config.mjs')], {
    cwd: SRC_DIR,
    env: process.env,
    stdio: 'inherit'
  });

  if (result.status !== 0) {
    throw new Error(`Content bundle build failed with exit code ${result.status}`);
  }

  const bundledPath = path.join(DIST_DIR, 'content-bundle.js');
  if (!fs.existsSync(bundledPath)) {
    throw new Error('Content bundle build completed without creating dist/content-bundle.js');
  }
}

function rewritePackagedManifest() {
  const manifestPath = path.join(DIST_DIR, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  for (const contentScript of manifest.content_scripts || []) {
    if (!Array.isArray(contentScript.js)) {
      continue;
    }

    contentScript.js = contentScript.js.map((scriptPath) => {
      if (scriptPath.startsWith('dist/')) {
        return scriptPath.slice('dist/'.length);
      }
      return scriptPath;
    });
  }

  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log('  ✓ manifest.json (packaged content script paths normalized)');
}

function build() {
  console.log('🚀 Building Bilibili Quality Filter...\n');
  
  const isProduction = process.env.NODE_ENV === 'production';
  console.log(`Mode: ${isProduction ? 'production' : 'development'}\n`);
  
  // Clean dist directory
  if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, { recursive: true });
  }
  ensureDir(DIST_DIR);
  
  console.log('Copying files:');
  
  // Copy individual files
  const filesToCopy = ['manifest.json', 'LICENSE', 'README.md'];
  for (const file of filesToCopy) {
    const src = path.join(SRC_DIR, file);
    const dest = path.join(DIST_DIR, file);
    if (fs.existsSync(src)) {
      copyFile(src, dest);
    }
  }
  
  // Copy directories
  const dirsToCopy = ['_locales', 'background', 'content', 'icons', 'ml', 'storage', 'styles', 'ui', 'utils'];
  for (const dir of dirsToCopy) {
    const srcDir = path.join(SRC_DIR, dir);
    const destDir = path.join(DIST_DIR, dir);
    if (fs.existsSync(srcDir)) {
      copyDir(srcDir, destDir);
    }
  }

  runContentBundleBuild();
  rewritePackagedManifest();
  
  console.log('\n✅ Build completed!');
  console.log(`   Output: ${DIST_DIR}`);
  
  // Print stats
  const countFiles = (dir) => {
    let count = 0;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        count += countFiles(path.join(dir, entry.name));
      } else {
        count++;
      }
    }
    return count;
  };
  
  console.log(`   Files: ${countFiles(DIST_DIR)}`);
}

build();
