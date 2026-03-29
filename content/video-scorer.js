// Bilibili Quality Filter - Video Quality Scorer

import { blocklistManager } from '../storage/blocklist-manager.js';
import {
  TITLE_PATTERNS,
  SCORE_THRESHOLDS,
  BILIBILI_SELECTORS
} from '../utils/constants.js';
import {
  deepQuerySelector,
  getTextContent
} from '../utils/shadow-dom-utils.js';

const BVID_PATTERN = /(BV[0-9A-Za-z]+)/i;
const UID_PATTERN = /space\.bilibili\.com\/(\d+)/i;

function normalizeText(value) {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function extractBvid(value) {
  if (!value) {
    return null;
  }

  const match = String(value).match(BVID_PATTERN);
  return match ? match[1] : null;
}

function extractUid(value) {
  if (!value) {
    return null;
  }

  const match = String(value).match(UID_PATTERN);
  return match ? match[1] : null;
}

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
    const capsMatches = title.match(TITLE_PATTERNS.CAPS_RATIO);
    const visibleLength = title.replace(/\s+/g, '').length || title.length;
    if (capsMatches && capsMatches.length / visibleLength > 0.3) {
      penalty += 15;
      reasons.push('Excessive caps');
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
      const titleEl = deepQuerySelector(BILIBILI_SELECTORS.VIDEO_CARD_TITLE, videoCard);
      const videoLink = deepQuerySelector(BILIBILI_SELECTORS.VIDEO_CARD_LINK, videoCard) ||
        (videoCard.matches?.(BILIBILI_SELECTORS.VIDEO_CARD_LINK) ? videoCard : null);
      const authorEl = deepQuerySelector(BILIBILI_SELECTORS.VIDEO_CARD_AUTHOR, videoCard);
      const authorLink = authorEl?.matches?.('a[href*="space.bilibili.com/"]')
        ? authorEl
        : deepQuerySelector('a[href*="space.bilibili.com/"]', authorEl || videoCard);

      data.title = normalizeText(
        titleEl?.getAttribute('title') ||
        titleEl?.getAttribute('data-title') ||
        getTextContent(titleEl) ||
        videoLink?.getAttribute('title') ||
        getTextContent(videoLink) ||
        videoCard.getAttribute('title') ||
        videoCard.getAttribute('data-title')
      );

      data.author = normalizeText(
        authorEl?.getAttribute('title') ||
        getTextContent(authorEl) ||
        authorLink?.getAttribute('title') ||
        getTextContent(authorLink)
      );

      const uidAttr = videoCard.getAttribute('data-uid') ||
        videoCard.getAttribute('data-author-id');
      data.uid = uidAttr ||
        extractUid(authorLink?.getAttribute?.('href') || authorLink?.href) ||
        extractUid(authorEl?.getAttribute?.('href'));

      const bvidAttr = videoCard.getAttribute('data-bvid') ||
        videoCard.getAttribute('data-video-id') ||
        videoCard.getAttribute('data-key');
      data.bvid = extractBvid(bvidAttr) ||
        extractBvid(videoLink?.getAttribute?.('href') || videoLink?.href) ||
        extractBvid(videoLink?.getAttribute('href'));

    } catch (error) {
      console.error('[BQF] Error extracting video data:', error);
    }

    return data;
  }
}

// Singleton instance
export const videoScorer = new VideoScorer();
