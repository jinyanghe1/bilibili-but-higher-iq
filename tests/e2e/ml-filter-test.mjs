// Direct Filter Logic Test - Test ML sentiment analysis and filtering
import { chromium } from 'playwright';
import http from 'http';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');

const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8'
};

async function startStaticServer(rootDir) {
  const server = http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
      let pathname = decodeURIComponent(requestUrl.pathname);
      if (pathname === '/') {
        pathname = '/tests/e2e/fixtures/shadow-dom-sample.html';
      }

      const filePath = path.resolve(rootDir, `.${pathname}`);
      if (!filePath.startsWith(rootDir)) {
        response.writeHead(403);
        response.end('Forbidden');
        return;
      }

      const content = await readFile(filePath);
      const contentType = CONTENT_TYPES[path.extname(filePath)] || 'application/octet-stream';
      response.writeHead(200, { 'content-type': contentType });
      response.end(content);
    } catch (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500, {
        'content-type': 'text/plain; charset=utf-8'
      });
      response.end(error.message);
    }
  });

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`
  };
}

// Mock chrome storage for testing
const mockStorage = {
  sync: {
    data: {},
    get(key, callback) {
      const result = {};
      if (key) {
        result[key] = this.data[key];
      } else {
        Object.assign(result, this.data);
      }
      setTimeout(() => callback(result), 0);
    },
    set(data, callback) {
      Object.assign(this.data, data);
      if (callback) setTimeout(callback, 0);
    }
  }
};

// Test cases for blocklist mode
const TEST_CASES_BLOCKLIST = [
  // Low quality comments (should be hidden/warn)
  { text: '绝了绝了！笑死我了！', expected: 'hide', desc: 'Clickbait spam' },
  { text: '呵呵呵脑残玩意', expected: 'hide', desc: 'Rage bait' },
  { text: '搬运盗摄抄袭狗', expected: 'hide', desc: 'Homogenized content' },
  { text: '哈哈哈哈哈哈哈', expected: 'hide', desc: 'Low effort spam' },
  { text: '66666666666', expected: 'hide', desc: 'Number spam' },
  { text: '！！！？？？', expected: 'hide', desc: 'Punctuation spam' },

  // High quality (should be shown)
  { text: '从数据分析和理性角度来看，这个视频的论证逻辑存在问题。', expected: 'show', desc: 'Analytical comment' },
  { text: '客观来说，这个作品的作画和音乐都很专业。', expected: 'show', desc: 'Objective analysis' },
  { text: '根据公开数据来源，这个说法是有依据的。', expected: 'show', desc: 'Fact-based comment' }
];

const TEST_CASES_ALLOWLIST = [
  // High quality (should be shown)
  { text: '从数据分析和理性角度来看，这个视频的论证逻辑存在问题。', expected: 'show', desc: 'Analytical comment' },
  { text: '客观来说，这个作品的作画和音乐都很专业。', expected: 'show', desc: 'Objective analysis' },
  { text: '根据公开数据来源，这个说法是有依据的。', expected: 'show', desc: 'Fact-based comment' },

  // Low quality (should be hidden)
  { text: '绝了绝了！笑死我了！', expected: 'hide', desc: 'Clickbait spam' },
  { text: '呵呵呵脑残玩意', expected: 'hide', desc: 'Rage bait' },
  { text: '哈哈哈哈哈哈哈', expected: 'hide', desc: 'Low effort spam' }
];

async function runTests() {
  console.log('Starting HTTP server...');
  const { server, baseUrl } = await startStaticServer(repoRoot);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 }
  });

  const logs = [];
  page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));

  try {
    const fixtureUrl = `${baseUrl}/tests/e2e/fixtures/shadow-dom-sample.html`;
    const videoScorerUrl = `${baseUrl}/content/video-scorer.js`;
    const commentFilterUrl = `${baseUrl}/content/comment-filter.js`;
    const shadowUtilsUrl = `${baseUrl}/utils/shadow-dom-utils.js`;
    const constantsUrl = `${baseUrl}/utils/constants.js`;

    console.log('Loading fixture page...');
    await page.goto(fixtureUrl, { waitUntil: 'domcontentloaded' });

    // Inject chrome mock
    await page.evaluate(() => {
      window.chrome = window.chrome || {
        storage: {
          sync: {
            data: {},
            get(key, callback) {
              const result = {};
              if (key) {
                result[key] = this.data[key];
              } else {
                Object.assign(result, this.data);
              }
              setTimeout(() => callback(result), 0);
            },
            set(data, callback) {
              Object.assign(this.data, data);
              if (callback) setTimeout(callback, 0);
            }
          }
        },
        runtime: {
          sendMessage: () => {},
          lastError: null
        }
      };
    });

    // Test cases - passed into evaluate context
    const testCasesBlocklist = [
      { text: '绝了绝了！笑死我了！', expected: 'hide', desc: 'Clickbait spam' },
      { text: '呵呵呵脑残玩意', expected: 'hide', desc: 'Rage bait' },
      { text: '搬运盗摄抄袭狗', expected: 'hide', desc: 'Homogenized content' },
      { text: '哈哈哈哈哈哈哈', expected: 'warn', desc: 'Low effort spam (mild: warn)' },
      { text: '66666666666', expected: 'warn', desc: 'Number spam (mild: warn)' },
      { text: '！！！？？？', expected: 'warn', desc: 'Punctuation spam (mild: warn)' },
      { text: '从数据分析和理性角度来看，这个视频的论证逻辑存在问题。', expected: 'show', desc: 'Analytical comment' },
      { text: '客观来说，这个作品的作画和音乐都很专业。', expected: 'show', desc: 'Objective analysis' },
      { text: '根据公开数据来源，这个说法是有依据的。', expected: 'show', desc: 'Fact-based comment' }
    ];

    const testCasesAllowlist = [
      { text: '从数据分析和理性角度来看，这个视频的论证逻辑存在问题。', expected: 'show', desc: 'Analytical comment' },
      { text: '客观来说，这个作品的作画和音乐都很专业。', expected: 'show', desc: 'Objective analysis' },
      { text: '根据公开数据来源，这个说法是有依据的。', expected: 'show', desc: 'Fact-based comment' },
      { text: '绝了绝了！笑死我了！', expected: 'hide', desc: 'Clickbait spam' },
      { text: '呵呵呵脑残玩意', expected: 'hide', desc: 'Rage bait' },
      { text: '哈哈哈哈哈哈哈', expected: 'hide', desc: 'Low effort spam' }
    ];

    // Inject the modules and test filtering
    const results = await page.evaluate(async ({
      videoScorerUrl,
      commentFilterUrl,
      shadowUtilsUrl,
      testCasesBlocklist,
      testCasesAllowlist
    }) => {
      // Load modules
      const { deepQuerySelectorAll } = await import(shadowUtilsUrl);
      const { videoScorer } = await import(videoScorerUrl);
      const { commentFilter } = await import(commentFilterUrl);

      // Initialize
      await videoScorer.init();
      await commentFilter.init();

      const testResults = { blocklist: [], allowlist: [] };

      // Test blocklist mode (mild intensity)
      commentFilter.settings = {
        ...commentFilter.settings,
        filterComments: true,
        commentFilterMode: 'blocklist',
        blocklistIntensity: 'radical',
        enableMLSentiment: false
      };

      for (const tc of testCasesBlocklist) {
        const result = await commentFilter.scoreComment({ content: tc.text });
        testResults.blocklist.push({
          text: tc.text.substring(0, 25) + '...',
          expected: tc.expected,
          actual: result.action,
          score: result.score,
          reasons: result.reasons,
          passed: result.action === tc.expected
        });
      }

      // Test allowlist mode
      commentFilter.settings.commentFilterMode = 'allowlist';

      for (const tc of testCasesAllowlist) {
        const result = await commentFilter.scoreComment({ content: tc.text });
        testResults.allowlist.push({
          text: tc.text.substring(0, 25) + '...',
          expected: tc.expected,
          actual: result.action,
          score: result.score,
          reasons: result.reasons,
          passed: result.action === tc.expected
        });
      }

      // Video scoring test
      const videoHosts = deepQuerySelectorAll('bili-video-card', document);
      const videos = videoHosts.map((host) => videoScorer.extractVideoData(host));

      return { testResults, videos, keywords: commentFilter.keywords };
    }, { videoScorerUrl, commentFilterUrl, shadowUtilsUrl, testCasesBlocklist, testCasesAllowlist });

    console.log('\n=== Keywords Loaded ===');
    console.log(`rageBait: ${results.keywords?.rageBait?.length || 0} keywords`);
    console.log(`clickbait: ${results.keywords?.clickbait?.length || 0} keywords`);
    console.log(`homogenized: ${results.keywords?.homogenized?.length || 0} keywords`);

    console.log('\n=== Blocklist Mode Results (mild intensity) ===');
    let blocklistPassed = 0;
    let blocklistFailed = 0;
    for (const r of results.testResults.blocklist) {
      const status = r.passed ? '✓' : '✗';
      console.log(`${status} [${r.actual}] score=${r.score} expected=${r.expected}: ${r.text}`);
      if (r.reasons?.length > 0) {
        console.log(`   Reasons: ${r.reasons.join(', ')}`);
      }
      if (r.passed) blocklistPassed++;
      else blocklistFailed++;
    }

    console.log('\n=== Allowlist Mode Results ===');
    let allowlistPassed = 0;
    let allowlistFailed = 0;
    for (const r of results.testResults.allowlist) {
      const status = r.passed ? '✓' : '✗';
      console.log(`${status} [${r.actual}] score=${r.score} expected=${r.expected}: ${r.text}`);
      if (r.reasons?.length > 0) {
        console.log(`   Reasons: ${r.reasons.join(', ')}`);
      }
      if (r.passed) allowlistPassed++;
      else allowlistFailed++;
    }

    console.log('\n=== Summary ===');
    console.log(`Blocklist: ${blocklistPassed} passed, ${blocklistFailed} failed`);
    console.log(`Allowlist: ${allowlistPassed} passed, ${allowlistFailed} failed`);

    // Video scoring
    console.log('\n=== Video Scoring ===');
    for (const v of results.videos) {
      console.log(`[${v.score || 'N/A'}] ${v.title} by ${v.author}`);
      if (v.reasons?.length > 0) {
        console.log(`  Reasons: ${v.reasons.join(', ')}`);
      }
    }

    const totalPassed = blocklistPassed + allowlistPassed;
    const totalFailed = blocklistFailed + allowlistFailed;
    console.log(`\n=== Overall: ${totalPassed}/${totalPassed + totalFailed} tests passed ===`);

  } finally {
    await page.close();
    await browser.close();
    await new Promise((resolve) => {
      server.close((error) => {
        if (error) console.error('Server close error:', error);
        resolve();
      });
    });
  }
}

runTests().catch(console.error);
