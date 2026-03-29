#!/usr/bin/env node
/**
 * Package the extension into a zip file for distribution
 */

const fs = require('fs-extra');
const path = require('path');
const archiver = require('archiver');

const DIST_DIR = path.resolve(__dirname, '../dist');
const OUTPUT_DIR = path.resolve(__dirname, '../releases');

async function package() {
  console.log('📦 Packaging extension...\n');
  
  // Read version from manifest
  const manifestPath = path.join(DIST_DIR, 'manifest.json');
  const manifest = await fs.readJson(manifestPath);
  const version = manifest.version;
  
  // Create output directory
  await fs.ensureDir(OUTPUT_DIR);
  
  const zipName = `bilibili-quality-filter-v${version}.zip`;
  const zipPath = path.join(OUTPUT_DIR, zipName);
  
  // Remove existing zip
  await fs.remove(zipPath);
  
  // Create zip
  const output = require('fs').createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 9 } });
  
  output.on('close', () => {
    const size = (archive.pointer() / 1024).toFixed(2);
    console.log(`✅ Package created: ${zipName}`);
    console.log(`   Size: ${size} KB`);
    console.log(`   Path: ${zipPath}`);
  });
  
  archive.on('error', (err) => {
    throw err;
  });
  
  archive.pipe(output);
  archive.directory(DIST_DIR, false);
  await archive.finalize();
}

package().catch(err => {
  console.error('\n❌ Packaging failed:', err.message);
  process.exit(1);
});
