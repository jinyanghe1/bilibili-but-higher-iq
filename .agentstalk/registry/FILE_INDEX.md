# Agent Registry - File Index

记录每个 Agent 负责的文件索引，防止功能重叠。

## 文件所有权

| Agent | 文件 | 职责 |
|-------|------|------|
| claude | manifest.json | 扩展配置 |
| claude | utils/constants.js | 常量定义 |
| claude | storage/blocklist-manager.js | 数据存储层 |
| claude | content/video-scorer.js | 视频评分逻辑 |
| claude | content/comment-filter.js | 评论过滤逻辑 |
| claude | content/dom-observer.js | DOM监听 |
| claude | background/service-worker.js | 后台服务 |
| claude | ui/popup/* | 弹窗UI |
| claude | ui/options/* | 设置页UI |
| claude | styles/content.css | 样式 |

## 接口依赖

```
dom-observer.js
  ├── 依赖: video-scorer.js
  ├── 依赖: comment-filter.js
  └── 依赖: constants.js (BILIBILI_SELECTORS)

video-scorer.js
  ├── 依赖: blocklist-manager.js
  └── 依赖: constants.js

comment-filter.js
  ├── 依赖: blocklist-manager.js
  └── 依赖: constants.js

service-worker.js
  ├── 依赖: blocklist-manager.js
  └── 消息: USER_BLOCKED, SETTINGS_UPDATED

popup.js / options.js
  └── 依赖: blocklist-manager.js
```
