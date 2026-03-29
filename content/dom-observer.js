// Bilibili Quality Filter - DOM Observer
// Watches for new video cards and comments, applies filtering

import { videoScorer } from './video-scorer.js';
import { commentFilter } from './comment-filter.js';
import { BILIBILI_SELECTORS } from '../utils/constants.js';

const URL_CHANGE_EVENT = 'bqf:urlchange';
const HISTORY_PATCH_FLAG = '__bqfHistoryPatchInstalled';
const REFRESH_MESSAGE_TYPES = new Set([
  'SETTINGS_UPDATED',
  'REFRESH_DATA',
  'REFRESH_FILTERS',
  'REFRESH_SETTINGS',
  'SETTINGS_REFRESHED',
  'BLOCKLIST_UPDATED',
  'USER_UNBLOCKED'
]);

class DOMObserver {
  constructor() {
    this.observer = null;
    this.isInitialized = false;
    this.isObserving = false;
    this.scanVersion = 0;
    this.currentUrl = location.href;

    this.processedVideos = new WeakSet();
    this.processedComments = new WeakSet();
    this.processingVideos = new WeakSet();
    this.processingComments = new WeakSet();
    this.styleSnapshots = new WeakMap();

    this.pendingVideos = new Set();
    this.pendingComments = new Set();
    this.processTimer = null;
    this.rescanTimer = null;
    this.urlPollTimer = null;

    this.boundHandleStorageChange = this.handleStorageChange.bind(this);
    this.boundHandleRuntimeMessage = this.handleRuntimeMessage.bind(this);
    this.boundHandleUrlChange = this.handlePotentialUrlChange.bind(this);
  }

  /**
   * Initialize the observer
   */
  async init() {
    if (this.isInitialized) return;

    try {
      await Promise.all([
        videoScorer.init(),
        commentFilter.init()
      ]);

      this.setupUrlChangeListener();
      this.setupStorageListener();
      this.setupMessageListener();
      this.startObserving();
      this.prepareForRescan();
      this.processExistingElements();

      this.isInitialized = true;
      console.log('[BQF] DOM Observer initialized');
    } catch (error) {
      console.error('[BQF] DOM Observer init failed:', error);
    }
  }

  /**
   * Setup URL change listener for SPA navigation
   */
  setupUrlChangeListener() {
    if (!window[HISTORY_PATCH_FLAG]) {
      const notifyUrlChange = () => {
        window.dispatchEvent(new Event(URL_CHANGE_EVENT));
      };

      const originalPushState = history.pushState;
      const originalReplaceState = history.replaceState;

      history.pushState = function (...args) {
        const result = originalPushState.apply(this, args);
        notifyUrlChange();
        return result;
      };

      history.replaceState = function (...args) {
        const result = originalReplaceState.apply(this, args);
        notifyUrlChange();
        return result;
      };

      window.addEventListener('popstate', notifyUrlChange);
      window.addEventListener('hashchange', notifyUrlChange);
      window[HISTORY_PATCH_FLAG] = true;
    }

    window.addEventListener(URL_CHANGE_EVENT, this.boundHandleUrlChange);
    this.urlPollTimer = window.setInterval(() => {
      this.handlePotentialUrlChange();
    }, 1000);
  }

  /**
   * Setup sync storage listener for settings changes
   */
  setupStorageListener() {
    chrome.storage?.onChanged?.addListener(this.boundHandleStorageChange);
  }

  /**
   * Setup runtime message listener
   */
  setupMessageListener() {
    chrome.runtime?.onMessage?.addListener(this.boundHandleRuntimeMessage);
  }

  /**
   * Handle storage changes
   */
  handleStorageChange(changes, areaName) {
    if (areaName !== 'sync' || !changes.settings) {
      return;
    }

    this.handleDataRefresh('storage sync update').catch((error) => {
      console.error('[BQF] Failed to handle storage update:', error);
    });
  }

  /**
   * Handle runtime messages from background or UI
   */
  handleRuntimeMessage(message, sender, sendResponse) {
    const type = typeof message?.type === 'string' ? message.type.toUpperCase() : '';

    if (type === 'USER_BLOCKED') {
      this.handleUserBlocked(message.uid).then(() => {
        sendResponse?.({ success: true });
      }).catch((error) => {
        console.error('[BQF] Failed to handle USER_BLOCKED message:', error);
        sendResponse?.({ success: false, error: error.message });
      });
      return true;
    }

    if (REFRESH_MESSAGE_TYPES.has(type)) {
      this.handleDataRefresh(type).then(() => {
        sendResponse?.({ success: true });
      }).catch((error) => {
        console.error(`[BQF] Failed to handle ${type} message:`, error);
        sendResponse?.({ success: false, error: error.message });
      });
      return true;
    }

    return false;
  }

  /**
   * Handle URL changes on SPA pages
   */
  handlePotentialUrlChange() {
    if (location.href === this.currentUrl) {
      return;
    }

    this.currentUrl = location.href;
    this.prepareForRescan();
    this.scheduleFullRescan(400);
  }

  /**
   * Refresh scorer data and rescan current content
   */
  async handleDataRefresh(source = 'unknown') {
    try {
      await Promise.all([
        videoScorer.refreshData(),
        commentFilter.refreshData()
      ]);
    } catch (error) {
      console.error(`[BQF] Failed to refresh filtering data after ${source}:`, error);
      throw error;
    }

    this.prepareForRescan();
    this.processExistingElements();
  }

  /**
   * Refresh data, immediately hide blocked user content, then rescan
   */
  async handleUserBlocked(uid) {
    try {
      await Promise.all([
        videoScorer.refreshData(),
        commentFilter.refreshData()
      ]);
    } catch (error) {
      console.error('[BQF] Failed to refresh data for blocked user update:', error);
      throw error;
    }

    this.prepareForRescan();

    if (uid !== undefined && uid !== null && uid !== '') {
      this.hideAllContentFromUser(uid);
    }

    this.processExistingElements();
  }

  /**
   * Reset process bookkeeping so content can be rescored
   */
  prepareForRescan() {
    this.scanVersion += 1;
    this.processedVideos = new WeakSet();
    this.processedComments = new WeakSet();
    this.processingVideos = new WeakSet();
    this.processingComments = new WeakSet();
    this.pendingVideos = new Set();
    this.pendingComments = new Set();

    if (this.processTimer) {
      window.clearTimeout(this.processTimer);
      this.processTimer = null;
    }
  }

  /**
   * Queue a full-page rescan
   */
  scheduleFullRescan(delay = 0) {
    if (this.rescanTimer) {
      window.clearTimeout(this.rescanTimer);
    }

    this.rescanTimer = window.setTimeout(() => {
      this.rescanTimer = null;
      this.processExistingElements();
    }, delay);
  }

  /**
   * Start observing DOM changes
   */
  startObserving() {
    if (this.isObserving) return;

    const targetNode = document.body || document.documentElement;
    if (!targetNode) {
      console.error('[BQF] Unable to start DOM observer: document body not available');
      return;
    }

    this.observer = new MutationObserver((mutations) => {
      try {
        this.handleMutations(mutations);
      } catch (error) {
        console.error('[BQF] Error handling DOM mutations:', error);
      }
    });

    this.observer.observe(targetNode, {
      childList: true,
      subtree: true,
      characterData: true
    });

    this.isObserving = true;
  }

  /**
   * Stop observing DOM changes
   */
  stopObserving() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    this.isObserving = false;
  }

  /**
   * Handle DOM mutations
   */
  handleMutations(mutations) {
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') {
        const parent = mutation.target?.parentElement;
        if (parent) {
          this.collectCandidates(parent);
        }
        continue;
      }

      if (mutation.target instanceof Element) {
        this.collectCandidates(mutation.target);
      }

      for (const node of mutation.addedNodes) {
        this.collectCandidates(node);
      }
    }

    this.schedulePendingProcessing();
  }

  /**
   * Collect candidate cards/comments from a node
   */
  collectCandidates(node) {
    if (!node) {
      return;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      const parent = node.parentElement;
      if (parent) {
        this.collectCandidates(parent);
      }
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    const element = /** @type {Element} */ (node);

    const videoCard = element.matches?.(BILIBILI_SELECTORS.VIDEO_CARD)
      ? element
      : element.closest?.(BILIBILI_SELECTORS.VIDEO_CARD);
    if (videoCard) {
      this.pendingVideos.add(videoCard);
    }

    const commentItem = element.matches?.(BILIBILI_SELECTORS.COMMENT_ITEM)
      ? element
      : element.closest?.(BILIBILI_SELECTORS.COMMENT_ITEM);
    if (commentItem) {
      this.pendingComments.add(commentItem);
    }

    element.querySelectorAll?.(BILIBILI_SELECTORS.VIDEO_CARD).forEach((card) => {
      this.pendingVideos.add(card);
    });

    element.querySelectorAll?.(BILIBILI_SELECTORS.COMMENT_ITEM).forEach((commentEl) => {
      this.pendingComments.add(commentEl);
    });
  }

  /**
   * Process existing elements on the page
   */
  processExistingElements() {
    const root = document.querySelector(BILIBILI_SELECTORS.MAIN_CONTENT) || document;

    root.querySelectorAll(BILIBILI_SELECTORS.VIDEO_CARD).forEach((card) => {
      this.pendingVideos.add(card);
    });

    document.querySelectorAll(BILIBILI_SELECTORS.COMMENT_ITEM).forEach((commentEl) => {
      this.pendingComments.add(commentEl);
    });

    this.schedulePendingProcessing(0);
  }

  /**
   * Schedule pending candidate processing
   */
  schedulePendingProcessing(delay = 80) {
    if (this.processTimer) {
      window.clearTimeout(this.processTimer);
    }

    this.processTimer = window.setTimeout(() => {
      this.processTimer = null;
      this.flushPendingElements();
    }, delay);
  }

  /**
   * Flush queued cards/comments
   */
  flushPendingElements() {
    const videoCards = Array.from(this.pendingVideos);
    const comments = Array.from(this.pendingComments);

    this.pendingVideos.clear();
    this.pendingComments.clear();

    for (const card of videoCards) {
      this.processVideoCard(card);
    }

    for (const commentEl of comments) {
      this.processComment(commentEl);
    }
  }

  /**
   * Process a video card
   */
  async processVideoCard(card) {
    if (!card || !card.isConnected) {
      return;
    }

    if (this.processedVideos.has(card) || this.processingVideos.has(card)) {
      return;
    }

    const scanVersion = this.scanVersion;
    this.processingVideos.add(card);

    try {
      this.resetVideoCard(card);

      const videoData = videoScorer.extractVideoData(card);
      if (!videoData.title && !videoData.bvid && !videoData.uid) {
        return;
      }

      const result = await videoScorer.scoreVideo(videoData);
      if (!card.isConnected || scanVersion !== this.scanVersion) {
        return;
      }

      const action = this.resolveVideoAction(result);
      if (action === 'hide') {
        this.hideVideoCard(card, result);
      } else if (action === 'dim') {
        this.dimVideoCard(card, result);
      }

      this.processedVideos.add(card);
    } catch (error) {
      console.error('[BQF] Error processing video card:', error);
    } finally {
      this.processingVideos.delete(card);
    }
  }

  /**
   * Resolve final video action from scorer result and current settings
   */
  resolveVideoAction(result) {
    if (
      result?.action === 'hide' &&
      videoScorer.settings?.dimInsteadOfHide &&
      !result.reasons?.includes('User is blocked')
    ) {
      return 'dim';
    }

    return result?.action || 'show';
  }

  /**
   * Reset extension styling from a video card
   */
  resetVideoCard(card) {
    card.classList.remove('bqf-video-hidden', 'bqf-video-dimmed');
    this.restoreInlineStyle(card);
    card.querySelectorAll('.bqf-video-badge').forEach((badge) => {
      badge.remove();
    });
  }

  /**
   * Hide a video card
   */
  hideVideoCard(card, result = null) {
    this.snapshotInlineStyle(card);
    card.classList.add('bqf-video-hidden');
    card.style.display = 'none';

    if (result?.reasons?.length) {
      card.setAttribute('data-bqf-hidden-reason', result.reasons.join(', '));
    } else {
      card.removeAttribute('data-bqf-hidden-reason');
    }
  }

  /**
   * Dim a video card and add a badge
   */
  dimVideoCard(card, result) {
    this.snapshotInlineStyle(card);
    card.classList.add('bqf-video-dimmed');
    card.style.opacity = '0.38';
    card.style.filter = 'grayscale(0.75)';
    card.style.transition = 'opacity 0.2s ease, filter 0.2s ease';

    const badge = this.createVideoBadge(result);
    const titleEl = card.querySelector(BILIBILI_SELECTORS.VIDEO_CARD_TITLE);

    if (titleEl) {
      titleEl.appendChild(badge);
    } else {
      card.prepend(badge);
    }
  }

  /**
   * Create a video badge for dimmed content
   */
  createVideoBadge(result) {
    const badge = document.createElement('span');
    badge.className = 'bqf-video-badge';
    badge.textContent = 'BQF · Low quality';
    badge.title = this.getReasonText(result?.reasons, 'Low quality content');
    badge.style.cssText = [
      'display: inline-flex',
      'align-items: center',
      'margin-left: 6px',
      'padding: 1px 6px',
      'border-radius: 999px',
      'background: rgba(251, 114, 153, 0.15)',
      'color: #fb7299',
      'font-size: 11px',
      'font-weight: 600',
      'line-height: 1.4',
      'vertical-align: middle'
    ].join('; ');
    return badge;
  }

  /**
   * Process a comment item
   */
  async processComment(commentEl) {
    if (!commentEl || !commentEl.isConnected) {
      return;
    }

    if (this.processedComments.has(commentEl) || this.processingComments.has(commentEl)) {
      return;
    }

    const scanVersion = this.scanVersion;
    this.processingComments.add(commentEl);

    try {
      this.resetComment(commentEl);

      const commentData = commentFilter.extractCommentData(commentEl);
      if (!commentData.content && !commentData.uid) {
        return;
      }

      const result = await commentFilter.scoreComment(commentData);
      if (!commentEl.isConnected || scanVersion !== this.scanVersion) {
        return;
      }

      if (result.action === 'hide') {
        this.hideComment(commentEl, result);
      } else if (result.action === 'warn') {
        this.warnComment(commentEl, result);
      }

      if (result.action !== 'hide' && commentFilter.settings?.showBlockUserButton) {
        commentFilter.addBlockUserButton(commentEl);
      }

      this.processedComments.add(commentEl);
    } catch (error) {
      console.error('[BQF] Error processing comment:', error);
    } finally {
      this.processingComments.delete(commentEl);
    }
  }

  /**
   * Reset extension styling from a comment
   */
  resetComment(commentEl) {
    this.restoreCommentVisibility(commentEl);
    commentEl.querySelectorAll('.bqf-block-user-btn').forEach((button) => {
      button.remove();
    });
    commentEl.classList.remove('bqf-comment-shown');
  }

  /**
   * Hide a comment body but leave a visible explanation and show button
   */
  hideComment(commentEl, result) {
    const contentEl = commentEl.querySelector(BILIBILI_SELECTORS.COMMENT_CONTENT);

    this.snapshotInlineStyle(commentEl);
    this.snapshotInlineStyle(contentEl);

    commentEl.classList.add('bqf-comment-hidden');
    commentEl.style.backgroundColor = 'rgba(251, 114, 153, 0.08)';
    commentEl.style.borderLeft = '3px solid #fb7299';
    commentEl.style.paddingLeft = '12px';
    commentEl.style.transition = 'background-color 0.2s ease';

    if (contentEl) {
      contentEl.style.display = 'none';
    }

    const tools = document.createElement('div');
    tools.className = 'bqf-comment-tools';
    tools.style.cssText = [
      'display: flex',
      'flex-direction: column',
      'align-items: flex-start',
      'gap: 8px',
      'margin: 8px 0 0'
    ].join('; ');

    const reasonEl = document.createElement('div');
    reasonEl.className = 'bqf-comment-status';
    reasonEl.textContent = `Filtered comment: ${this.getReasonText(result?.reasons, 'Matched filter rules')}`;
    reasonEl.style.cssText = [
      'font-size: 12px',
      'line-height: 1.5',
      'color: #fb7299',
      'background: rgba(251, 114, 153, 0.08)',
      'border-radius: 6px',
      'padding: 6px 10px'
    ].join('; ');

    const showButton = commentFilter.createShowAnywayButton(commentEl);
    showButton.addEventListener('click', () => {
      this.restoreCommentVisibility(commentEl, { removeBlockButtons: false });
    }, { once: true });

    tools.appendChild(reasonEl);
    tools.appendChild(showButton);

    if (contentEl?.parentNode) {
      contentEl.insertAdjacentElement('afterend', tools);
    } else {
      commentEl.appendChild(tools);
    }
  }

  /**
   * Mark a comment as suspicious and dim it visually
   */
  warnComment(commentEl, result) {
    this.snapshotInlineStyle(commentEl);

    commentEl.classList.add('bqf-comment-warned');
    commentEl.style.opacity = '0.62';
    commentEl.style.filter = 'saturate(0.75)';
    commentEl.style.backgroundColor = 'rgba(250, 173, 20, 0.08)';
    commentEl.style.borderLeft = '3px solid #faad14';
    commentEl.style.paddingLeft = '12px';
    commentEl.style.transition = 'opacity 0.2s ease, filter 0.2s ease';

    const warning = document.createElement('span');
    warning.className = 'bqf-comment-warning';
    warning.textContent = 'BQF warning';
    warning.title = this.getReasonText(result?.reasons, 'Potentially low-quality comment');
    warning.style.cssText = [
      'display: inline-flex',
      'align-items: center',
      'margin-left: 6px',
      'padding: 1px 6px',
      'border-radius: 999px',
      'background: rgba(250, 173, 20, 0.15)',
      'color: #ad6800',
      'font-size: 11px',
      'font-weight: 600',
      'line-height: 1.4',
      'vertical-align: middle'
    ].join('; ');

    const authorEl = commentEl.querySelector(BILIBILI_SELECTORS.COMMENT_AUTHOR);
    if (authorEl) {
      authorEl.appendChild(warning);
    } else {
      commentEl.prepend(warning);
    }
  }

  /**
   * Restore a comment's original inline styles and remove extension UI
   */
  restoreCommentVisibility(commentEl, { removeBlockButtons = true } = {}) {
    commentEl.classList.remove('bqf-comment-hidden', 'bqf-comment-warned');
    this.restoreInlineStyle(commentEl);

    commentEl.querySelectorAll(BILIBILI_SELECTORS.COMMENT_CONTENT).forEach((contentEl) => {
      this.restoreInlineStyle(contentEl);
    });

    commentEl.querySelectorAll('.bqf-comment-tools, .bqf-comment-warning, .bqf-show-anyway-btn').forEach((node) => {
      node.remove();
    });

    if (removeBlockButtons) {
      commentEl.querySelectorAll('.bqf-block-user-btn').forEach((button) => {
        button.remove();
      });
    }
  }

  /**
   * Hide current content from a newly blocked user immediately
   */
  hideAllContentFromUser(uid) {
    const normalizedUid = String(uid);
    const blockedResult = {
      reasons: ['User is blocked'],
      action: 'hide'
    };

    document.querySelectorAll(BILIBILI_SELECTORS.VIDEO_CARD).forEach((card) => {
      try {
        const videoData = videoScorer.extractVideoData(card);
        const cardUid = videoData.uid || card.getAttribute('data-uid') || card.getAttribute('data-author-id');
        if (String(cardUid || '') !== normalizedUid) {
          return;
        }

        this.resetVideoCard(card);
        this.hideVideoCard(card, blockedResult);
        this.processedVideos.add(card);
      } catch (error) {
        console.error('[BQF] Failed to hide blocked user video:', error);
      }
    });

    document.querySelectorAll(BILIBILI_SELECTORS.COMMENT_ITEM).forEach((commentEl) => {
      try {
        const commentData = commentFilter.extractCommentData(commentEl);
        if (String(commentData.uid || '') !== normalizedUid) {
          return;
        }

        this.resetComment(commentEl);
        this.hideComment(commentEl, blockedResult);
        this.processedComments.add(commentEl);
      } catch (error) {
        console.error('[BQF] Failed to hide blocked user comment:', error);
      }
    });
  }

  /**
   * Snapshot an element's inline style for safe restoration
   */
  snapshotInlineStyle(element) {
    if (!element || this.styleSnapshots.has(element)) {
      return;
    }

    this.styleSnapshots.set(element, {
      hadStyleAttribute: element.hasAttribute('style'),
      cssText: element.getAttribute('style') || ''
    });
  }

  /**
   * Restore a previously captured inline style
   */
  restoreInlineStyle(element) {
    if (!element) {
      return;
    }

    const snapshot = this.styleSnapshots.get(element);
    if (!snapshot) {
      return;
    }

    if (snapshot.hadStyleAttribute) {
      element.setAttribute('style', snapshot.cssText);
    } else {
      element.removeAttribute('style');
    }

    this.styleSnapshots.delete(element);
  }

  /**
   * Join reason strings into user-facing text
   */
  getReasonText(reasons, fallback) {
    const text = Array.isArray(reasons)
      ? reasons.filter(Boolean).join(', ')
      : '';
    return text || fallback;
  }

  /**
   * Disconnect observer and remove listeners
   */
  disconnect() {
    this.stopObserving();
    chrome.runtime?.onMessage?.removeListener(this.boundHandleRuntimeMessage);
    chrome.storage?.onChanged?.removeListener(this.boundHandleStorageChange);
    window.removeEventListener(URL_CHANGE_EVENT, this.boundHandleUrlChange);

    if (this.processTimer) {
      window.clearTimeout(this.processTimer);
      this.processTimer = null;
    }

    if (this.rescanTimer) {
      window.clearTimeout(this.rescanTimer);
      this.rescanTimer = null;
    }

    if (this.urlPollTimer) {
      window.clearInterval(this.urlPollTimer);
      this.urlPollTimer = null;
    }

    this.isInitialized = false;
  }
}

// Singleton instance
const domObserver = new DOMObserver();

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    domObserver.init().catch((error) => {
      console.error('[BQF] DOM Observer init failed:', error);
    });
  }, { once: true });
} else {
  domObserver.init().catch((error) => {
    console.error('[BQF] DOM Observer init failed:', error);
  });
}

export { domObserver, DOMObserver };
