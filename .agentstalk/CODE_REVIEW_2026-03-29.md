# Bilibili Quality Filter - 严厉代码审查报告
**审查日期:** 2026-03-29  
**审查人:** kimi  
**代码版本:** v0.1.0 MVP  
**被审查任务:** Task 015 (codex 正在进行 Shadow DOM 修复)

---

## 🔴 关键问题 (Critical)

### 1. Shadow DOM 支持缺失 (任务 015 正在修复)

**问题描述:**
当前代码完全没有处理 Shadow DOM，这是 Bilibili 使用 Web Components 后的核心技术。

**影响范围:**
- `content/dom-observer.js`: 第 342-362 行使用标准 `querySelectorAll`，无法穿透 Shadow DOM
- `content/video-scorer.js`: 第 253-258 行使用标准 DOM 查询
- `content/comment-filter.js`: 已有部分 Shadow DOM 支持 (第 358-420 行)，但实现零散且未统一

**具体代码问题:**
```javascript
// dom-observer.js 第 356-361 行 - 完全失效于 Shadow DOM
element.querySelectorAll?.(BILIBILI_SELECTORS.VIDEO_CARD).forEach((card) => {
  this.pendingVideos.add(card);
});

// video-scorer.js 第 253 行 - 无法获取 shadow 内元素
const titleEl = videoCard.querySelector(BILIBILI_SELECTORS.VIDEO_CARD_TITLE);
```

**建议:**
- ✅ Task 016 已创建 `utils/shadow-dom-utils.js` 作为配套支持
- ⚠️ Task 015 需要整合该工具模块到所有 DOM 查询处

### 2. ML 模块依赖缺失

**问题描述:**
`content/comment-filter.js` 第 14 行导入 `../ml/sentiment-analyzer.js`，但此文件不存在。

**影响:**
- 扩展加载时会报错
- 影响评论过滤功能的正常运行

**临时修复建议:**
```javascript
// 添加降级处理
try {
  const { analyzeSentiment } = await import('../ml/sentiment-analyzer.js');
} catch {
  // 使用简单降级算法
}
```

---

## 🟠 架构违规 (Architecture Violations)

### 3. 架构.md 文档过时

**问题:**
`architecture.md` 第 153-164 行的 DOM 选择器已过时，与 Bilibili 当前实际 DOM 结构不符。

**对比:**
| architecture.md 定义 | 当前实际代码 | Bilibili 实际 DOM |
|---------------------|-------------|------------------|
| `.bili-video-card` | 已扩展 | `bili-video-card` (Web Component) |
| `.comment-list` | 部分支持 Shadow | `bili-comments` (Shadow Host) |
| `.comment-item` | 部分支持 | `bili-comment-thread-renderer` |

**建议:**
更新 architecture.md 第 4.1 节，添加 Shadow DOM 适配规范。

### 4. 选择器定义分散

**问题:**
BILIBILI_SELECTORS 定义在 `utils/constants.js`，但实际的 Shadow DOM 查询逻辑分散在:
- `comment-filter.js` 第 358-420 行
- 造成维护困难和重复代码

**违规:**
违反 architecture.md 第 2.2 节 "模块边界" 原则。

---

## 🟡 代码质量问题 (Code Quality)

### 5. 重复代码

**5.1 状态管理重复**
```javascript
// video-scorer.js 第 36-40 行
constructor() {
  this.keywords = null;
  this.blockedUIDs = null;
  this.settings = null;
  this.initialized = false;
}

// comment-filter.js 第 31-36 行 - 完全相同的结构
constructor() {
  this.keywords = null;
  this.blockedUIDs = null;
  this.settings = null;
  this.initialized = false;
}
```

**建议:** 提取基类 `BaseFilter` 到 `utils/base-filter.js`。

**5.2 文本标准化重复**
```javascript
// video-scorer.js 第 13-15 行
function normalizeText(value) {
  return (value || '').replace(/\s+/g, ' ').trim();
}

// comment-filter.js 第 18-20 行 - 完全相同的函数
function normalizeText(value) {
  return (value || '').replace(/\s+/g, ' ').trim();
}
```

**建议:** 移到 `utils/text-utils.js`。

### 6. 错误处理不一致

**6.1 初始化失败处理**
```javascript
// video-scorer.js 第 43-53 行
async init() {
  if (this.initialized) return;
  try {
    await blocklistManager.init();
    await this.refreshData();
    this.initialized = true;
  } catch (error) {
    console.error('[BQF] VideoScorer init failed:', error);
    // ❌ 没有抛出错误，调用方无法知道初始化失败
  }
}
```

**6.2 对比 comment-filter.js 相同问题**
```javascript
// comment-filter.js 第 39-48 行
async init() {
  if (this.initialized) return;
  try {
    await blocklistManager.init();
    await this.refreshData();
    this.initialized = true;
  } catch (error) {
    console.error('[BQF] CommentFilter init failed:', error);
    // ❌ 同样没有抛出错误
  }
}
```

**风险:** 初始化失败后，后续调用可能使用未初始化的数据，导致不可预期的行为。

### 7. 内存泄漏风险

**7.1 WeakSet/WeakMap 使用正确，但缺少清理机制**

`dom-observer.js` 第 28-33 行使用 WeakSet 是正确的，但第 761-791 行的 `styleSnapshots` 使用 WeakMap 存储样式快照，存在潜在问题:

```javascript
// dom-observer.js 第 761-791 行
snapshotInlineStyle(element) {
  if (!element || this.styleSnapshots.has(element)) {
    return;
  }
  this.styleSnapshots.set(element, { ... });
}
```

**问题:** 如果元素从 DOM 移除但没有调用 `restoreInlineStyle`，WeakMap 会自动释放，但如果元素长期存在，快照会累积。

### 8. 异步操作竞态条件

**8.1 dom-observer.js 第 418-456 行**
```javascript
async processVideoCard(card) {
  const scanVersion = this.scanVersion;
  this.processingVideos.add(card);
  
  try {
    const result = await videoScorer.scoreVideo(videoData);
    if (!card.isConnected || scanVersion !== this.scanVersion) {
      return;  // ✅ 正确的版本检查
    }
    // ...
  }
}
```

✅ 此处理正确，使用了 scanVersion 机制防止竞态。

---

## 🔵 安全问题 (Security)

### 9. 潜在的 XSS 风险

**9.1 innerHTML 使用 (未发现直接使用)**
代码审查未发现直接的 `innerHTML` 使用，这是好的。

**9.2 textContent 使用正确**
```javascript
// dom-observer.js 第 525-526 行 - 安全
badge.textContent = 'BQF · Low quality';
```

**9.3 用户输入未完全转义**
```javascript
// comment-filter.js 第 441 行
btn.textContent = chrome.i18n.getMessage('showAnyway') || 'Show anyway';
// ✅ 安全，使用 textContent

// 但第 629 行:
reasonEl.textContent = `Filtered comment: ${this.getReasonText(...)}`;
// ⚠️ getReasonText 返回用户可能接触的数据，需要确认是否转义
```

### 10. 存储安全

**10.1 blocklist-manager.js**
数据存储在 IndexedDB 和 chrome.storage.sync，没有加密。

**风险评估:** 低。扩展数据不涉及敏感个人信息。

---

## 🟣 性能问题 (Performance)

### 11. MutationObserver 配置过于激进

**11.1 dom-observer.js 第 274-278 行**
```javascript
this.observer.observe(targetNode, {
  childList: true,
  subtree: true,
  characterData: true  // ⚠️ 监听文本变化非常昂贵
});
```

**问题:**
- `characterData: true` 会导致每个字符输入都触发回调
- 在大型 SPA (如 Bilibili) 上会造成明显的性能问题

**建议:**
```javascript
// 只在必要时监听 characterData
if (shouldWatchCharacterData()) {
  options.characterData = true;
}
```

### 12. URL 轮询机制

**12.1 dom-observer.js 第 102-104 行**
```javascript
this.urlPollTimer = window.setInterval(() => {
  this.handlePotentialUrlChange();
}, 1000);
```

**问题:**
- 每秒轮询一次，即使页面无变化
- 与现代 SPA 的原生 Navigation API 相比效率低

**建议:**
- 优先使用 `navigation.addEventListener('navigate', ...)`
- 轮询作为降级方案

### 13. 样式快照内存占用

**13.1 dom-observer.js 第 32 行**
```javascript
this.styleSnapshots = new WeakMap();
```

为每个处理的元素存储样式快照，在长时间浏览时可能占用大量内存。

---

## 🟤 设计问题 (Design)

### 14. 单例模式过度使用

所有主要类都是单例:
- `video-scorer.js`: `export const videoScorer = new VideoScorer();`
- `comment-filter.js`: `export const commentFilter = new CommentFilter();`
- `dom-observer.js`: `const domObserver = new DOMObserver();`

**问题:**
- 单元测试困难
- 状态共享导致副作用难以追踪

### 15. 配置分散

设置项分散在:
- `utils/constants.js`: `DEFAULT_SETTINGS`
- `storage/blocklist-manager.js`: `DEFAULT_SETTINGS`
- `background/service-worker.js`: 从 `chrome.storage.sync` 读取

**问题:** 重复定义，容易导致不一致。

---

## 📋 修复优先级建议

| 优先级 | 问题 | 负责 Agent | ETA |
|-------|------|-----------|-----|
| P0 | Shadow DOM 支持 | codex (Task 015) | 2026-03-29 |
| P0 | ML 模块缺失 | - | 2026-03-29 |
| P1 | 重复代码提取 | kimi | 2026-03-30 |
| P1 | 错误处理统一 | kimi | 2026-03-30 |
| P2 | PerformanceObserver 优化 | - | v0.2.0 |
| P2 | 架构文档更新 | - | v0.2.0 |

---

## ✅ 代码优点 (Positives)

1. **现代 ES 模块使用**: 正确使用 ES6+ 模块系统
2. **MutationObserver 版本控制**: 使用 scanVersion 防止竞态条件
3. **WeakSet/WeakMap**: 正确使用弱引用避免内存泄漏
4. **样式快照机制**: 恢复原始样式的设计是周到的
5. **国际化支持**: 完整的 i18n 实现

---

## 📝 结论

当前代码在功能设计上基本合理，但存在以下严重问题:

1. **Shadow DOM 缺失** - 导致扩展在 Bilibili 实际页面上几乎完全失效 (Task 015 正在修复)
2. **ML 模块缺失** - 导致评论过滤报错
3. **代码重复** - 维护成本高
4. **性能优化空间** - MutationObserver 配置过于激进

**建议:**
- 优先完成 Task 015 的 Shadow DOM 修复
- 添加缺失的 ML 模块或移除相关代码
- 在 v0.2.0 中进行代码重构，提取公共模块

---

**审查完成时间:** 2026-03-29 19:45 CST  
**下次审查建议时间:** Task 015 完成后
