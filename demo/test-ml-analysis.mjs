#!/usr/bin/env node
/**
 * ML 情感分析功能测试
 * 测试步骤：
 * 1. 启动本地 HTTP 服务器
 * 2. 打开测试页面
 * 3. 加载 ML 模型
 * 4. 分析测试评论
 * 5. 生成测试报告
 */

import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const PORT = 8765;
const TEST_TIMEOUT = 120000; // 2分钟（模型加载需要时间）

function log(message) {
  console.log(`[${new Date().toLocaleTimeString()}] ${message}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 启动静态文件服务器
function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let filePath = path.join(repoRoot, req.url === '/' ? 'demo/test-ml-filter.html' : req.url);
      
      // 安全限制
      if (!filePath.startsWith(repoRoot)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        
        const ext = path.extname(filePath);
        const contentType = {
          '.html': 'text/html',
          '.js': 'application/javascript',
          '.mjs': 'application/javascript',
        }[ext] || 'application/octet-stream';
        
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
      });
    });

    server.listen(PORT, () => {
      log(`🌐 测试服务器启动: http://localhost:${PORT}`);
      resolve(server);
    });
  });
}

async function runTest() {
  console.log('\n' + '='.repeat(70));
  console.log('🧠 ML 情感分析功能测试');
  console.log('='.repeat(70) + '\n');

  // 启动服务器
  const server = await startServer();
  
  // 启动浏览器
  log('🚀 启动 Chromium...');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 }
  });
  const page = await context.newPage();

  // 收集控制台日志
  const logs = [];
  page.on('console', msg => {
    const text = msg.text();
    logs.push(text);
    if (text.includes('[BQF]') || text.includes('ML')) {
      log(`📝 ${text}`);
    }
  });

  try {
    // 打开测试页面
    log('\n📍 打开测试页面...');
    await page.goto(`http://localhost:${PORT}/demo/test-ml-filter.html`, {
      waitUntil: 'networkidle'
    });
    await sleep(1000);

    // 点击加载模型按钮
    log('\n📍 步骤 1: 加载 ML 模型 (约 30-60 秒)...');
    await page.click('#loadModel');
    
    // 等待模型加载完成
    await page.waitForFunction(() => {
      const btn = document.querySelector('#analyzeAll');
      return !btn.disabled;
    }, { timeout: TEST_TIMEOUT });
    
    log('✅ ML 模型加载完成');
    await sleep(1000);

    // 分析所有评论
    log('\n📍 步骤 2: 分析测试评论...');
    await page.click('#analyzeAll');
    
    // 等待分析完成
    await page.waitForFunction(() => {
      const status = document.querySelector('#status');
      return status && status.textContent.includes('完成');
    }, { timeout: 60000 });
    
    log('✅ 评论分析完成');
    await sleep(1000);

    // 收集结果
    log('\n📍 步骤 3: 收集分析结果...');
    const results = await page.evaluate(() => {
      const comments = document.querySelectorAll('.comment-box');
      return Array.from(comments).map(box => ({
        text: box.querySelector('.comment-text').textContent.slice(0, 30),
        score: box.dataset.score || 'N/A',
        isFiltered: box.classList.contains('filtered')
      }));
    });

    // 生成报告
    console.log('\n' + '='.repeat(70));
    console.log('📊 ML 分析测试报告');
    console.log('='.repeat(70));
    
    console.log('\n测试评论及得分:');
    results.forEach((r, i) => {
      const scoreNum = parseInt(r.score);
      const quality = scoreNum >= 80 ? '✅ 高质量' : scoreNum < 40 ? '❌ 低质量' : '⚠️ 中等';
      const filtered = r.isFiltered ? '[已过滤]' : '';
      console.log(`  ${i + 1}. "${r.text}..."`);
      console.log(`     得分: ${r.score}/100 ${quality} ${filtered}\n`);
    });

    // 统计
    const highQuality = results.filter(r => parseInt(r.score) >= 80).length;
    const lowQuality = results.filter(r => parseInt(r.score) < 40).length;
    const medium = results.length - highQuality - lowQuality;

    console.log('统计摘要:');
    console.log(`  高质量评论 (80-100): ${highQuality} 条`);
    console.log(`  中等质量评论 (40-79): ${medium} 条`);
    console.log(`  低质量评论 (0-39): ${lowQuality} 条`);
    console.log(`  被过滤评论: ${results.filter(r => r.isFiltered).length} 条`);

    // 验证功能
    console.log('\n功能验证:');
    const hasHighScore = results.some(r => parseInt(r.score) >= 80);
    const hasLowScore = results.some(r => parseInt(r.score) < 40);
    const hasDifferentiation = hasHighScore && hasLowScore;
    
    if (hasDifferentiation) {
      console.log('  ✅ ML 模型能够区分高质量和低质量评论');
    } else {
      console.log('  ⚠️ ML 模型区分度不够明显');
    }

    // 保存截图
    const screenshotPath = path.join(__dirname, 'screenshots', 'ml-test-result.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`\n📸 截图已保存: ${screenshotPath}`);

    console.log('\n' + '='.repeat(70));
    console.log('✅ ML 情感分析测试完成！');
    console.log('='.repeat(70));

  } catch (err) {
    console.error('\n❌ 测试失败:', err.message);
    await page.screenshot({ 
      path: path.join(__dirname, 'screenshots', 'ml-test-error.png'),
      fullPage: true 
    });
  } finally {
    // 清理
    await sleep(3000);
    await browser.close();
    server.close();
    log('浏览器和服务器已关闭');
  }
}

runTest().catch(err => {
  console.error('测试失败:', err);
  process.exit(1);
});
