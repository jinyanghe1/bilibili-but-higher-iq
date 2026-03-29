#!/usr/bin/env node
/**
 * Validate extension structure and manifest
 */

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.resolve(__dirname, '..');

const REQUIRED_FILES = [
  'manifest.json',
  'background/service-worker.js',
  'content/dom-observer.js',
  'content/video-scorer.js',
  'content/comment-filter.js',
  'ml/sentiment-analyzer.js',
  'storage/blocklist-manager.js',
  'styles/content.css',
  'utils/constants.js',
  'utils/shadow-dom-utils.js',
  'ui/popup/popup.html',
  'ui/popup/popup.js',
  'ui/popup/popup.css',
  'ui/options/options.html',
  'ui/options/options.js',
  'ui/options/options.css',
  'icons/icon-48.png',
  'icons/icon-128.png',
  'icons/icon.svg'
];

const REQUIRED_LOCALES = ['en', 'zh-CN'];

function fileExists(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function readJson(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(content);
}

function collectManifestPaths(manifest) {
  const paths = new Set();

  if (manifest.background?.service_worker) {
    paths.add(manifest.background.service_worker);
  }

  for (const contentScript of manifest.content_scripts || []) {
    for (const scriptPath of contentScript.js || []) {
      paths.add(scriptPath);
    }
    for (const stylePath of contentScript.css || []) {
      paths.add(stylePath);
    }
  }

  if (manifest.action?.default_popup) {
    paths.add(manifest.action.default_popup);
  }

  for (const iconPath of Object.values(manifest.icons || {})) {
    paths.add(iconPath);
  }

  for (const iconPath of Object.values(manifest.action?.default_icon || {})) {
    paths.add(iconPath);
  }

  if (manifest.options_ui?.page) {
    paths.add(manifest.options_ui.page);
  }

  for (const resourceGroup of manifest.web_accessible_resources || []) {
    for (const resourcePath of resourceGroup.resources || []) {
      paths.add(resourcePath);
    }
  }

  return [...paths];
}

async function validate() {
  console.log('🔍 Validating extension...\n');
  
  let hasErrors = false;
  
  // Check required files
  console.log('Checking required files:');
  for (const file of REQUIRED_FILES) {
    const filePath = path.join(SRC_DIR, file);
    const exists = fileExists(filePath);
    
    if (exists) {
      console.log(`  ✓ ${file}`);
    } else {
      console.log(`  ✗ ${file} (MISSING)`);
      hasErrors = true;
    }
  }
  
  // Check locales
  console.log('\nChecking locales:');
  for (const locale of REQUIRED_LOCALES) {
    const localePath = path.join(SRC_DIR, '_locales', locale, 'messages.json');
    const exists = fileExists(localePath);
    
    if (exists) {
      console.log(`  ✓ ${locale}`);
    } else {
      console.log(`  ✗ ${locale} (MISSING)`);
      hasErrors = true;
    }
  }
  
  // Validate manifest
  console.log('\nValidating manifest.json:');
  try {
    const manifestPath = path.join(SRC_DIR, 'manifest.json');
    const manifest = readJson(manifestPath);
    
    // Check required fields
    const requiredFields = ['manifest_version', 'name', 'version', 'permissions'];
    for (const field of requiredFields) {
      if (manifest[field]) {
        console.log(`  ✓ ${field}`);
      } else {
        console.log(`  ✗ ${field} (MISSING)`);
        hasErrors = true;
      }
    }
    
    // Check content_scripts
    if (manifest.content_scripts && manifest.content_scripts.length > 0) {
      console.log(`  ✓ content_scripts (${manifest.content_scripts.length} entries)`);
    } else {
      console.log(`  ✗ content_scripts (MISSING or EMPTY)`);
      hasErrors = true;
    }
    
    // Check for required permissions
    const requiredPermissions = ['storage'];
    for (const perm of requiredPermissions) {
      if (manifest.permissions?.includes(perm)) {
        console.log(`  ✓ permission: ${perm}`);
      } else {
        console.log(`  ✗ permission: ${perm} (MISSING)`);
        hasErrors = true;
      }
    }

    console.log('\nChecking manifest-linked assets:');
    for (const linkedPath of collectManifestPaths(manifest)) {
      const exists = fileExists(path.join(SRC_DIR, linkedPath));
      if (exists) {
        console.log(`  ✓ ${linkedPath}`);
      } else {
        console.log(`  ✗ ${linkedPath} (MISSING referenced asset)`);
        hasErrors = true;
      }
    }
    
  } catch (err) {
    console.log(`  ✗ Invalid JSON: ${err.message}`);
    hasErrors = true;
  }
  
  console.log('\n' + (hasErrors ? '❌ Validation failed' : '✅ Validation passed'));
  process.exit(hasErrors ? 1 : 0);
}

validate().catch(err => {
  console.error('Validation error:', err);
  process.exit(1);
});
