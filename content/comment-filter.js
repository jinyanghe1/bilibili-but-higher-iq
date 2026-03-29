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
import { extractAndRankKeywords } from '../utils/keyword-extractor.js';

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
    let mlScore = null;
    if (this.settings.enableMLSentiment && content) {
      // Build ML config from settings
      const mlConfig = {
        model: this.settings.mlModel,
        dtype: this.settings.mlDtype,
        device: this.settings.mlDevice
      };
      const timeout = this.settings.mlTimeout || 100;
      
      const mlResult = await analyzeSentiment(content, { timeout, config: mlConfig });
      if (!mlResult.fallback) {
        mlScore = mlResult.score;
        reasons.push(`ML: ${mlResult.score}`);
      }
    }

    // Layer 3: Keyword matching (always run for additional context)
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

      if (this.keywords.homogenized) {
        const homoResult = this.checkKeywords(contentLower, this.keywords.homogenized);
        if (homoResult.matched > 0) {
          score -= homoResult.weight * homoResult.matched * 20;
          reasons.push(`Homogenized: ${homoResult.matched}`);
        }
      }

      // Layer 4: Pattern analysis
      const patternResult = this.analyzeCommentPatterns(content);
      score -= patternResult.penalty;
      reasons.push(...patternResult.reasons);
    }

    // Ensure score within bounds
    score = Math.max(0, Math.min(100, score));

    // Combine ML score if available (weighted: 60% ML, 40% keywords)
    if (mlScore !== null) {
      score = Math.round(mlScore * 0.6 + score * 0.4);
      reasons.push(`Combined: ${score}`);
    }

    // Comments do not use a dim/warn state: once they fall below the visible
    // threshold, hide them directly.
    const intensity = this.settings.blocklistIntensity || BLOCKLIST_INTENSITY.MILD;
    const thresholds = INTENSITY_THRESHOLDS[intensity] || INTENSITY_THRESHOLDS.mild;
    const hideThreshold = Math.max(thresholds.warning, thresholds.hide);
    const action = score <= hideThreshold ? 'hide' : 'show';

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

    // In allowlist mode, comments without quality signals should stay hidden.
    return {
      score: 40,
      reasons: ['No quality indicators'],
      action: 'hide'
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
      penalty += 40;
      reasons.push('Excessive punctuation');
    }

    // Check for ALL CAPS spam (English rage)
    if (content.match(COMMENT_PATTERNS.CAPS_SPAM)) {
      penalty += 45;
      reasons.push('CAPS spam');
    }

    // Check for repeated characters
    if (content.match(COMMENT_PATTERNS.REPEATED_CHARS)) {
      penalty += 40;
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
      const commentData = this.extractCommentData(commentEl);
      const extractedKeywords = extractAndRankKeywords(commentData.content, 5);
      
      // Build confirmation dialog with keyword extraction option
      const { shouldBlock, selectedKeywords } = await this.showBlockConfirmDialog(
        username,
        commentData.content,
        extractedKeywords
      );
      
      if (!shouldBlock) {
        return; // User cancelled
      }
      
      // Block the user
      await blocklistManager.blockUser(uid, username);
      
      // Add selected keywords to blocklist
      if (selectedKeywords && selectedKeywords.length > 0) {
        for (const keyword of selectedKeywords) {
          await blocklistManager.addKeyword(keyword, 'extracted', 0.6);
        }
        console.log(`[BQF] Added ${selectedKeywords.length} keywords from blocked user`);
      }

      // Immediately hide the current comment
      const blockedResult = {
        reasons: ['User is blocked'],
        action: 'hide'
      };

      // Dispatch custom event for immediate UI update
      commentEl.dispatchEvent(new CustomEvent('bqf:blockUser', {
        detail: { uid, username, result: blockedResult, commentEl },
        bubbles: true,
        composed: true
      }));

      await this.refreshData();

      // Notify background to sync across tabs
      chrome.runtime.sendMessage({
        type: 'USER_BLOCKED',
        uid,
        username
      });
    });

    footerEl.appendChild(btn);
  }

  /**
   * Show block confirmation dialog with keyword extraction
   * @param {string} username - Username to block
   * @param {string} commentContent - Comment content
   * @param {Array<{keyword: string, relevance: number}>} extractedKeywords - Extracted keywords
   * @returns {Promise<{shouldBlock: boolean, selectedKeywords: string[]}>}
   */
  showBlockConfirmDialog(username, commentContent, extractedKeywords) {
    return new Promise((resolve) => {
      // Create modal overlay
      const overlay = document.createElement('div');
      overlay.className = 'bqf-block-dialog-overlay';
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      `;

      // Create dialog
      const dialog = document.createElement('div');
      dialog.className = 'bqf-block-dialog';
      dialog.style.cssText = `
        background: white;
        border-radius: 12px;
        padding: 24px;
        max-width: 480px;
        width: 90%;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      `;

      // Title
      const title = document.createElement('h3');
      title.textContent = `Block User "${username}"?`;
      title.style.cssText = `
        margin: 0 0 16px 0;
        font-size: 18px;
        font-weight: 600;
        color: #333;
      `;
      dialog.appendChild(title);

      // Comment preview
      if (commentContent) {
        const previewLabel = document.createElement('div');
        previewLabel.textContent = 'Comment:';
        previewLabel.style.cssText = `
          font-size: 12px;
          color: #666;
          margin-bottom: 8px;
        `;
        dialog.appendChild(previewLabel);

        const preview = document.createElement('div');
        preview.textContent = commentContent.length > 100 
          ? commentContent.slice(0, 100) + '...' 
          : commentContent;
        preview.style.cssText = `
          background: #f5f5f5;
          padding: 12px;
          border-radius: 8px;
          font-size: 14px;
          color: #333;
          margin-bottom: 20px;
          line-height: 1.5;
        `;
        dialog.appendChild(preview);
      }

      // Keywords section
      if (extractedKeywords && extractedKeywords.length > 0) {
        const kwLabel = document.createElement('div');
        kwLabel.textContent = 'Extract keywords to blocklist (optional):';
        kwLabel.style.cssText = `
          font-size: 13px;
          color: #333;
          margin-bottom: 12px;
          font-weight: 500;
        `;
        dialog.appendChild(kwLabel);

        const kwContainer = document.createElement('div');
        kwContainer.style.cssText = `
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 20px;
        `;

        const selectedKeywords = new Set();

        extractedKeywords.forEach(({ keyword, relevance }) => {
          const label = document.createElement('label');
          label.style.cssText = `
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 6px 12px;
            background: #f0f0f0;
            border-radius: 20px;
            cursor: pointer;
            font-size: 13px;
            transition: background 0.2s;
            user-select: none;
          `;

          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.value = keyword;
          checkbox.style.cssText = 'cursor: pointer;';
          
          checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
              selectedKeywords.add(keyword);
              label.style.background = '#fb7299';
              label.style.color = 'white';
            } else {
              selectedKeywords.delete(keyword);
              label.style.background = '#f0f0f0';
              label.style.color = '#333';
            }
          });

          const text = document.createElement('span');
          text.textContent = keyword;

          // Relevance indicator
          const relevanceIndicator = document.createElement('span');
          relevanceIndicator.textContent = '•';
          relevanceIndicator.style.cssText = `
            color: ${relevance > 0.7 ? '#52c41a' : relevance > 0.4 ? '#faad14' : '#999'};
            font-size: 10px;
          `;

          label.appendChild(checkbox);
          label.appendChild(text);
          label.appendChild(relevanceIndicator);
          kwContainer.appendChild(label);
        });

        dialog.appendChild(kwContainer);

        // Hint text
        const hint = document.createElement('div');
        hint.textContent = 'Selected keywords will be added to your blocklist';
        hint.style.cssText = `
          font-size: 12px;
          color: #999;
          margin-bottom: 20px;
        `;
        dialog.appendChild(hint);
      }

      // Buttons
      const buttonContainer = document.createElement('div');
      buttonContainer.style.cssText = `
        display: flex;
        gap: 12px;
        justify-content: flex-end;
      `;

      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'Cancel';
      cancelBtn.style.cssText = `
        padding: 10px 20px;
        border: 1px solid #ddd;
        background: white;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        color: #666;
      `;
      cancelBtn.addEventListener('click', () => {
        document.body.removeChild(overlay);
        resolve({ shouldBlock: false, selectedKeywords: [] });
      });

      const blockBtn = document.createElement('button');
      blockBtn.textContent = 'Block User';
      blockBtn.style.cssText = `
        padding: 10px 20px;
        border: none;
        background: #ff4d4f;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        color: white;
        font-weight: 500;
      `;
      blockBtn.addEventListener('click', () => {
        const selectedKeywords = Array.from(
          dialog.querySelectorAll('input[type="checkbox"]:checked')
        ).map(cb => cb.value);
        document.body.removeChild(overlay);
        resolve({ shouldBlock: true, selectedKeywords });
      });

      buttonContainer.appendChild(cancelBtn);
      buttonContainer.appendChild(blockBtn);
      dialog.appendChild(buttonContainer);

      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      // Close on overlay click
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          document.body.removeChild(overlay);
          resolve({ shouldBlock: false, selectedKeywords: [] });
        }
      });

      // Focus trap
      cancelBtn.focus();
    });
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
