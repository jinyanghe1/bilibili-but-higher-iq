// Bilibili Quality Filter - Video Quality Scorer

import { blocklistManager } from '../storage/blocklist-manager.js';
import {
  TITLE_PATTERNS,
  SCORE_THRESHOLDS,
  BILIBILI_SELECTORS
} from '../utils/constants.js';

class VideoScorer {
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
      console.error('[BQF] VideoScorer init failed:', error);
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
      console.error('[BQF] Failed to refresh data:', error);
      // Use default empty data
      this.keywords = { rageBait: [], clickbait: [], homogenized: [] };
      this.settings = {
        filterRageBait: true,
        filterClickbait: true,
        filterHomogenized: true
      };
      this.blockedUIDs = new Set();
    }
  }

  /**
   * Calculate quality score for a video
   * @param {Object} videoData - Video data object
   * @param {string} videoData.title - Video title
   * @param {string} videoData.author - Author name
   * @param {string} videoData.uid - Author UID
   * @param {string} videoData.bvid - Video BV ID
   * @returns {Object} Score result { score: number, reasons: string[], action: 'show'|'dim'|'hide' }
   */
  async scoreVideo(videoData) {
    await this.init();

    if (!this.settings || !this.settings.enabled) {
      return { score: 100, reasons: [], action: 'show' };
    }

    let score = 100;
    const reasons = [];

    // Layer 1: User blocklist check
    if (videoData.uid && this.blockedUIDs.has(String(videoData.uid))) {
      return {
        score: 0,
        reasons: ['User is blocked'],
        action: 'hide'
      };
    }

    // Layer 2: Keyword matching
    if (videoData.title) {
      const titleLower = videoData.title.toLowerCase();

      // Check each category
      if (this.settings.filterRageBait && this.keywords.rageBait) {
        const rageResult = this.checkKeywords(titleLower, this.keywords.rageBait);
        if (rageResult.matched > 0) {
          const penalty = rageResult.weight * rageResult.matched * 30;
          score -= penalty;
          reasons.push(`Rage bait keywords: ${rageResult.matched}`);
        }
      }

      if (this.settings.filterClickbait && this.keywords.clickbait) {
        const clickResult = this.checkKeywords(titleLower, this.keywords.clickbait);
        if (clickResult.matched > 0) {
          const penalty = clickResult.weight * clickResult.matched * 20;
          score -= penalty;
          reasons.push(`Clickbait keywords: ${clickResult.matched}`);
        }
      }

      if (this.settings.filterHomogenized && this.keywords.homogenized) {
        const homoResult = this.checkKeywords(titleLower, this.keywords.homogenized);
        if (homoResult.matched > 0) {
          const penalty = homoResult.weight * homoResult.matched * 25;
          score -= penalty;
          reasons.push(`Homogenized keywords: ${homoResult.matched}`);
        }
      }
    }

    // Layer 3: Pattern analysis
    const patternScore = this.analyzeTitlePatterns(videoData.title);
    score -= patternScore.penalty;
    if (patternScore.reasons.length > 0) {
      reasons.push(...patternScore.reasons);
    }

    // Ensure score is within bounds
    score = Math.max(0, Math.min(100, score));

    // Determine action
    let action = 'show';
    if (this.settings.dimInsteadOfHide) {
      action = score <= SCORE_THRESHOLDS.HIDE ? 'hide' :
               score <= SCORE_THRESHOLDS.DIM ? 'dim' : 'show';
    } else {
      action = score <= SCORE_THRESHOLDS.HIDE ? 'hide' :
               score <= SCORE_THRESHOLDS.DIM ? 'dim' : 'show';
    }

    return { score, reasons, action };
  }

  /**
   * Check title against keyword list
   */
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

  /**
   * Analyze title for common low-quality patterns
   */
  analyzeTitlePatterns(title) {
    if (!title) {
      return { penalty: 0, reasons: [] };
    }

    let penalty = 0;
    const reasons = [];

    // Check excessive punctuation
    const punctMatches = title.match(TITLE_PATTERNS.EXCESSIVE_PUNCTUATION);
    if (punctMatches) {
      penalty += punctMatches.length * 10;
      reasons.push('Excessive punctuation');
    }

    // Check for ALL CAPS or full-width caps
    const capsMatches = title.match(/[A-Z\u4E00-\u9FFF]/g);
    if (capsMatches && capsMatches.length / title.length > 0.3) {
      penalty += 15;
      reasons.push('Excessive caps/full-width characters');
    }

    // Check for emoji spam
    const emojiMatches = title.match(TITLE_PATTERNS.EMOJI_SPAM);
    if (emojiMatches) {
      penalty += emojiMatches.join('').length * 0.5;
      reasons.push('Emoji spam detected');
    }

    // Check for number patterns like "第X个"
    const numberMatches = title.match(TITLE_PATTERNS.NUMBER_PATTERN);
    if (numberMatches) {
      penalty += numberMatches.length * 8;
      reasons.push('Clickbait number pattern');
    }

    // Check for repeated characters
    const repeatMatches = title.match(TITLE_PATTERNS.REPEATED_CHARS);
    if (repeatMatches) {
      penalty += repeatMatches.length * 5;
      reasons.push('Repeated characters');
    }

    // Check title length (too short or too long)
    if (title.length < 10) {
      penalty += 10;
      reasons.push('Title too short');
    } else if (title.length > 80) {
      penalty += 5;
      reasons.push('Title too long');
    }

    return { penalty, reasons };
  }

  /**
   * Extract video data from a DOM element
   */
  extractVideoData(videoCard) {
    const data = {
      title: '',
      author: '',
      uid: null,
      bvid: null
    };

    try {
      // Try to get title
      const titleEl = videoCard.querySelector(
        '.bili-video-card__title, .video-card__title, .title, [data-title]'
      );
      if (titleEl) {
        data.title = titleEl.textContent?.trim() || '';
      }

      // Try to get author
      const authorEl = videoCard.querySelector(
        '.bili-video-card__info--author, .video-card__author, .author'
      );
      if (authorEl) {
        data.author = authorEl.textContent?.trim() || '';
      }

      // Try to get UID from data attribute or link
      const uidAttr = videoCard.getAttribute('data-uid') ||
                      videoCard.getAttribute('data-author-id');
      if (uidAttr) {
        data.uid = uidAttr;
      }

      // Try to get BV ID
      const bvidAttr = videoCard.getAttribute('data-bvid') ||
                       videoCard.getAttribute('data-video-id');
      if (bvidAttr) {
        data.bvid = bvidAttr;
      }

      // Try to extract from URL if available
      const link = videoCard.querySelector('a[href*="/video/"]');
      if (link) {
        const match = link.href.match(/\/video\/(BV\w+)/);
        if (match) {
          data.bvid = match[1];
        }
      }

    } catch (error) {
      console.error('[BQF] Error extracting video data:', error);
    }

    return data;
  }
}

// Singleton instance
export const videoScorer = new VideoScorer();
