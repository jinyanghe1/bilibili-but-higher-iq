# Bilibili Quality Filter - Bug 诊断报告

## 🐛 问题描述
扩展可以运行，但屏蔽效果没有生效。

## 🔍 诊断结果

### 根本原因
扩展依赖**关键词匹配**进行过滤，但默认设置下存在以下问题：

1. **默认关键词存储在 IndexedDB**：首次加载时需要异步初始化
2. **ML 分析默认关闭**：`enableMLSentiment: false`
3. **关键词过滤和 ML 分析互斥**：启用 ML 时不会进行关键词匹配

### 代码逻辑分析

```javascript
// comment-filter.js 中的逻辑
async scoreComment(commentData) {
  // Layer 1: User blocklist check
  // ...
  
  // Layer 2: ML Sentiment (仅当 enableMLSentiment=true 时)
  if (this.settings.enableMLSentiment && content) {
    const mlResult = await analyzeSentiment(content);
    // ...
  }
  
  // Layer 3: Keyword matching (仅当 ML 未启用时)
  if (content && !this.settings.enableMLSentiment) {
    const contentLower = content.toLowerCase();
    // 检查 rageBait/clickbait/homogenized 关键词
  }
}
```

### 发现的问题

| 问题 | 说明 | 影响 |
|------|------|------|
| 关键词-ML 互斥 | 启用 ML 时跳过关键词匹配 | 用户必须二选一 |
| 默认 ML 关闭 | `enableMLSentiment: false` | 依赖关键词，但关键词需要初始化 |
| 异步初始化 | IndexedDB 首次加载需要时间 | 可能错过初始内容 |
| 无默认标题检测 | 标题模式检查未应用 | 标题党检测失效 |

## ✅ 解决方案

### 方案 1: 快速修复（推荐）

修改 `comment-filter.js` 和 `video-scorer.js`，让关键词和 ML 分析同时工作：

```javascript
// 修改前 (互斥)
if (content && !this.settings.enableMLSentiment) {
  // 关键词匹配
}

// 修改后 (共存)
if (content) {
  // 关键词匹配
  if (!this.settings.enableMLSentiment) {
    // ... 关键词逻辑
  }
}
```

### 方案 2: 启用 ML 分析

在 Options 设置页启用 ML 情感分析：

1. 打开扩展 Options 页面
2. 勾选「启用 ML 情感分析」
3. 保存设置

**注意**：首次使用需要下载模型（约 50MB），分析有 100ms 超时限制。

### 方案 3: 添加自定义关键词

通过 Popup 或 Options 添加关键词，立即生效。

### 方案 4: 修复默认行为

修改 `utils/constants.js` 中的默认设置：

```javascript
export const DEFAULT_SETTINGS = {
  enabled: true,
  // ...
  enableMLSentiment: true,  // 改为 true
};
```

## 🧪 提供的测试工具

### 1. ML 分析测试页面
```bash
cd demo
node test-ml-analysis.mjs
```
测试 ML 模型加载和评论分析功能。

### 2. Bilibili 页面上启用 ML
```bash
cd demo
node enable-ml-test.mjs
```
自动打开 Bilibili 并启用 ML 分析。

### 3. 调试诊断脚本
```bash
cd demo
node debug-filter.mjs
```
检查扩展是否正确注入和工作。

## 📝 建议修复

### 立即修复（最小改动）

在 `comment-filter.js` 中，将关键词匹配和 ML 分析改为共存模式：

```javascript
// Layer 2: ML Sentiment analysis (if enabled)
let mlScore = null;
if (this.settings.enableMLSentiment && content) {
  const mlResult = await analyzeSentiment(content);
  if (!mlResult.fallback) {
    mlScore = mlResult.score;
    reasons.push(`ML: ${mlResult.score}`);
  }
}

// Layer 3: Keyword matching (always run for additional context)
if (content) {
  const contentLower = content.toLowerCase();
  // ... 关键词匹配逻辑
  
  // 结合 ML 和关键词分数
  if (mlScore !== null) {
    score = Math.min(mlScore, score); // 取较低分数
  }
}
```

### 长期改进

1. **添加默认标题模式检测**：不依赖关键词，直接分析标题
2. **修复异步初始化**：确保数据库加载完成后再处理内容
3. **添加调试日志**：方便用户排查问题
4. **提供实时统计**：显示已处理/已过滤数量

## 🎯 快速验证

运行以下命令验证修复效果：

```bash
# 1. 检查 ML 测试页面
cd demo && node test-ml-analysis.mjs

# 2. 手动测试扩展
cd demo && node enable-ml-test.mjs
```
