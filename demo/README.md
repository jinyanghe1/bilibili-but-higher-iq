# Bilibili Quality Filter - 功能演示

使用真实 Bilibili 网页展示扩展各项功能的自动化演示脚本。

## 📹 演示内容 (约 2 分钟)

| 场景 | 内容 | 时长 |
|------|------|------|
| 1 | 访问 Bilibili 首页（过滤前） | 15s |
| 2 | 打开扩展 Popup 界面 | 10s |
| 3 | 配置过滤参数（开启/模式/强度） | 15s |
| 4 | 刷新首页查看过滤效果 | 20s |
| 5 | 打开 Options 详细设置页 | 10s |
| 6 | 添加自定义屏蔽关键词 | 15s |
| 7 | 访问视频页查看评论 | 20s |
| 8 | 启用评论过滤 | 10s |
| 9 | 展示用户屏蔽功能 | 10s |
| 10 | 导出设置数据 | 10s |

## 🚀 快速开始

### 安装依赖

```bash
cd demo
npm install
```

### 运行演示

```bash
npm run demo
```

演示将自动：
1. 启动 Chromium 浏览器
2. 加载本地扩展 (`../` 目录)
3. 访问真实 Bilibili 网站
4. 依次展示 10 个功能场景
5. 自动截图保存到 `screenshots/` 目录
6. 完成后自动关闭浏览器

## 📁 输出文件

演示完成后会在 `screenshots/` 目录生成：

```
screenshots/
├── 01-homepage-before.png      # 首页过滤前
├── 02-popup-default.png         # Popup 默认状态
├── 03-popup-configured.png      # Popup 配置后
├── 04-homepage-filtered.png     # 首页过滤后
├── 05-options-page.png          # 设置页概览
├── 06-keywords-added.png        # 添加关键词
├── 07-video-comments.png        # 视频页评论
├── 08-comment-filter-enabled.png # 评论过滤开启
├── 09-user-block-feature.png    # 用户屏蔽功能
├── 10-export-complete.png       # 导出设置
└── bqf-settings.json            # 导出的设置文件
```

## ⚙️ 自定义配置

编辑 `bilibili-filter-demo.mjs` 文件修改以下参数：

```javascript
// 演示步骤延迟（毫秒）
const STEP_DELAY = 2500;      // 场景间隔
const ACTION_DELAY = 1200;    // 操作间隔
```

## 🐛 故障排除

### 扩展未加载
- 检查 `../manifest.json` 是否存在
- 确保扩展目录结构正确

### 页面加载失败
- 检查网络连接
- Bilibili 可能需要登录才能完全展示功能

### 截图为空白
- 可能是页面还在加载，增加 `STEP_DELAY`
- 某些元素可能被广告拦截器阻挡

## 📝 注意事项

1. **网络要求**：需要能访问 Bilibili 网站
2. **登录状态**：演示使用未登录状态，建议登录后手动测试完整功能
3. **浏览器数据**：演示使用 `demo/.user-data` 目录保存浏览器数据
4. **截图大小**：完整页面截图约 1MB/张

## 🎬 演示预览

运行演示时会看到：

```
======================================================================
🎬 Bilibili Quality Filter - 真实网页功能演示
   演示时长约 2 分钟，请观察浏览器窗口
======================================================================

[20:17:53] 🚀 启动 Chromium 并加载扩展...
[20:17:59] ✅ 扩展已加载 (ID: ggjbdpfj...)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[20:18:02] 📍 场景 1/10: 访问 Bilibili 首页 (过滤前)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[20:18:05] ✓ 页面加载完成
[20:18:05] ✓ 检测到 24 个视频卡片
  📸 截图: 01-homepage-before.png
...

📁 生成的文件 (11 个):
   01. 📸 01-homepage-before.png
   02. 📸 02-popup-default.png
   ...
   11. 💾 bqf-settings.json

📂 文件位置: demo/screenshots
```

## 🔧 技术细节

- **框架**: Playwright
- **浏览器**: Chromium (非 headless)
- **扩展加载**: `--load-extension` 参数
- **截图格式**: PNG
- **默认分辨率**: 1440x900
