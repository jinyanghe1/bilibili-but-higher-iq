# 🧠 Bilibili Quality Filter

### Your favorite video site's filter for people who actually have taste.

<p align="center">
  <img src="https://img.shields.io/badge/Manifest-V3-blue?style=flat-square" alt="Manifest V3">
  <img src="https://img.shields.io/badge/Platforms-Chrome%20%7C%20Firefox%20%7C%20Safari-green?style=flat-square" alt="Platforms">
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="License">
</p>

---

## 😤 The Problem

You've been on Bilibili for 5 minutes. You've already seen:
- **"震惊!必看!绝了绝了绝了!"**
- **"第X个原因让你..."**
- **"搬运|抄袭|素材来源:侵删"**

Your soul is leaving your body. Your remaining brain cells are filing a class action lawsuit.

## ✨ The Solution

Bilibili Quality Filter (BQF) is like having a wise friend who quietly removes the garbage from your feed so you can enjoy actual content.

### What it does:

| Filter Type | Catches | Examples |
|-------------|---------|----------|
| 🔥 **Rage Bait** | Provocative content designed to trigger reactions | 引战, 撕逼, 阴阳怪气 |
| 🎯 **Clickbait** | Sensational titles that overpromise | 震惊, 必看, YYDS, 封神 |
| 📦 **Homogenized** | Reposted/stolen content | 搬运, 抄袭, 素材来源 |

### Features:

- **Video Quality Scoring** - Titles are analyzed for quality signals
- **Comment Filtering** - Toxic comments auto-collapsed
- **Smart Hiding** - Choose to hide or just dim low-quality content
- **Cross-Tab Sync** - Settings sync across all Bilibili tabs
- **User Blocking** - Block users who consistently produce garbage
- **Custom Keywords** - Add your own filter words
- **Dark Mode** - Won't blind you at night
- **ML-Ready** - Architecture prepared for future sentiment analysis

---

## 🚀 Installation

### Chrome / Edge (Chromium)

1. Download the latest release or clone this repo
2. Open `chrome://extensions/`
3. Enable **Developer Mode** (top right)
4. Click **Load unpacked**
5. Select the `bilibili-but-higher-iq` folder

### Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select `manifest.json` from the folder

### Safari

Coming soon™ (Manifest V3 Safari support is in progress)

---

## 🎮 Usage

1. Click the extension icon in your toolbar
2. Toggle filters on/off
3. Adjust which categories to filter
4. For fine-grained control, click "Open Settings"

### Quick Actions

| Action | How |
|--------|-----|
| Show hidden comment | Click "Show anyway" button |
| Block a user | Click the "Block User" button on their comment |
| Adjust sensitivity | Settings > Filter Options |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        EXTENSION                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐   ┌─────────────────┐   ┌───────────────┐  │
│  │  UI Layer   │   │  Business Logic │   │  Data Layer   │  │
│  ├─────────────┤   ├─────────────────┤   ├───────────────┤  │
│  │ popup/      │   │ video-scorer.js │   │ blocklist-    │  │
│  │ options/    │   │ comment-filter.js│   │ manager.js    │  │
│  └─────────────┘   └────────┬────────┘   └───────────────┘  │
│                             │                                │
│                    ┌────────▼────────┐                      │
│                    │  DOM Observer   │                      │
│                    └─────────────────┘                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 📊 Scoring Algorithm

```
FinalScore = 100
  - Σ(keyword_weight × matched_count × category_penalty)
  - pattern_penalty

Thresholds:
  > 50  → Show normally
  31-50 → Dim (reduce opacity)
  ≤ 30  → Hide completely
```

---

## 🤝 Contributing

This project follows a multi-agent collaboration protocol. See [AGENTS.md](.agentstalk/AGENTS.md) for details.

Want to contribute? Found a bug? Have a feature request?

1. Check existing issues
2. Open a new issue (please include Bilibili URL if reporting a false positive/negative)
3. Make a PR with tests

---

## 📝 License

MIT - Because sharing is caring, but so is not having your time wasted.

---

## ⚠️ Disclaimer

This extension is not affiliated with Bilibili. It's just a fan project for people who want to enjoy quality content without the algorithmic garbage.

If Bilibili's algorithm is reading this: I understand you need engagement. But "第X个原因" as a title format died in 2019. Let it rest.

---

<p align="center">
  <sub>Made with 🧠 for people who remember when Bilibili was good</sub>
</sub>
</p>
