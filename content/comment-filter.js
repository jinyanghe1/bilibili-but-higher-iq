// Bilibili Quality Filter - Comment Filter

import { blocklistManager } from '../storage/blocklist-manager.js';
import {
  COMMENT_PATTERNS,
  COMMENT_THRESHOLDS,
  BILIBILI_SELECTORS
} from '../utils/constants.js';

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

    // Layer 2: Keyword matching
    if (content) {
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
    }

    // Layer 3: Pattern analysis
    const patternResult = this.analyzeCommentPatterns(content);
    score -= patternResult.penalty;
    reasons.push(...patternResult.reasons);

    // Ensure score within bounds
    score = Math.max(0, Math.min(100, score));

    // Determine action
    const action = score <= COMMENT_THRESHOLDS.HIDE ? 'hide' :
                   score <= COMMENT_THRESHOLDS.WARNING ? 'warn' : 'show';

    return { score, reasons, action };
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
    if (COMMENT_PATTERNS.LINK_SPAM.test(content)) {
      penalty += 30;
      reasons.push('Link spam');
    }

    // Check for punctuation spam
    if (COMMENT_PATTERNS.PUNCTUATION_SPAM.test(content)) {
      penalty += 15;
      reasons.push('Excessive punctuation');
    }

    // Check for ALL CAPS spam (English rage)
    if (COMMENT_PATTERNS.CAPS_SPAM.test(content)) {
      penalty += 20;
      reasons.push('CAPS spam');
    }

    // Check for repeated characters
    if (COMMENT_PATTERNS.REPEATED_CHARS.test(content)) {
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
      // Get content
      const contentEl = commentEl.querySelector(
        '.comment-content, .text, .content, [data-text]'
      );
      if (contentEl) {
        data.content = contentEl.textContent?.trim() || '';
      }

      // Get user info
      const userEl = commentEl.querySelector(
        '.user-name, .author-name, [data-user-id], .name'
      );
      if (userEl) {
        data.username = userEl.textContent?.trim() || '';
        const uidAttr = userEl.getAttribute('data-user-id') ||
                        userEl.getAttribute('data-uid');
        if (uidAttr) {
          data.uid = uidAttr;
        }
      }

      // Get reply ID
      const ridAttr = commentEl.getAttribute('data-rid') ||
                      commentEl.getAttribute('data-id');
      if (ridAttr) {
        data.rid = ridAttr;
      }

    } catch (error) {
      console.error('[BQF] Error extracting comment data:', error);
    }

    return data;
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

    // Remove the "show anyway" button if present
    const btn = commentEl.querySelector('.bqf-show-anyway-btn');
    if (btn) {
      btn.remove();
    }
  }

  /**
   * Add "Block User" button to a comment
   */
  addBlockUserButton(commentEl) {
    const existingBtn = commentEl.querySelector('.bqf-block-user-btn');
    if (existingBtn) return;

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

    const userEl = commentEl.querySelector('[data-user-id], .user-name');
    const uid = userEl?.getAttribute('data-user-id');
    const username = userEl?.textContent?.trim() || 'Unknown';

    btn.addEventListener('click', async () => {
      if (confirm(`Block user "${username}"?`)) {
        await blocklistManager.blockUser(uid, username);
        this.refreshData();
        // Notify background to sync across tabs
        chrome.runtime.sendMessage({
          type: 'USER_BLOCKED',
          uid,
          username
        });
      }
    });

    commentEl.querySelector('.comment-actions, .action-list')?.appendChild(btn);
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
