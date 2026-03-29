#!/usr/bin/env node
/**
 * Bilibili Quality Filter - 调试脚本
 */

import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const extensionPath = repoRoot;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runDebug() {
  console.log('\n🔍 Bilibili Quality Filter - 调试诊断\n');

  const userDataDir = path.join(__dirname, '.debug-data');
  
  const browserContext = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-first-run',
    ],
    viewport: { width: 1440, height: 900 },
  });

  // 收集 console 日志
  const bqfLogs = [];
  
  await sleep(2000);
  
  // 获取扩展 ID
  const workers = browserContext.serviceWorkers();
  let extensionId = null;
  for (const worker of workers) {
    const match = worker.url().match(/chrome-extension:\/\/([^/]+)/);
    if (match) {
      extensionId = match[1];
      break;
    }
  }
  
  if (!extensionId) {
    console.error('❌ 无法获取扩展 ID');
    await browserContext.close();
    return;
  }
  
  console.log(`✅ 扩展 ID: ${extensionId.slice(0, 8)}...\n`);

  // 打开 Bilibili
  const page = await browserContext.newPage();
  
  // 监听 console
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[BQF]')) {
      bqfLogs.push(text);
      console.log(`📝 ${text}`);
    }
  });
  
  page.on('pageerror', err => {
    if (err.message.includes('BQF') || err.message.includes('video-scorer') || err.message.includes('comment-filter')) {
      console.error(`❌ 页面错误: ${err.message}`);
    }
  });

  await page.goto('https://www.bilibili.com', { waitUntil: 'networkidle' });
  await sleep(5000);

  console.log('\n--- 选择器匹配检查 ---');
  
  const check = await page.evaluate(() => {
    const videoCards = document.querySelectorAll('.bili-video-card');
    const withBqfClass = document.querySelectorAll('[class*="bqf-"]');
    const hidden = document.querySelectorAll('.bqf-video-hidden');
    const dimmed = document.querySelectorAll('.bqf-video-dimmed');
    
    // 检查第一个视频卡片
    const firstCard = videoCards[0];
    let cardInfo = null;
    if (firstCard) {
      const title = firstCard.querySelector('.bili-video-card__title, .bili-video-card__info--tit, .title-txt');
      cardInfo = {
        title: title?.textContent?.trim().slice(0, 50),
        hasDataProcessed: firstCard.hasAttribute('data-bqf-processed'),
        classList: Array.from(firstCard.classList).filter(c => c.includes('bqf')).join(', ')
      };
    }
    
    return {
      videoCards: videoCards.length,
      bqfElements: withBqfClass.length,
      hiddenVideos: hidden.length,
      dimmedVideos: dimmed.length,
      firstCard: cardInfo
    };
  });
  
  console.log(`视频卡片总数: ${check.videoCards}`);
  console.log(`BQF 处理元素: ${check.bqfElements}`);
  console.log(`已隐藏: ${check.hiddenVideos}`);
  console.log(`已淡化: ${check.dimmedVideos}`);
  
  if (check.firstCard) {
    console.log(`\n第一个视频卡片:`);
    console.log(`  标题: ${check.firstCard.title}`);
    console.log(`  BQF classes: ${check.firstCard.classList || 'none'}`);
  }

  console.log('\n--- BQF 控制台日志 ---');
  if (bqfLogs.length === 0) {
    console.log('(无 BQF 相关日志)');
  } else {
    bqfLogs.slice(-10).forEach(log => console.log(log));
  }

  // 检查 storage
  console.log('\n--- 检查扩展设置 ---');
  const optionsPage = await browserContext.newPage();
  await optionsPage.goto(`chrome-extension://${extensionId}/ui/options/options.html`);
  await sleep(1000);
  
  const settings = await optionsPage.evaluate(() => {
    const enabled = document.querySelector('input[type="checkbox"]')?.checked;
    return { enabled };
  });
  
  console.log(`过滤开关: ${settings.enabled ? '✅ 开启' : '❌ 关闭'}`);

  // 总结
  console.log('\n--- 诊断结果 ---');
  if (check.bqfElements === 0 && bqfLogs.length === 0) {
    console.log('❌ 扩展似乎没有运行');
    console.log('   可能原因:');
    console.log('   1. content script 未注入');
    console.log('   2. 初始化失败');
    console.log('   3. 选择器不匹配');
  } else if (check.bqfElements === 0) {
    console.log('⚠️  扩展已加载但没有处理视频');
    console.log('   可能原因:');
    console.log('   1. 过滤被禁用');
    console.log('   2. 评分逻辑返回 show');
  } else {
    console.log(`✅ 扩展正在工作 (处理了 ${check.bqfElements} 个元素)`);
  }

  await browserContext.close();
  console.log('\n调试完成');
}

runDebug().catch(console.error);
