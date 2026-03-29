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

// Comment score thresholds
export const COMMENT_THRESHOLDS = {
  NORMAL: 50,
  WARNING: 36,
  HIDE: 35
};

// Video title patterns that indicate low quality
export const TITLE_PATTERNS = {
  // Excessive punctuation
  EXCESSIVE_PUNCTUATION: /[!?。！？]{3,}/g,
  // All caps or full-width caps
  CAPS_RATIO: /[A-Z\u4E00-\u9FFF]/g,
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
  VIDEO_CARD: '.bili-video-card, .video-card, [data-video-id]',
  VIDEO_CARD_TITLE: '.bili-video-card__title, .video-card__title, .title',
  VIDEO_CARD_AUTHOR: '.bili-video-card__info--author, .video-card__author',
  // Comment section
  COMMENT_LIST: '.comment-list, #comment, .comment',
  COMMENT_ITEM: '.comment-item, .list-item',
  COMMENT_AUTHOR: '.user-name, .author-name, [data-user-id]',
  COMMENT_CONTENT: '.comment-content, .text, .content',
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
  showBlockUserButton: true
};
