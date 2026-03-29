#!/usr/bin/env node
/**
 * 在真实 Bilibili 页面上测试 ML 情感分析
 * 
 * 使用方法:
 *   cd demo && node enable-ml-test.mjs
 * 
 * 测试步骤:
 * 1. 加载扩展
 * 2. 打开 Options 启用 ML 分析
 * 3. 访问 Bilibili 视频页
 * 4. 观察评论过滤效果
 */

import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const extensionPath = repoRoot;

function log(message) {
  console.log(`[${new Date().toLocaleTimeString()}] ${message}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest() {
  console.log('\n' + '='.repeat(70));
  console.log('🧠 在 Bilibili 上测试 ML 情感分析');
  console.log('='.repeat(70) + '\n');

  const userDataDir = path.join(__dirname, '.ml-test-data');
  
  // 启动浏览器
  log('🚀 启动 Chromium 并加载扩展...');
  const browserContext = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-first-run',
    ],
    viewport: { width: 1440, height: 900 },
  });

  // 获取扩展 ID
  await sleep(2000);
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
  
  log(`✅ 扩展已加载 (ID: ${extensionId.slice(0, 8)}...)`);

  // ===== 步骤 1: 打开 Options 并启用 ML =====
  log('\n📍 步骤 1: 打开 Options 设置页');
  const optionsPage = await browserContext.newPage();
  await optionsPage.goto(`chrome-extension://${extensionId}/ui/options/options.html`);
  await optionsPage.waitForLoadState('networkidle');
  log('✓ Options 页面已加载');
  await sleep(1000);

  // 启用 ML 情感分析
  log('\n📍 步骤 2: 启用 ML 情感分析');
  
  // 查找 ML 开关
  const mlCheckbox = await optionsPage.locator('#enableMLSentiment').first();
  if (await mlCheckbox.isVisible().catch(() => false)) {
    await mlCheckbox.check();
    log('✅ ML 情感分析已启用');
    
    // 保存设置
    const saveBtn = await optionsPage.locator('button:has-text("保存"), button:has-text("Save"), #save-settings').first();
    if (await saveBtn.isVisible().catch(() => false)) {
      await saveBtn.click();
      log('✓ 设置已保存');
    }
  } else {
    log('⚠️ 未找到 ML 开关，尝试通过 JavaScript 启用');
    await optionsPage.evaluate(() => {
      const checkbox = document.querySelector('#enableMLSentiment');
      if (checkbox) {
        checkbox.checked = true;
        checkbox.dispatchEvent(new Event('change'));
      }
    });
  }
  await sleep(1000);

  // 同时启用评论过滤
  log('\n📍 步骤 3: 启用评论过滤');
  const popupPage = await browserContext.newPage();
  await popupPage.goto(`chrome-extension://${extensionId}/ui/popup/popup.html`);
  await popupPage.waitForLoadState('networkidle');
  
  const toggles = await popupPage.locator('input[type="checkbox"]').all();
  if (toggles.length >= 2) {
    await toggles[0].check(); // 视频过滤
    await toggles[1].check(); // 评论过滤
    log('✅ 视频过滤和评论过滤已启用');
  }
  await sleep(1000);

  // ===== 步骤 4: 访问 Bilibili 视频页 =====
  log('\n📍 步骤 4: 访问 Bilibili 视频页');
  const page = await browserContext.newPage();
  
  // 访问一个有大量评论的视频
  await page.goto('https://www.bilibili.com/video/BV1GJ411x7h7', { 
    waitUntil: 'networkidle',
    timeout: 30000 
  }).catch(async () => {
    // 如果失败，访问首页找一个视频
    await page.goto('https://www.bilibili.com');
    await page.waitForLoadState('networkidle');
    const firstVideo = await page.locator('.bili-video-card a').first();
    if (await firstVideo.isVisible().catch(() => false)) {
      await firstVideo.click();
      await page.waitForLoadState('networkidle');
    }
  });
  
  log('✓ 视频页已加载');
  await sleep(2000);

  // 滚动到评论区
  log('\n📍 步骤 5: 滚动到评论区');
  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight * 0.6);
  });
  await sleep(3000);
  log('✓ 已滚动到评论区');

  // 等待 ML 模型加载（首次使用）
  log('\n📍 步骤 6: 等待 ML 模型加载和分析（首次使用约 30-60 秒）...');
  log('   请观察评论区，ML 分析完成后会显示效果');
  
  // 等待一段时间让 ML 处理
  await sleep(10000);
  
  // 检查是否有评论被处理
  const checkResults = await page.evaluate(() => {
    const allComments = document.querySelectorAll('bili-comment-thread-renderer, bili-comment-reply-renderer, .reply-item, .comment-item');
    const bqfComments = document.querySelectorAll('[class*="bqf-comment"]');
    const hiddenComments = document.querySelectorAll('.bqf-comment-hidden');
    const warnedComments = document.querySelectorAll('.bqf-comment-warned');
    
    return {
      total: allComments.length,
      bqfProcessed: bqfComments.length,
      hidden: hiddenComments.length,
      warned: warnedComments.length
    };
  });
  
  log(`\n📊 评论区统计:`);
  log(`  总评论数: ${checkResults.total}`);
  log(`  BQF 处理: ${checkResults.bqfProcessed}`);
  log(`  已隐藏: ${checkResults.hidden}`);
  log(`  已警告: ${checkResults.warned}`);

  // 截图
  const screenshotPath = path.join(__dirname, 'screenshots', `ml-bilibili-test-${Date.now()}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  log(`\n📸 截图已保存: ${screenshotPath}`);

  // ===== 完成 =====
  console.log('\n' + '='.repeat(70));
  console.log('✅ ML 测试设置完成！');
  console.log('='.repeat(70));
  console.log('\n💡 后续操作:');
  console.log('   1. 在浏览器中继续观察评论区');
  console.log('   2. ML 模型首次加载需要 30-60 秒');
  console.log('   3. 低质量评论会被自动隐藏或标记');
  console.log('   4. 可以刷新页面查看新的过滤效果');
  console.log('\n⚠️  注意:');
  console.log('   - ML 分析需要下载模型（约 50MB）');
  console.log('   - 首次使用会有网络请求到 CDN');
  console.log('   - 如果网络较慢，会回退到关键词过滤');
  console.log('\n按 Ctrl+C 关闭浏览器...');

  // 保持浏览器打开
  await new Promise(() => {});
}

runTest().catch(err => {
  console.error('\n❌ 测试失败:', err.message);
  console.error(err.stack);
  process.exit(1);
});
