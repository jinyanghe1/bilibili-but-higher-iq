#!/usr/bin/env node

import { chromium } from 'playwright';
import { BILIBILI_SELECTORS } from '../../utils/constants.js';

const DEFAULT_URLS = [
  'https://www.bilibili.com/',
  'https://www.bilibili.com/video/BV1DcXbBfEM1/'
];

const DEFAULT_WAIT_MS = 4000;
const DEFAULT_TIMEOUT_MS = 45000;
const SAMPLE_LIMIT = 3;

const SELECTOR_KEYS = [
  'MAIN_CONTENT',
  'VIDEO_CARD',
  'VIDEO_CARD_TITLE',
  'VIDEO_CARD_AUTHOR',
  'VIDEO_CARD_LINK',
  'COMMENT_HOST',
  'COMMENT_LIST',
  'COMMENT_ITEM',
  'COMMENT_RENDERER',
  'COMMENT_USER_INFO',
  'COMMENT_RICH_TEXT',
  'COMMENT_AUTHOR',
  'COMMENT_CONTENT',
  'COMMENT_FOOTER'
];

function printHelp() {
  console.log(`Shadow DOM probe for live Bilibili pages

Usage:
  npm --prefix tests run probe:shadowdom -- [options] [url...]

Options:
  --json                Print machine-readable JSON output
  --wait-ms <number>    Delay after navigation before probing (default: ${DEFAULT_WAIT_MS})
  --timeout-ms <number> Navigation timeout in milliseconds (default: ${DEFAULT_TIMEOUT_MS})
  --help                Show this help

Examples:
  npm --prefix tests run probe:shadowdom
  npm --prefix tests run probe:shadowdom -- --json https://www.bilibili.com/
`);
}

function parseArgs(argv) {
  const options = {
    json: false,
    waitMs: DEFAULT_WAIT_MS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    urls: []
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--json') {
      options.json = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    if (arg === '--wait-ms') {
      options.waitMs = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === '--timeout-ms') {
      options.timeoutMs = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    options.urls.push(arg);
  }

  if (!Number.isFinite(options.waitMs) || options.waitMs < 0) {
    throw new Error('Invalid --wait-ms value');
  }

  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error('Invalid --timeout-ms value');
  }

  if (options.urls.length === 0) {
    options.urls = [...DEFAULT_URLS];
  }

  return options;
}

function buildHumanReadableReport(report) {
  const sections = report.pages.map((pageReport) => {
    if (pageReport.error) {
      return [
        `URL: ${pageReport.url}`,
        `Error: ${pageReport.error}`
      ].join('\n');
    }

    const lines = [
      `URL: ${pageReport.url}`,
      `Final URL: ${pageReport.finalUrl}`,
      `Title: ${pageReport.title || '(no title)'}`,
      `Root count: ${pageReport.rootCount}`,
      `Shadow host count: ${pageReport.shadowHostCount}`,
      `Top shadow hosts: ${pageReport.shadowHostSummary.length > 0 ? pageReport.shadowHostSummary.map((entry) => `${entry.tagName}(${entry.count})`).join(', ') : '(none)'}`,
      'Selector hits:'
    ];

    for (const [key, value] of Object.entries(pageReport.selectors)) {
      const sampleText = value.samples.length > 0
        ? ` samples=${value.samples.map((sample) => `${sample.tag}${sample.id ? `#${sample.id}` : ''}${sample.classes ? `.${sample.classes}` : ''}${sample.text ? `:"${sample.text}"` : ''}`).join(' | ')}`
        : '';
      lines.push(`  - ${key}: ${value.count}${sampleText}`);
    }

    return lines.join('\n');
  });

  return sections.join('\n\n');
}

async function probePage(page, url, options) {
  try {
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: options.timeoutMs
    });
    await page.waitForTimeout(options.waitMs);

    const result = await page.evaluate(({ selectors, sampleLimit }) => {
      function collectRoots(root, roots = []) {
        roots.push(root);

        const elements = root.querySelectorAll ? root.querySelectorAll('*') : [];
        for (const element of elements) {
          if (element.shadowRoot) {
            collectRoots(element.shadowRoot, roots);
          }
        }

        return roots;
      }

      function summarizeNode(element) {
        const text = (element.textContent || '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 80);

        return {
          tag: element.tagName.toLowerCase(),
          id: element.id || '',
          classes: Array.from(element.classList || []).slice(0, 4).join('.'),
          text,
          href: element.getAttribute('href') || ''
        };
      }

      function queryAllDeep(selector, roots) {
        const matches = new Set();

        for (const root of roots) {
          if (root.querySelectorAll) {
            for (const element of root.querySelectorAll(selector)) {
              matches.add(element);
            }
          }
        }

        return Array.from(matches);
      }

      const roots = collectRoots(document);
      const shadowHosts = [];

      for (const root of roots) {
        if (root.host) {
          shadowHosts.push(root.host.tagName.toLowerCase());
        }
      }

      const shadowHostSummary = Object.entries(
        shadowHosts.reduce((acc, tagName) => {
          acc[tagName] = (acc[tagName] || 0) + 1;
          return acc;
        }, {})
      )
        .sort((left, right) => right[1] - left[1])
        .slice(0, 12)
        .map(([tagName, count]) => ({ tagName, count }));

      const selectorReport = {};
      for (const [key, selector] of Object.entries(selectors)) {
        const matches = queryAllDeep(selector, roots);
        selectorReport[key] = {
          count: matches.length,
          samples: matches.slice(0, sampleLimit).map(summarizeNode)
        };
      }

      return {
        finalUrl: location.href,
        title: document.title,
        rootCount: roots.length,
        shadowHostCount: shadowHosts.length,
        shadowHostSummary,
        selectors: selectorReport
      };
    }, {
      selectors: Object.fromEntries(
        Object.entries(BILIBILI_SELECTORS)
          .filter(([key]) => SELECTOR_KEYS.includes(key))
      ),
      sampleLimit: SAMPLE_LIMIT
    });

    return {
      url,
      ...result
    };
  } catch (error) {
    return {
      url,
      error: error.message
    };
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const browser = await chromium.launch({
    headless: true
  });

  const page = await browser.newPage({
    viewport: { width: 1440, height: 960 },
    ignoreHTTPSErrors: true
  });

  try {
    const pages = [];
    for (const url of options.urls) {
      pages.push(await probePage(page, url, options));
    }

    const report = {
      generatedAt: new Date().toISOString(),
      selectorKeys: SELECTOR_KEYS,
      pages
    };

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    console.log(buildHumanReadableReport(report));
  } finally {
    await page.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error('[BQF] Shadow DOM probe failed:', error);
  process.exitCode = 1;
});
