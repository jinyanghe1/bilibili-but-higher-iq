#!/usr/bin/env node
/**
 * Bilibili Quality Filter - 真实网页功能演示 (自动版)
 * 使用真实 Bilibili 网页展示扩展效果
 * 演示时长: 约 2 分钟，完成后自动关闭
 * 
 * 使用方法:
 *   cd demo && npm install && npm run demo
 */

import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const extensionPath = repoRoot;

// 演示步骤延迟
const STEP_DELAY = 2500;
const ACTION_DELAY = 1200;

async function log(message, delay = 0) {
  const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  console.log(`[${timestamp}] ${message}`);
  if (delay > 0) await sleep(delay);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function screenshot(page, name) {
  const screenshotDir = path.join(__dirname, 'screenshots');
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }
  const screenshotPath = path.join(screenshotDir, `${Date.now()}-${name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`  📸 截图: ${name}.png`);
  return screenshotPath;
}

async function runDemo() {
  console.log('\n' + '='.repeat(70));
  console.log('🎬 Bilibili Quality Filter - 真实网页功能演示');
  console.log('   演示时长约 2 分钟，请观察浏览器窗口');
  console.log('='.repeat(70) + '\n');

  let browserContext;
  
  try {
    // 启动带扩展的浏览器
    log('🚀 启动 Chromium 并加载扩展...');
    const userDataDir = path.join(__dirname, '.user-data');
    
    browserContext = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-first-run',
      ],
      viewport: { width: 1440, height: 900 },
    });

    // 获取扩展 ID
    const extensionId = await getExtensionId(browserContext);
    if (!extensionId) {
      throw new Error('无法获取扩展 ID，请检查扩展是否正确加载');
    }
    log(`✅ 扩展已加载 (ID: ${extensionId.slice(0, 8)}...)`);
    await sleep(STEP_DELAY);

    // ===== 场景 1: 访问 Bilibili 首页 =====
    log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    log('📍 场景 1/10: 访问 Bilibili 首页 (过滤前)');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    const page = await browserContext.newPage();
    await page.goto('https://www.bilibili.com', { waitUntil: 'networkidle' });
    log('✓ 页面加载完成');
    
    const videoCards = await page.locator('.bili-video-card').count();
    log(`✓ 检测到 ${videoCards} 个视频卡片`);
    await screenshot(page, '01-homepage-before');
    await sleep(STEP_DELAY);

    // ===== 场景 2: 打开扩展 Popup =====
    log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    log('📍 场景 2/10: 打开扩展 Popup 设置界面');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const popupPage = await browserContext.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/ui/popup/popup.html`);
    await popupPage.waitForLoadState('networkidle');
    log('✓ Popup 界面已打开');
    
    await screenshot(popupPage, '02-popup-default');
    await sleep(STEP_DELAY);

    // ===== 场景 3: 启用视频过滤 =====
    log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    log('📍 场景 3/10: 配置过滤参数');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // 启用主开关
    const toggles = await popupPage.locator('input[type="checkbox"]').all();
    if (toggles.length > 0) {
      await toggles[0].check();
      log('✓ 视频过滤: 开启');
    }
    await sleep(ACTION_DELAY);
    
    // 选择过滤模式
    const modeRadios = await popupPage.locator('input[type="radio"]').all();
    if (modeRadios.length >= 2) {
      await modeRadios[1].check();
      log('✓ 过滤模式: 严格模式');
    }
    await sleep(ACTION_DELAY);
    
    // 设置强度
    const sliders = await popupPage.locator('input[type="range"]').all();
    if (sliders.length > 0) {
      await sliders[0].fill('75');
      log('✓ 过滤强度: 75%');
    }
    await sleep(ACTION_DELAY);

    await screenshot(popupPage, '03-popup-configured');
    await sleep(STEP_DELAY);

    // ===== 场景 4: 查看过滤后的首页 =====
    log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    log('📍 场景 4/10: 刷新首页查看过滤效果');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    await page.bringToFront();
    await page.reload({ waitUntil: 'networkidle' });
    log('✓ 页面已刷新，扩展开始过滤...');
    await sleep(3500);
    
    // 检查被处理的卡片
    const dimmedCards = await page.locator('.bqf-dimmed, [data-bqf-dimmed], [style*="opacity"]').count();
    const hiddenCards = await page.locator('.bqf-hidden, [data-bqf-hidden], [style*="display: none"]').count();
    
    log(`✓ 过滤结果统计:`);
    log(`  • 已淡化处理: ${dimmedCards} 个视频`);
    log(`  • 已隐藏处理: ${hiddenCards} 个视频`);
    
    await screenshot(page, '04-homepage-filtered');
    await sleep(STEP_DELAY);

    // ===== 场景 5: 打开详细设置页 =====
    log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    log('📍 场景 5/10: 打开 Options 详细设置页');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    const optionsPage = await browserContext.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/ui/options/options.html`);
    await optionsPage.waitForLoadState('networkidle');
    log('✓ Options 设置页已加载');
    await sleep(ACTION_DELAY);
    
    await screenshot(optionsPage, '05-options-page');
    await sleep(STEP_DELAY);

    // ===== 场景 6: 添加屏蔽关键词 =====
    log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    log('📍 场景 6/10: 添加自定义屏蔽关键词');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const inputs = await optionsPage.locator('input[type="text"]').all();
    const addBtns = await optionsPage.locator('button').filter({ hasText: /添加|Add/ }).all();
    
    if (inputs.length > 0 && addBtns.length > 0) {
      await inputs[0].fill('震惊');
      await sleep(500);
      await addBtns[0].click();
      log('✓ 添加关键词: "震惊"');
      await sleep(ACTION_DELAY);
      
      await inputs[0].fill('标题党');
      await sleep(500);
      await addBtns[0].click();
      log('✓ 添加关键词: "标题党"');
      await sleep(ACTION_DELAY);
      
      await inputs[0].fill('引战');
      await sleep(500);
      await addBtns[0].click();
      log('✓ 添加关键词: "引战"');
    } else {
      log('⚠ 未找到关键词输入区域');
    }
    
    await screenshot(optionsPage, '06-keywords-added');
    await sleep(STEP_DELAY);

    // ===== 场景 7: 访问视频页展示评论区 =====
    log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    log('📍 场景 7/10: 访问视频页查看评论');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    await page.bringToFront();
    // 点击第一个视频
    const videoLinks = await page.locator('.bili-video-card a[href*="/video/"]').all();
    if (videoLinks.length > 0) {
      await videoLinks[0].click();
      await page.waitForLoadState('networkidle');
      log('✓ 进入视频详情页');
    }
    await sleep(2000);
    
    // 滚动到评论区
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.6));
    await sleep(2000);
    log('✓ 已滚动到评论区');
    
    await screenshot(page, '07-video-comments');
    await sleep(STEP_DELAY);

    // ===== 场景 8: 启用评论过滤 =====
    log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    log('📍 场景 8/10: 启用评论过滤');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    await popupPage.bringToFront();
    
    if (toggles.length > 1) {
      await toggles[1].check();
      log('✓ 评论过滤: 开启');
    }
    await sleep(ACTION_DELAY);
    
    await screenshot(popupPage, '08-comment-filter-enabled');
    await sleep(STEP_DELAY);

    // ===== 场景 9: 展示用户屏蔽功能 =====
    log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    log('📍 场景 9/10: 用户屏蔽功能');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    await page.bringToFront();
    await sleep(1000);
    
    // 查找评论用户名
    const usernames = await page.locator('#user-name, .user-name, .name, bili-comment-user-info').all();
    if (usernames.length > 0) {
      log(`✓ 检测到 ${usernames.length} 个评论用户`);
      log('💡 在真实扩展中，鼠标悬停会显示"屏蔽此用户"按钮');
    } else {
      log('⚠ 评论区可能还在加载');
    }
    
    await screenshot(page, '09-user-block-feature');
    await sleep(STEP_DELAY);

    // ===== 场景 10: 数据导出 =====
    log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    log('📍 场景 10/10: 导出设置数据');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    await optionsPage.bringToFront();
    await optionsPage.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(1000);
    
    const exportBtns = await optionsPage.locator('button').filter({ 
      hasText: /导出|Export|保存|Download/ 
    }).all();
    
    if (exportBtns.length > 0) {
      try {
        const [download] = await Promise.all([
          optionsPage.waitForEvent('download', { timeout: 3000 }),
          exportBtns[0].click(),
        ]);
        
        if (download) {
          const downloadPath = path.join(__dirname, 'screenshots', 'bqf-settings.json');
          await download.saveAs(downloadPath);
          log('✓ 设置已导出到: bqf-settings.json');
        }
      } catch (e) {
        log('✓ 导出功能已触发');
      }
    }
    
    await screenshot(optionsPage, '10-export-complete');
    await sleep(STEP_DELAY);

    // ===== 演示结束 =====
    log('\n' + '='.repeat(70));
    log('✅ 演示完成！');
    log('='.repeat(70));
    
  } catch (err) {
    console.error('\n❌ 演示失败:', err.message);
    console.error(err.stack);
  } finally {
    // 列出所有截图
    const screenshotDir = path.join(__dirname, 'screenshots');
    if (fs.existsSync(screenshotDir)) {
      const screenshots = fs.readdirSync(screenshotDir)
        .filter(f => f.endsWith('.png') || f.endsWith('.json'))
        .sort();
      console.log(`\n📁 生成的文件 (${screenshots.length} 个):`);
      screenshots.forEach((file, i) => {
        const prefix = file.endsWith('.json') ? '💾' : '📸';
        console.log(`   ${String(i + 1).padStart(2)}. ${prefix} ${file}`);
      });
      console.log(`\n📂 文件位置: ${screenshotDir}`);
    }

    console.log('\n💡 浏览器将在 3 秒后关闭...');
    await sleep(3000);
    
    if (browserContext) {
      await browserContext.close();
      console.log('✓ 浏览器已关闭');
    }
    
    console.log('\n🎉 演示结束！');
  }
}

// 获取扩展 ID
async function getExtensionId(context) {
  await sleep(2000);
  
  // 方法1: 从 service worker
  const workers = context.serviceWorkers();
  for (const worker of workers) {
    const match = worker.url().match(/chrome-extension:\/\/([^/]+)/);
    if (match) return match[1];
  }
  
  // 方法2: 从 extensions 页面
  const page = await context.newPage();
  await page.goto('chrome://extensions/');
  await sleep(1000);
  
  const id = await page.evaluate(() => {
    const items = document.querySelectorAll('extensions-item');
    for (const item of items) {
      const name = item.shadowRoot?.querySelector('#name')?.textContent || '';
      if (name.toLowerCase().includes('bilibili')) {
        return item.id;
      }
    }
    return null;
  });
  
  await page.close();
  return id;
}

// 运行
runDemo();
