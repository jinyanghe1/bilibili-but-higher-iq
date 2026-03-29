import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const testsRoot = path.resolve(__dirname, '..');
const scriptPath = path.resolve(__dirname, 'shadow-dom-probe.mjs');
const fixtureUrl = pathToFileURL(
  path.resolve(__dirname, 'fixtures/shadow-dom-sample.html')
).href;

test('shadow dom probe traverses open shadow roots and reports selector hits', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--experimental-default-type=module',
      scriptPath,
      '--json',
      '--wait-ms',
      '0',
      fixtureUrl
    ],
    {
      cwd: testsRoot,
      encoding: 'utf8'
    }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const report = JSON.parse(result.stdout);
  assert.equal(report.pages.length, 1);

  const page = report.pages[0];
  assert.ok(!page.error, page.error);
  assert.ok(page.shadowHostCount >= 3);
  assert.ok(page.rootCount >= 4);

  assert.ok(page.selectors.MAIN_CONTENT.count >= 1);
  assert.ok(page.selectors.VIDEO_CARD.count >= 2);
  assert.ok(page.selectors.VIDEO_CARD_TITLE.count >= 2);
  assert.ok(page.selectors.VIDEO_CARD_AUTHOR.count >= 2);
  assert.ok(page.selectors.VIDEO_CARD_LINK.count >= 2);
  assert.ok(page.selectors.COMMENT_HOST.count >= 1);
  assert.ok(page.selectors.COMMENT_LIST.count >= 1);
  assert.ok(page.selectors.COMMENT_ITEM.count >= 2);
  assert.ok(page.selectors.COMMENT_AUTHOR.count >= 2);
  assert.ok(page.selectors.COMMENT_CONTENT.count >= 2);
});
