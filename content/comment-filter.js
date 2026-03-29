// Bilibili Quality Filter - Comment Filter

import { blocklistManager } from '../storage/blocklist-manager.js';
import {
  COMMENT_PATTERNS,
  BILIBILI_SELECTORS,
  COMMENT_FILTER_MODES,
  BLOCKLIST_INTENSITY,
  INTENSITY_THRESHOLDS,
  ALLOWLIST_KEYWORDS
} from '../utils/constants.js';
import {
  deepQuerySelector,
  getTextContent
} from '../utils/shadow-dom-utils.js';

import { analyzeSentiment } from '../ml/sentiment-analyzer.js';

const UID_PATTERN = /space\.bilibili\.com\/(\d+)/i;

function normalizeText(value) {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function extractUidFromValue(value) {
  if (!value) {
    return null;
  }

  const match = String(value).match(UID_PATTERN);
  return match ? match[1] : null;
}

class CommentFilter {
  constructor() {
    this.keywords = null;
    this.blockedUIDs = null;
    this.settings = null;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;

    try {
      await blocklistManager.init();
      await this.refreshData();
      this.initialized = true;
    } catch (error) {
      console.error('[BQF] CommentFilter init failed:', error);
    }
  }

  async refreshData() {
    try {
      const [keywords, settings] = await Promise.all([
        blocklistManager.getKeywordsByCategory(),
        blocklistManager.getSettings()
      ]);

      this.keywords = keywords;
      this.settings = settings;
      this.blockedUIDs = await blocklistManager.getBlockedUIDSet();
    } catch (error) {
      console.error('[BQF] Failed to refresh comment filter data:', error);
      this.keywords = { rageBait: [], clickbait: [], homogenized: [] };
      this.settings = { filterComments: true, autoCollapseComments: true };
      this.blockedUIDs = new Set();
    }
  }

  /**
   * Score a comment
   * @param {Object} commentData - Comment data
   * @param {string} commentData.content - Comment text
   * @param {string} commentData.uid - User ID
   * @param {string} commentData.username - Username
   * @param {string} commentData.rid - Comment reply ID
   * @returns {Object} Score result
   */
  async scoreComment(commentData) {
    await this.init();

    if (!this.settings?.filterComments) {
      return { score: 100, reasons: [], action: 'show' };
    }

    const mode = this.settings.commentFilterMode || COMMENT_FILTER_MODES.BLOCKLIST;

    // Allowlist mode
    if (mode === COMMENT_FILTER_MODES.ALLOWLIST) {
      return this.scoreCommentAllowlist(commentData);
    }

    // Blocklist mode (default)
    return this.scoreCommentBlocklist(commentData);
  }

  /**
   * Score comment in blocklist mode (hide low-quality)
   */
  async scoreCommentBlocklist(commentData) {
    let score = 100;
    const reasons = [];

    // Layer 1: User blocklist check
    if (commentData.uid && this.blockedUIDs.has(String(commentData.uid))) {
      return {
        score: 0,
        reasons: ['User is blocked'],
        action: 'hide'
      };
    }

    const content = commentData.content || '';

    // Layer 2: ML Sentiment analysis (if enabled)
    if (this.settings.enableMLSentiment && content) {
      const mlResult = await analyzeSentiment(content);
      if (!mlResult.fallback) {
        score = mlResult.score;
        reasons.push(`ML: ${mlResult.score}`);
      }
    }

    // Layer 3: Keyword matching (only if ML didn't run or for additional context)
    if (content && !this.settings.enableMLSentiment) {
      const contentLower = content.toLowerCase();

      if (this.keywords.rageBait) {
        const rageResult = this.checkKeywords(contentLower, this.keywords.rageBait);
        if (rageResult.matched > 0) {
          score -= rageResult.weight * rageResult.matched * 25;
          reasons.push(`Rage bait: ${rageResult.matched}`);
        }
      }

      if (this.keywords.clickbait) {
        const clickResult = this.checkKeywords(contentLower, this.keywords.clickbait);
        if (clickResult.matched > 0) {
          score -= clickResult.weight * clickResult.matched * 15;
          reasons.push(`Clickbait: ${clickResult.matched}`);
        }
      }

      // Layer 4: Pattern analysis
      const patternResult = this.analyzeCommentPatterns(content);
      score -= patternResult.penalty;
      reasons.push(...patternResult.reasons);
    }

    // Ensure score within bounds
    score = Math.max(0, Math.min(100, score));

    // Determine action based on intensity
    const intensity = this.settings.blocklistIntensity || BLOCKLIST_INTENSITY.MILD;
    const thresholds = INTENSITY_THRESHOLDS[intensity] || INTENSITY_THRESHOLDS.mild;

    const action = score <= thresholds.hide ? 'hide' :
                   score <= thresholds.warning ? 'warn' : 'show';

    return { score, reasons, action };
  }

  /**
   * Score comment in allowlist mode (only show high-quality)
   */
  scoreCommentAllowlist(commentData) {
    const reasons = [];

    // Layer 1: User blocklist check
    if (commentData.uid && this.blockedUIDs.has(String(commentData.uid))) {
      return {
        score: 0,
        reasons: ['User is blocked'],
        action: 'hide'
      };
    }

    const content = commentData.content || '';
    const contentLower = content.toLowerCase();

    // Check for allowlist keywords
    const allowlistMatches = ALLOWLIST_KEYWORDS.filter(kw =>
      contentLower.includes(kw.toLowerCase())
    );

    if (allowlistMatches.length > 0) {
      reasons.push(`Quality keywords: ${allowlistMatches.length}`);
      return {
        score: 80 + Math.min(allowlistMatches.length * 5, 20),
        reasons,
        action: 'show'
      };
    }

    // Check for negative patterns that indicate low quality
    const patternResult = this.analyzeCommentPatterns(content);
    const hasNegativePatterns = patternResult.penalty > 0 ||
      this.keywords.rageBait?.some(kw => contentLower.includes(kw.keyword.toLowerCase())) ||
      this.keywords.clickbait?.some(kw => contentLower.includes(kw.keyword.toLowerCase()));

    if (hasNegativePatterns) {
      reasons.push(...patternResult.reasons);
      return {
        score: 20,
        reasons,
        action: 'hide'
      };
    }

    // No strong quality indicators, dim it
    return {
      score: 40,
      reasons: ['No quality indicators'],
      action: 'warn'
    };
  }

  checkKeywords(text, keywords) {
    let matched = 0;
    let totalWeight = 0;

    for (const kw of keywords) {
      if (text.includes(kw.keyword.toLowerCase())) {
        matched++;
        totalWeight += kw.weight;
      }
    }

    return {
      matched,
      weight: matched > 0 ? totalWeight / matched : 0
    };
  }

  analyzeCommentPatterns(content) {
    if (!content) {
      return { penalty: 0, reasons: [] };
    }

    let penalty = 0;
    const reasons = [];

    // Check for link spam
    if (content.match(COMMENT_PATTERNS.LINK_SPAM)) {
      penalty += 30;
      reasons.push('Link spam');
    }

    // Check for punctuation spam
    if (content.match(COMMENT_PATTERNS.PUNCTUATION_SPAM)) {
      penalty += 15;
      reasons.push('Excessive punctuation');
    }

    // Check for ALL CAPS spam (English rage)
    if (content.match(COMMENT_PATTERNS.CAPS_SPAM)) {
      penalty += 20;
      reasons.push('CAPS spam');
    }

    // Check for repeated characters
    if (content.match(COMMENT_PATTERNS.REPEATED_CHARS)) {
      penalty += 15;
      reasons.push('Repeated characters');
    }

    // Check for emoji spam
    const emojiMatches = content.match(COMMENT_PATTERNS.EMOJI_SPAM);
    if (emojiMatches) {
      const totalEmojis = emojiMatches.join('').length;
      penalty += Math.min(totalEmojis * 0.3, 20);
      reasons.push('Emoji spam');
    }

    // Check for very short comments (likely low-effort)
    if (content.length > 0 && content.length < 5) {
      penalty += 10;
      reasons.push('Too short');
    }

    return { penalty, reasons };
  }

  /**
   * Extract comment data from DOM element
   */
  extractCommentData(commentEl) {
    const data = {
      content: '',
      uid: null,
      username: '',
      rid: null
    };

    try {
      const payload = this.getCommentDataPayload(commentEl);
      if (payload) {
        data.content = normalizeText(
          payload.content?.message ||
          payload.content?.text ||
          payload.message
        );
        data.uid = payload.mid_str ||
          payload.mid ||
          payload.member?.mid_str ||
          payload.member?.mid ||
          payload.user?.mid ||
          payload.user?.uid ||
          null;
        data.username = normalizeText(
          payload.member?.uname ||
          payload.member?.name ||
          payload.user?.uname ||
          payload.user?.name
        );
        data.rid = payload.rpid_str ||
          payload.rpid ||
          payload.reply_id ||
          payload.id ||
          null;
      }

      const contentEl = this.getCommentTextElement(commentEl);
      if (!data.content && contentEl) {
        data.content = normalizeText(getTextContent(contentEl));
      }

      const userEl = this.getCommentAuthorElement(commentEl);
      if (userEl) {
        if (!data.username) {
          data.username = normalizeText(getTextContent(userEl));
        }

        if (!data.uid) {
          data.uid = this.extractUidFromAuthorElement(userEl);
        }
      }
    } catch (error) {
      console.error('[BQF] Error extracting comment data:', error);
    }

    if (!data.rid) {
      const renderer = this.getCommentRenderer(commentEl);
      data.rid = commentEl.getAttribute('data-rid') ||
        commentEl.getAttribute('data-id') ||
        renderer?.getAttribute('data-rid') ||
        renderer?.getAttribute('data-id') ||
        null;
    }

    data.content = normalizeText(data.content);
    data.username = normalizeText(data.username);
    data.uid = data.uid != null && data.uid !== '' ? String(data.uid) : null;
    data.rid = data.rid != null && data.rid !== '' ? String(data.rid) : null;

    return data;
  }

  getCommentRenderer(commentEl) {
    if (!(commentEl instanceof Element)) {
      return null;
    }

    if (
      commentEl.matches(BILIBILI_SELECTORS.COMMENT_RENDERER) ||
      commentEl.matches(BILIBILI_SELECTORS.COMMENT_ITEM)
    ) {
      return commentEl;
    }

    return deepQuerySelector(BILIBILI_SELECTORS.COMMENT_RENDERER, commentEl);
  }

  getCommentRendererRoot(commentEl) {
    return this.getCommentRenderer(commentEl)?.shadowRoot || null;
  }

  getCommentDataPayload(commentEl) {
    const renderer = this.getCommentRenderer(commentEl);
    return renderer?.__data || commentEl?.__data || null;
  }

  getCommentContentContainer(commentEl) {
    const rendererRoot = this.getCommentRendererRoot(commentEl);
    const searchRoot = rendererRoot || this.getCommentRenderer(commentEl) || commentEl;

    return deepQuerySelector('#content', searchRoot) ||
      deepQuerySelector(BILIBILI_SELECTORS.COMMENT_CONTENT, searchRoot) ||
      null;
  }

  getCommentTextElement(commentEl) {
    const rendererRoot = this.getCommentRendererRoot(commentEl);
    const searchRoot = rendererRoot || this.getCommentRenderer(commentEl) || commentEl;
    const richText = deepQuerySelector(BILIBILI_SELECTORS.COMMENT_RICH_TEXT, searchRoot);

    return deepQuerySelector('#contents', richText || searchRoot) ||
      deepQuerySelector(BILIBILI_SELECTORS.COMMENT_CONTENT, richText || searchRoot) ||
      null;
  }

  getCommentAuthorElement(commentEl) {
    const rendererRoot = this.getCommentRendererRoot(commentEl);
    const searchRoot = rendererRoot || this.getCommentRenderer(commentEl) || commentEl;
    const userInfo = deepQuerySelector(BILIBILI_SELECTORS.COMMENT_USER_INFO, searchRoot);

    return deepQuerySelector('#user-name a', userInfo || searchRoot) ||
      deepQuerySelector('#user-name', userInfo || searchRoot) ||
      deepQuerySelector(BILIBILI_SELECTORS.COMMENT_AUTHOR, userInfo || searchRoot) ||
      null;
  }

  getCommentFooterElement(commentEl) {
    const rendererRoot = this.getCommentRendererRoot(commentEl);
    const searchRoot = rendererRoot || this.getCommentRenderer(commentEl) || commentEl;
    return deepQuerySelector(BILIBILI_SELECTORS.COMMENT_FOOTER, searchRoot) ||
      null;
  }

  extractUidFromAuthorElement(authorEl) {
    if (!authorEl) {
      return null;
    }

    const directUid = authorEl.getAttribute('data-user-profile-id') ||
      authorEl.getAttribute('data-user-id') ||
      authorEl.getAttribute('data-uid');
    if (directUid) {
      return String(directUid);
    }

    const authorLink = authorEl.matches('a')
      ? authorEl
      : deepQuerySelector('a[href*="space.bilibili.com/"]', authorEl);
    return extractUidFromValue(
      authorLink?.getAttribute?.('href') ||
      authorLink?.href ||
      authorEl.getAttribute('href')
    );
  }

  /**
   * Create a "show anyway" button for filtered comments
   */
  createShowAnywayButton(commentEl) {
    const btn = document.createElement('button');
    btn.className = 'bqf-show-anyway-btn';
    btn.textContent = chrome.i18n.getMessage('showAnyway') || 'Show anyway';
    btn.style.cssText = `
      background: #f0f0f0;
      border: 1px solid #ddd;
      border-radius: 4px;
      padding: 4px 12px;
      font-size: 12px;
      cursor: pointer;
      margin-top: 8px;
    `;

    btn.addEventListener('click', () => {
      this.showComment(commentEl);
      this.recordFeedback(commentEl, 'show');

      // Add "Block User" button
      if (this.settings?.showBlockUserButton) {
        this.addBlockUserButton(commentEl);
      }
    });

    return btn;
  }

  /**
   * Show a hidden comment
   */
  showComment(commentEl) {
    commentEl.classList.remove('bqf-comment-hidden');
    commentEl.classList.add('bqf-comment-shown');

    const rendererRoot = this.getCommentRendererRoot(commentEl);
    (rendererRoot || commentEl).querySelectorAll('.bqf-show-anyway-btn').forEach((btn) => {
      btn.remove();
    });
  }

  /**
   * Add "Block User" button to a comment
   */
  addBlockUserButton(commentEl) {
    const rendererRoot = this.getCommentRendererRoot(commentEl);
    const existingBtn = (rendererRoot || commentEl).querySelector('.bqf-block-user-btn');
    if (existingBtn) return;

    const footerEl = this.getCommentFooterElement(commentEl);
    if (!footerEl) return;

    const commentData = this.extractCommentData(commentEl);
    if (!commentData.uid) return;

    const btn = document.createElement('button');
    btn.className = 'bqf-block-user-btn';
    btn.textContent = chrome.i18n.getMessage('blockUser') || 'Block User';
    btn.style.cssText = `
      background: #ff9595;
      border: 1px solid #ff6666;
      border-radius: 4px;
      padding: 4px 12px;
      font-size: 12px;
      cursor: pointer;
      margin-top: 8px;
      margin-left: 8px;
    `;

    const uid = commentData.uid;
    const username = commentData.username || 'Unknown';

    btn.addEventListener('click', async () => {
      if (confirm(`Block user "${username}"?`)) {
        await blocklistManager.blockUser(uid, username);
        await this.refreshData();
        // Notify background to sync across tabs
        chrome.runtime.sendMessage({
          type: 'USER_BLOCKED',
          uid,
          username
        });
      }
    });

    footerEl.appendChild(btn);
  }

  /**
   * Record user feedback
   */
  async recordFeedback(commentEl, action) {
    const commentData = this.extractCommentData(commentEl);
    if (commentData.rid) {
      await blocklistManager.addFeedback('comment', commentData.rid, action);
    }
  }
}

// Singleton instance
export const commentFilter = new CommentFilter();
