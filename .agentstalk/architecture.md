# Bilibili Quality Filter - Architecture Specification

## 1. 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| **浏览器扩展** | Chrome/Firefox/Safari (Manifest V3) | 跨平台扩展 |
| **存储** | IndexedDB + chrome.storage.sync | 本地持久化 + 云同步 |
| **ML推理** | @xenova/transformers (v0.2.0) | 轻量sentiment分析 |
| **样式隔离** | CSS Modules | 避免样式污染 |
| **构建工具** | Webpack/Vite | 模块打包 |

---

## 2. 模块边界

### 2.1 核心模块

```
┌─────────────────────────────────────────────────────────────┐
│                        EXTENSION                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐   ┌─────────────────┐   ┌───────────────┐  │
│  │  UI Layer   │   │  Business Logic │   │  Data Layer   │  │
│  ├─────────────┤   ├─────────────────┤   ├───────────────┤  │
│  │ popup/      │   │ video-scorer.js │   │ blocklist-     │  │
│  │ options/    │   │ comment-filter.js│   │ manager.js    │  │
│  └─────────────┘   └────────┬────────┘   └───────────────┘  │
│                             │                                │
│                    ┌────────▼────────┐                      │
│                    │  DOM Observer   │                      │
│                    │ dom-observer.js│                      │
│                    └─────────────────┘                      │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 文件索引

| 文件 | 职责 | 公开API |
|------|------|--------|
| `manifest.json` | 扩展配置 | - |
| `utils/constants.js` | 常量定义 | `KEYWORD_BLOCKLISTS`, `SCORE_THRESHOLDS`, `BILIBILI_SELECTORS` |
| `storage/blocklist-manager.js` | 数据存储 | `blocklistManager.init()`, `getKeywordsByCategory()`, `blockUser()`, `isUserBlocked()` |
| `content/video-scorer.js` | 视频评分 | `videoScorer.scoreVideo()`, `extractVideoData()` |
| `content/comment-filter.js` | 评论过滤 | `commentFilter.scoreComment()`, `createShowAnywayButton()` |
| `content/dom-observer.js` | DOM监听 | `initObserver()`, `disconnectObserver()` |
| `background/service-worker.js` | 后台服务 | 消息路由, 跨标签页同步 |
| `ui/popup/*` | 弹窗UI | - |
| `ui/options/*` | 设置页UI | - |

---

## 3. 接口协议

### 3.1 BlocklistManager API

```javascript
class BlocklistManager {
  async init()                                      // 初始化数据库
  async getKeywordsByCategory()                      // 获取分类关键词
  async getAllKeywords()                             // 获取全部关键词
  async addKeyword(keyword, category, weight)         // 添加关键词
  async removeKeyword(keyword, category)             // 删除关键词
  async blockUser(uid, username, reason)              // 屏蔽用户
  async unblockUser(uid)                             // 取消屏蔽
  async isUserBlocked(uid)                           // 检查用户是否被屏蔽
  async getBlockedUsers()                            // 获取已屏蔽用户列表
  async getBlockedUIDSet()                           // 获取UID Set (O(1)查找)
  async addFeedback(type, targetId, action)           // 记录反馈
  async exportData()                                 // 导出数据
  async importData(data)                             // 导入数据
  async clearAll()                                   // 清除全部数据
}
```

### 3.2 VideoScorer API

```javascript
class VideoScorer {
  async init()                                       // 初始化
  async refreshData()                                // 刷新数据(关键词/设置)
  async scoreVideo(videoData)                        // 评分视频
  extractVideoData(videoCard)                        // 从DOM提取视频数据
}

videoData = {
  title: string,     // 视频标题
  author: string,    // 作者名
  uid: string,       // 作者UID
  bvid: string       // 视频BV号
}

返回: {
  score: number,     // 质量分数 0-100
  reasons: string[], // 扣分原因
  action: 'show' | 'dim' | 'hide'  // 处理动作
}
```

### 3.3 CommentFilter API

```javascript
class CommentFilter {
  async init()
  async refreshData()
  async scoreComment(commentData)
  extractCommentData(commentEl)
  createShowAnywayButton(commentEl)
  showComment(commentEl)
  addBlockUserButton(commentEl)
  async recordFeedback(commentEl, action)
}

commentData = {
  content: string,   // 评论内容
  uid: string,       // 用户ID
  username: string,  // 用户名
  rid: string        // 回复ID
}

返回: {
  score: number,
  reasons: string[],
  action: 'show' | 'warn' | 'hide'
}
```

### 3.4 消息协议 (Background ↔ Content)

```javascript
// Content -> Background
chrome.runtime.sendMessage({
  type: 'USER_BLOCKED',
  uid: string,
  username: string
})

// Background -> Content
chrome.runtime.sendMessage({
  type: 'SETTINGS_UPDATED',
  settings: object
})

// Request settings sync
chrome.runtime.sendMessage({ type: 'GET_SETTINGS' })
```

---

## 4. DOM 适配规范

### 4.1 B站 Selector 映射

| 元素 | Selector |
|------|----------|
| 视频卡片 | `.bili-video-card, .bili-feed-card, .feed-card, .floor-single-card, .floor-card, .single-card, .video-page-card-small, .video-pod__item, .card-box, [data-video-id], [data-key^="BV"]` |
| 视频标题 | `.bili-video-card__title, .bili-video-card__info--tit, .video-card__title, .video-title, .title-txt, .title, .entry-title, h3 a, h3` |
| 作者名 | `.bili-video-card__info--author, .bili-video-card__info--owner, .video-card__author, .author, .up-name, a[href*="//space.bilibili.com/"]` |
| 评论宿主 | `bili-comments` |
| 评论列表 / 线程 | `#feed, #contents, bili-comment-thread-renderer, bili-comment-reply-renderer` |
| 评论渲染器 | `bili-comment-renderer, bili-comment-reply-renderer` |
| 评论作者 | `bili-comment-user-info`, `.user-name, .author-name, [data-user-id], .name, #user-name, #user-name a` |
| 评论内容 | `bili-rich-text`, `.comment-content, .text, .content, [data-text], #content, #contents` |
| 主内容区 | `#bili-main, #app, main, [role="main"]` |

评论区适配规范:
- 评论系统按多层 open Shadow DOM 处理，而不是假设为平面 DOM。
- 数据提取优先读取 `bili-comment-renderer` / `bili-comment-reply-renderer` 上的 `__data`。
- DOM 查询仅作为回退路径，回退时需要递归进入 open shadow roots 读取 `#contents`、`#user-name`、`#footer` 等节点。

### 4.2 MutationObserver 配置

```javascript
observer.observe(document.body, {
  childList: true,
  subtree: true
})
```

补充约束:
- 观察器需要递归发现并直接观察 open shadow roots。
- URL 变化探测优先依赖 History API patch、`popstate/hashchange` 和 Navigation API `currententrychange`，轮询仅作为降级方案。

---

## 5. 数据模型

### 5.1 IndexedDB Schema

```
Database: BilibiliQualityFilterDB

keywords:
  - id (autoIncrement, PK)
  - category: string     // 'rageBait' | 'clickbait' | 'homogenized'
  - keyword: string
  - weight: number       // 0.0 - 1.0
  - severity: string    // 'high' | 'medium' | 'low'
  - enabled: boolean

userBlocklist:
  - id (autoIncrement, PK)
  - uid: string (unique)
  - username: string
  - reason: string
  - timestamp: number

feedback:
  - id (autoIncrement, PK)
  - type: string        // 'video' | 'comment'
  - targetId: string
  - action: string     // 'show' | 'hide' | 'block_user' | 'misclassified'
  - timestamp: number
```

### 5.2 chrome.storage.sync Schema

```javascript
settings: {
  enabled: boolean,
  filterRageBait: boolean,
  filterClickbait: boolean,
  filterHomogenized: boolean,
  filterComments: boolean,
  dimInsteadOfHide: boolean,
  autoCollapseComments: boolean,
  showBlockUserButton: boolean,
  commentFilterMode: 'blocklist' | 'allowlist',
  blocklistIntensity: 'simple' | 'mild' | 'radical',
  enableMLSentiment: boolean
}
```

---

## 6. 评分算法

### 6.1 视频评分

```
FinalScore = 100
  - Σ(keyword_weight × keyword_matched_count × category_penalty)
  - pattern_penalty

category_penalty:
  - rageBait: 30
  - clickbait: 20
  - homogenized: 25

pattern_penalty:
  - Excessive punctuation: +10/instance
  - Caps ratio > 30%: +15
  - Emoji spam: +0.5/char
  - Number pattern: +8/instance
  - Repeated chars: +5/instance
  - Title < 10 chars: +10
  - Title > 80 chars: +5
```

### 6.2 评分阈值

| Score | Action |
|-------|--------|
| > 50 | `show` - 正常显示 |
| 31-50 | `dim` - 降低透明度 |
| ≤ 30 | `hide` - 完全隐藏 |

---

## 7. CSS 类名规范

| 类名 | 用途 |
|------|------|
| `.bqf-video-hidden` | 隐藏视频卡片 |
| `.bqf-video-dimmed` | 降低透明度 |
| `.bqf-comment-hidden` | 隐藏评论 |
| `.bqf-comment-shown` | 用户手动显示的评论 |
| `.bqf-show-anyway-btn` | "仍然显示"按钮 |
| `.bqf-block-user-btn` | "屏蔽用户"按钮 |
| `.bqf-badge` | 质量警告徽章 |
