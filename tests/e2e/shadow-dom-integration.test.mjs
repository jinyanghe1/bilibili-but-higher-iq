import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { chromium } from 'playwright';
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

test('video and comment extractors can read data from custom-element shadow hosts', async () => {
  const { server, baseUrl } = await startStaticServer(repoRoot);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 }
  });

  try {
    const fixtureUrl = `${baseUrl}/tests/e2e/fixtures/shadow-dom-sample.html`;
    const videoScorerUrl = `${baseUrl}/content/video-scorer.js`;
    const commentFilterUrl = `${baseUrl}/content/comment-filter.js`;
    const shadowUtilsUrl = `${baseUrl}/utils/shadow-dom-utils.js`;

    await page.goto(fixtureUrl, { waitUntil: 'domcontentloaded' });

    const extraction = await page.evaluate(async ({
      videoScorerUrl,
      commentFilterUrl,
      shadowUtilsUrl
    }) => {
      const { videoScorer } = await import(videoScorerUrl);
      const { commentFilter } = await import(commentFilterUrl);
      const { deepQuerySelectorAll } = await import(shadowUtilsUrl);

      const videoHosts = deepQuerySelectorAll('bili-video-card', document);
      const commentHosts = deepQuerySelectorAll(
        'bili-comment-thread-renderer, bili-comment-reply-renderer',
        document
      );

      return {
        videos: videoHosts.map((host) => videoScorer.extractVideoData(host)),
        comments: commentHosts.map((host) => commentFilter.extractCommentData(host))
      };
    }, {
      videoScorerUrl,
      commentFilterUrl,
      shadowUtilsUrl
    });

    assert.equal(extraction.videos.length, 2);
    assert.deepEqual(
      extraction.videos.map((video) => ({
        title: video.title,
        author: video.author,
        uid: video.uid,
        bvid: video.bvid
      })),
      [
        {
          title: 'Shadow DOM feed title',
          author: 'Shadow UP',
          uid: '123456',
          bvid: 'BV1TESTFEED01'
        },
        {
          title: 'Nested shadow title',
          author: 'Nested UP',
          uid: '654321',
          bvid: 'BV1TESTNEST02'
        }
      ]
    );

    assert.equal(extraction.comments.length, 2);
    assert.deepEqual(
      extraction.comments.map((comment) => ({
        content: comment.content,
        username: comment.username,
        uid: comment.uid,
        rid: comment.rid
      })),
      [
        {
          content: '理性分析和数据来源都很清楚。',
          username: 'Root Commenter',
          uid: '9988',
          rid: 'root-comment'
        },
        {
          content: '这是一个嵌套 shadow root 评论。',
          username: 'Nested Commenter',
          uid: '7788',
          rid: 'nested-comment'
        }
      ]
    );
  } finally {
    await page.close();
    await browser.close();
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
});
