// Bilibili Quality Filter - Constants and Preset Keywords

export const KEYWORD_BLOCKLISTS = {
  rageBait: {
    name: 'Rage Bait',
    nameZh: '引战内容',
    weight: 0.8,
    severity: 'high',
    keywords: [
      '引战', '撕逼', '对立', '恰烂钱', '恰流量',
      '阴阳怪气', '呵呵', '孝子', '美分', '五毛',
      '脑残', '智障', '废物', '垃圾', '有病',
      '舔狗', '海王', '绿茶', '圣母', '白莲花',
      '杠精', '喷子', '键盘侠', '柠檬精', '酸了'
    ]
  },
  clickbait: {
    name: 'Clickbait',
    nameZh: '标题党',
    weight: 0.6,
    severity: 'medium',
    keywords: [
      '震惊', '必看', '绝了', '绝了绝了', '笑死',
      '哭', '破防', '绷不住', '爆笑', '搞笑',
      '秒了', '碾压', '封神', '天花板', '神作',
      '炸裂', 'YYDS', '绝了绝了', '太牛了', '牛蛙',
      '哭死', '笑抽', '笑崩', '破大防', '绷不住了',
      '太绝了', '这也太', '竟然', '居然', '万万没想到'
    ]
  },
  homogenized: {
    name: 'Homogenized',
    nameZh: '同质化内容',
    weight: 0.7,
    severity: 'high',
    keywords: [
      '搬运', '抄袭', '盗摄', '二创', '转载',
      '素材', '来源', '侵删', '侵权', '盗版',
      '抄袭', '融梗', '洗稿', '抄袭狗', '盗图',
      '二改', '改改', '素材来源', '非原创', '抱走'
    ]
  }
};

// Scoring thresholds
export const SCORE_THRESHOLDS = {
  NORMAL: 50,
  WARNING: 35,
  DIM: 50,  // Content between 31-50 gets dimmed
  HIDE: 30  // Content <= 30 gets hidden
};

// Comment filter modes
export const COMMENT_FILTER_MODES = {
  BLOCKLIST: 'blocklist',  // Hide low-quality comments
  ALLOWLIST: 'allowlist'  // Only show high-quality comments
};

// Blocklist intensity levels
export const BLOCKLIST_INTENSITY = {
  SIMPLE: 'simple',   // Light filtering
  MILD: 'mild',       // Moderate filtering
  RADICAL: 'radical'  // Aggressive filtering
};

// Intensity thresholds [warning, hide]
export const INTENSITY_THRESHOLDS = {
  simple: { warning: 30, hide: 20 },
  mild: { warning: 45, hide: 35 },
  radical: { warning: 60, hide: 50 }
};

// Allowlist keywords (high-quality comment indicators)
export const ALLOWLIST_KEYWORDS = [
  '分析', '理性', '客观', '专业', '深度',
  '见解', '论证', '观点', '论述', '逻辑',
  '数据', '事实', '依据', '参考', '来源',
  '科普', '讲解', '解析', '测评', '对比'
];

// Comment score thresholds (legacy, used for video filtering)
export const COMMENT_THRESHOLDS = {
  NORMAL: 50,
  WARNING: 35,  // Fixed bug: was 36, should be 35
  HIDE: 30
};

// ML configuration
export const ML_CONFIG = {
  DEFAULT_TIMEOUT: 100,  // milliseconds
  MODEL_NAME: 'Xenova/transformers-small'  // Lightweight sentiment model
};

// Video title patterns that indicate low quality
export const TITLE_PATTERNS = {
  // Excessive punctuation
  EXCESSIVE_PUNCTUATION: /[!?。！？]{3,}/g,
  // All caps or full-width caps
  CAPS_RATIO: /[A-ZＡ-Ｚ]/g,
  // Emoji spam
  EMOJI_SPAM: /[\u{1F300}-\u{1F9FF}]{3,}/gu,
  // Numbers in title (clickbait pattern like "第X个")
  NUMBER_PATTERN: /第[一二三四五六七八九十百千万\d]+个/g,
  // Repeated characters
  REPEATED_CHARS: /(.)\1{2,}/g
};

// Comment patterns
export const COMMENT_PATTERNS = {
  // Link spam
  LINK_SPAM: /(https?:\/\/[^\s]+){3,}/g,
  // Repeated punctuation
  PUNCTUATION_SPAM: /[!?。！？]{2,}/g,
  // All caps (English rage)
  CAPS_SPAM: /[A-Z]{4,}/g,
  // Repeated characters
  REPEATED_CHARS: /(.)\1{3,}/g,
  // Excessive emojis
  EMOJI_SPAM: /[\u{1F300}-\u{1F9FF}]{4,}/gu
};

// DOM selectors for Bilibili
export const BILIBILI_SELECTORS = {
  // Video cards in feed
  VIDEO_CARD: '.bili-video-card, .bili-feed-card, .feed-card, .floor-single-card, .floor-card, .single-card, .video-page-card-small, .video-pod__item, .card-box, [data-video-id], [data-key^="BV"]',
  VIDEO_CARD_TITLE: '.bili-video-card__title, .bili-video-card__info--tit, .video-card__title, .video-title, .title-txt, .title, .entry-title, h3 a, h3',
  VIDEO_CARD_AUTHOR: '.bili-video-card__info--author, .bili-video-card__info--owner, .video-card__author, .author, .up-name, a[href*="//space.bilibili.com/"]',
  VIDEO_CARD_LINK: 'a[href*="/video/BV"], a[href^="https://www.bilibili.com/video/BV"], a[href^="//www.bilibili.com/video/BV"]',
  // Comment section
  COMMENT_HOST: 'bili-comments',
  COMMENT_LIST: '.comment-list, #comment, .comment, #feed, #contents',
  COMMENT_ITEM: '.comment-item, .list-item, bili-comment-thread-renderer, bili-comment-reply-renderer',
  COMMENT_RENDERER: 'bili-comment-renderer, bili-comment-reply-renderer',
  COMMENT_USER_INFO: 'bili-comment-user-info',
  COMMENT_RICH_TEXT: 'bili-rich-text',
  COMMENT_AUTHOR: '.user-name, .author-name, [data-user-id], .name, #user-name, #user-name a, [data-user-profile-id]',
  COMMENT_CONTENT: '.comment-content, .text, .content, [data-text], #content, #contents, bili-rich-text',
  COMMENT_FOOTER: '.comment-actions, .action-list, #footer',
  // Main content area
  MAIN_CONTENT: '#bili-main, #app, main, [role="main"]'
};

// Storage keys
export const STORAGE_KEYS = {
  SETTINGS: 'settings',
  USER_BLOCKLIST: 'userBlocklist',
  CUSTOM_KEYWORDS: 'customKeywords',
  FEEDBACK_DATA: 'feedbackData'
};

// Default settings
export const DEFAULT_SETTINGS = {
  enabled: true,
  filterRageBait: true,
  filterClickbait: true,
  filterHomogenized: true,
  filterComments: true,
  dimInsteadOfHide: false,
  autoCollapseComments: true,
  showBlockUserButton: true,
  // Comment filter mode
  commentFilterMode: 'blocklist',
  // Blocklist intensity
  blocklistIntensity: 'mild',
  // ML sentiment analysis
  enableMLSentiment: false
};
