#!/usr/bin/env node
/**
 * Health check for Bilibili Quality Filter
 * Quick verification of extension readiness
 */

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.resolve(__dirname, '..');

console.log('🏥 Bilibili Quality Filter - Health Check\n');

let exitCode = 0;

function check(name, condition, message) {
  if (condition) {
    console.log(`  ✅ ${name}`);
    return true;
  } else {
    console.log(`  ❌ ${name}: ${message}`);
    exitCode = 1;
    return false;
  }
}

function fileExists(filePath) {
  try {
    fs.accessSync(path.join(SRC_DIR, filePath), fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function countLines(filePath) {
  try {
    const content = fs.readFileSync(path.join(SRC_DIR, filePath), 'utf8');
    return content.split('\n').length;
  } catch {
    return 0;
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.join(SRC_DIR, filePath), 'utf8'));
}

// 1. Core files check
console.log('Core Files:');
check('manifest.json exists', fileExists('manifest.json'));
check('Background script exists', fileExists('background/service-worker.js'));
check('Content scripts exist', 
  fileExists('content/dom-observer.js') && 
  fileExists('content/video-scorer.js') && 
  fileExists('content/comment-filter.js')
);
check('Storage manager exists', fileExists('storage/blocklist-manager.js'));
check('Utils exist', 
  fileExists('utils/constants.js') && 
  fileExists('utils/shadow-dom-utils.js')
);

// 2. UI files check
console.log('\nUI Files:');
check('Popup UI exists', 
  fileExists('ui/popup/popup.html') && 
  fileExists('ui/popup/popup.js') && 
  fileExists('ui/popup/popup.css')
);
check('Options UI exists', 
  fileExists('ui/options/options.html') && 
  fileExists('ui/options/options.js') && 
  fileExists('ui/options/options.css')
);

// 3. Assets check
console.log('\nAssets:');
check('Icons exist', 
  fileExists('icons/icon-48.png') && 
  fileExists('icons/icon-128.png')
);
check('Styles exist', fileExists('styles/content.css'));
check('Locales exist', 
  fileExists('_locales/en/messages.json') && 
  fileExists('_locales/zh-CN/messages.json')
);
check('Bundled content script exists', fileExists('dist/content-bundle.js'), 'run npm run build');

// 4. Code metrics
console.log('\nCode Metrics:');
const domObserverLines = countLines('content/dom-observer.js');
const videoScorerLines = countLines('content/video-scorer.js');
const commentFilterLines = countLines('content/comment-filter.js');

console.log(`  📊 dom-observer.js: ${domObserverLines} lines`);
console.log(`  📊 video-scorer.js: ${videoScorerLines} lines`);
console.log(`  📊 comment-filter.js: ${commentFilterLines} lines`);

// 5. Shadow DOM readiness check
console.log('\nShadow DOM Readiness:');
check('Shadow DOM utils exist', fileExists('utils/shadow-dom-utils.js'));

const constantsContent = fs.readFileSync(
  path.join(SRC_DIR, 'utils/constants.js'), 
  'utf8'
);
check('Shadow selectors defined', 
  constantsContent.includes('bili-comment') || 
  constantsContent.includes('COMMENT_RENDERER')
);

// 6. Documentation check
console.log('\nDocumentation:');
check('README.md exists', fileExists('README.md'));
check('TESTING.md exists', fileExists('TESTING.md'));
check('LICENSE exists', fileExists('LICENSE'));
check('Code review exists', fileExists('.agentstalk/CODE_REVIEW_2026-03-29.md'));

// 7. Packaged build check
console.log('\nPackaged Build:');
if (check('dist/manifest.json exists', fileExists('dist/manifest.json'), 'run npm run build')) {
  try {
    const distManifest = readJson('dist/manifest.json');
    const missingAssets = (distManifest.content_scripts || [])
      .flatMap((contentScript) => contentScript.js || [])
      .filter((scriptPath) => !fileExists(path.join('dist', scriptPath)));

    check(
      'Packaged content script paths resolve',
      missingAssets.length === 0,
      missingAssets.join(', ') || 'missing content script asset'
    );
  } catch (error) {
    check('dist/manifest.json is valid JSON', false, error.message);
  }
}

// 8. Task status check
console.log('\nTask Status:');
try {
  const taskBoard = JSON.parse(
    fs.readFileSync(path.join(SRC_DIR, '.agentstalk/task_board.json'), 'utf8')
  );
  const doingTasks = taskBoard.tasks.filter(t => t.status === 'DOING');
  const doneTasks = taskBoard.tasks.filter(t => t.status === 'DONE');
  
  console.log(`  📋 Completed tasks: ${doneTasks.length}`);
  console.log(`  🔄 In progress tasks: ${doingTasks.length}`);
  
  if (doingTasks.length > 0) {
    console.log(`     ${doingTasks.map(t => t.id).join(', ')}`);
  }
  
  // Check for task 015
  const task015 = taskBoard.tasks.find(t => t.id === '015');
  if (task015 && task015.status === 'DOING') {
    console.log(`  ⏳ Task 015 (Shadow DOM fix) is in progress`);
  }
} catch (e) {
  console.log('  ⚠️ Could not read task board');
}

// Summary
console.log('\n' + (exitCode === 0 ? '✅ All checks passed' : '❌ Some checks failed'));

process.exit(exitCode);
