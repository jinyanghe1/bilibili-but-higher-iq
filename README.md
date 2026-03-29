# Bilibili But Higher IQ

> **灵感来源与致谢**
>
> 参考了以下项目：
> - **[BiliBili_Optimizer](https://github.com/Kyouichirou/BiliBili_Optimizer)** by Kyouichirou
> - **[bilibili-cleaner](https://github.com/festoney8/bilibili-cleaner)** by festoney
>
> 如需更丰富的功能（视频评分、下载命令生成等），可参考上述项目。

---

首页被标题党刷屏，评论区全是拱火复读，想找个正常内容像大海捞针。

这个扩展帮你把低质量噪音筛掉：**你自己决定筛多狠，筛什么，谁该拉黑。**

---

## 能干啥

**过滤低质量内容**
- 识别并隐藏引战、标题党、同质化视频
- 过滤垃圾评论、复读评论、低信息密度评论
- 评论直接一键屏蔽用户

**两种过滤模式**
- **Blocklist 模式**：隐藏低质量内容，默认 mild 强度
- **Allowlist 模式**：只看高质量内容（还在调优）

**ML 辅助判断**
- 浏览器端本地推理，不上传数据
- 支持 sentiment-analysis 模型
- 100ms 超时自动回退到关键词

**控制权在你**
- 每个过滤器单独开关
- 自定义关键词
- 用户/关键词黑名单
- 配置导入/导出

---

## 安装

1. 克隆仓库
2. 打开 `chrome://extensions/`
3. 开启右上角「开发者模式」
4. 点击「加载已解压的扩展程序」
5. 选择本项目目录

---

## 使用

1. 打开 B 站，点扩展图标
2. 开启「启用过滤」
3. 用默认设置先跑一会儿
4. 根据容忍度调整强度

**如果在评论区看到脏东西**：点「仍然显示」→「屏蔽用户」，后续同类内容一起过滤。

---

## 技术栈

| 模块 | 技术 |
|------|------|
| 扩展框架 | Chrome Extension Manifest V3 |
| ML 推理 | @xenova/transformers (CDN) |
| 存储 | chrome.storage + IndexedDB |
| DOM 穿透 | Shadow DOM deepQuerySelector |
| 构建 | esbuild (IIFE bundle) |

---

## 本地开发

```bash
npm install
npm run build    # 构建 dist/
npm test         # 运行测试
```

---

## 隐私

- 数据存本地浏览器
- ML 推理在本地执行
- 不上传浏览行为

---

## 许可证

MIT，见 [`LICENSE`](LICENSE)。
