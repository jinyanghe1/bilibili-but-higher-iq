# Shadow DOM 集成指南
> 为 Task 015 (codex) 提供 `utils/shadow-dom-utils.js` 的集成说明

## 背景

Bilibili 大量使用 Web Components 和 Shadow DOM，导致传统的 DOM 查询方法失效。本指南说明如何将 `utils/shadow-dom-utils.js` 集成到现有代码中。

## 快速集成

### 1. DOM Observer 集成

在 `content/dom-observer.js` 中：

```javascript
// 添加导入
import { 
  deepQuerySelectorAll, 
  observeShadowDOM,
  BILIBILI_SHADOW_SELECTORS 
} from '../utils/shadow-dom-utils.js';

// 修改 collectCandidates 方法
class DOMObserver {
  collectCandidates(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
    
    const element = /** @type {Element} */ (node);
    
    // 使用深度查询替代标准 querySelector
    const videoCards = deepQuerySelectorAll(
      BILIBILI_SHADOW_SELECTORS.VIDEO_CARD, 
      element
    );
    videoCards.forEach(card => this.pendingVideos.add(card));
    
    const commentItems = deepQuerySelectorAll(
      BILIBILI_SHADOW_SELECTORS.COMMENT_ITEM,
      element
    );
    commentItems.forEach(comment => this.pendingComments.add(comment));
  }
  
  // 使用跨 Shadow DOM 的观察器
  startObserving() {
    this.disconnectShadowObserver = observeShadowDOM(
      (mutations) => this.handleMutations(mutations),
      document.body
    );
  }
  
  disconnect() {
    // ... 其他清理
    if (this.disconnectShadowObserver) {
      this.disconnectShadowObserver();
    }
  }
}
```

### 2. Video Scorer 集成

在 `content/video-scorer.js` 中：

```javascript
import { deepQuerySelector } from '../utils/shadow-dom-utils.js';

extractVideoData(videoCard) {
  const data = { title: '', author: '', uid: null, bvid: null };
  
  try {
    // 穿透 Shadow DOM 获取标题
    const titleEl = deepQuerySelector(
      BILIBILI_SELECTORS.VIDEO_CARD_TITLE,
      videoCard
    );
    
    // 获取作者信息（可能在 shadow root 内）
    const authorEl = deepQuerySelector(
      BILIBILI_SELECTORS.VIDEO_CARD_AUTHOR,
      videoCard
    );
    
    // ... 其余提取逻辑
  } catch (error) {
    console.error('[BQF] Error extracting video data:', error);
  }
  
  return data;
}
```

### 3. Comment Filter 集成

`content/comment-filter.js` 已有部分 Shadow DOM 支持，可以简化为：

```javascript
import { 
  findParentCustomElement,
  getShadowHost,
  deepQuerySelector 
} from '../utils/shadow-dom-utils.js';

// 替代现有的 getCommentRenderer 方法
getCommentRenderer(commentEl) {
  // 直接查找自定义元素
  return findParentCustomElement(commentEl, 'bili-comment-renderer') ||
         findParentCustomElement(commentEl, 'bili-comment-thread-renderer');
}

// 获取评论内容（穿透多层 shadow DOM）
getCommentTextElement(commentEl) {
  // 使用深度查询
  return deepQuerySelector('#contents', commentEl) ||
         deepQuerySelector(BILIBILI_SELECTORS.COMMENT_CONTENT, commentEl);
}
```

## 性能优化

### 缓存 Shadow Root 查询

```javascript
class DOMObserver {
  constructor() {
    this.shadowRootCache = new WeakMap();
  }
  
  getCachedShadowRoots(element) {
    if (this.shadowRootCache.has(element)) {
      return this.shadowRootCache.get(element);
    }
    
    const roots = getAllShadowRoots(element);
    this.shadowRootCache.set(element, roots);
    return roots;
  }
}
```

### 批量处理

```javascript
// 不好的做法：每个元素单独查询
elements.forEach(el => {
  const card = el.querySelector('.bili-video-card');
  // ...
});

// 好的做法：批量深度查询
const allCards = deepQuerySelectorAll('.bili-video-card', document);
```

## 常见问题

### Q: 深度查询太慢？

A: 限制查询范围到特定容器，而非整个 document：

```javascript
// 慢
const cards = deepQuerySelectorAll('.bili-video-card', document);

// 快
const feedContainer = document.querySelector('.feed-content');
const cards = deepQuerySelectorAll('.bili-video-card', feedContainer);
```

### Q: 自定义元素还未定义？

A: 使用 `waitForCustomElement`：

```javascript
import { waitForCustomElement } from '../utils/shadow-dom-utils.js';

try {
  const commentRoot = await waitForCustomElement('bili-comments', 5000);
  // 开始处理评论
} catch (e) {
  console.log('评论组件加载超时');
}
```

### Q: 如何调试 Shadow DOM？

A: 在控制台使用：

```javascript
// 查看元素的所有 shadow roots
import { getAllShadowRoots } from './utils/shadow-dom-utils.js';
getAllShadowRoots(document).forEach((root, i) => {
  console.log(`Shadow Root ${i}:`, root.host);
});
```

## 测试验证

运行 Shadow DOM 探测工具：

```bash
cd tests
npm run probe:shadowdom -- --json
```

预期输出：
```json
{
  "url": "https://www.bilibili.com/",
  "results": {
    "VIDEO_CARD": 21,
    "VIDEO_CARD_TITLE": 21,
    "COMMENT_ITEM": 0  // 首页可能没有评论
  }
}
```

## 迁移检查清单

- [ ] `dom-observer.js` 使用 `deepQuerySelectorAll` 替代 `querySelectorAll`
- [ ] `dom-observer.js` 使用 `observeShadowDOM` 替代标准 MutationObserver
- [ ] `video-scorer.js` 使用 `deepQuerySelector` 提取视频数据
- [ ] `comment-filter.js` 简化 Shadow DOM 访问逻辑
- [ ] 验证视频卡片过滤在首页正常工作
- [ ] 验证评论过滤在视频页正常工作
- [ ] 性能测试：页面滚动无明显卡顿

## 参考

- `utils/shadow-dom-utils.js` - 完整 API 文档
- `tests/e2e/shadow-dom-probe.mjs` - 实际页面测试工具
- https://developer.mozilla.org/en-US/docs/Web/Web_Components/Using_shadow_DOM
