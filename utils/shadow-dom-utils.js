// Bilibili Quality Filter - Shadow DOM Utilities
// Bilibili heavily uses Shadow DOM, requiring special traversal techniques

/**
 * Check if an element has Shadow DOM
 */
export function hasShadowRoot(element) {
  return element && element.shadowRoot instanceof ShadowRoot;
}

function getDirectSearchRoots(root) {
  const roots = [];

  if (root) {
    roots.push(root);
  }

  if (root instanceof Element && hasShadowRoot(root)) {
    roots.push(root.shadowRoot);
  }

  return roots;
}

/**
 * Deep querySelector that pierces through Shadow DOM boundaries
 * This is necessary because Bilibili uses Web Components extensively
 */
export function deepQuerySelector(selector, root = document) {
  for (const searchRoot of getDirectSearchRoots(root)) {
    const standardResult = searchRoot.querySelector?.(selector);
    if (standardResult) {
      return standardResult;
    }
  }

  // Search through Shadow DOM trees
  const shadowHosts = root?.querySelectorAll ? root.querySelectorAll('*') : [];
  for (const host of shadowHosts) {
    if (hasShadowRoot(host)) {
      const shadowResult = deepQuerySelector(selector, host.shadowRoot);
      if (shadowResult) return shadowResult;
    }
  }

  return null;
}

/**
 * Deep querySelectorAll that pierces through Shadow DOM boundaries
 */
export function deepQuerySelectorAll(selector, root = document, results = new Set()) {
  for (const searchRoot of getDirectSearchRoots(root)) {
    searchRoot.querySelectorAll?.(selector).forEach((el) => results.add(el));
  }

  // Search through Shadow DOM trees
  const shadowHosts = root?.querySelectorAll ? root.querySelectorAll('*') : [];
  for (const host of shadowHosts) {
    if (hasShadowRoot(host)) {
      deepQuerySelectorAll(selector, host.shadowRoot, results);
    }
  }

  return Array.from(results);
}

/**
 * Get all shadow roots in the document recursively
 */
export function getAllShadowRoots(root = document, results = []) {
  if (root instanceof Element && hasShadowRoot(root) && !results.includes(root.shadowRoot)) {
    results.push(root.shadowRoot);
    getAllShadowRoots(root.shadowRoot, results);
  }

  const shadowHosts = root?.querySelectorAll ? root.querySelectorAll('*') : [];
  
  for (const host of shadowHosts) {
    if (hasShadowRoot(host) && !results.includes(host.shadowRoot)) {
      results.push(host.shadowRoot);
      getAllShadowRoots(host.shadowRoot, results);
    }
  }

  return results;
}

/**
 * Check if element is within a specific custom element's shadow DOM
 * Bilibili custom elements: bili-comments, bili-comment-renderer, etc.
 */
export function getShadowHost(element) {
  let current = element;
  while (current && current !== document.body) {
    if (current.parentNode instanceof ShadowRoot) {
      return current.parentNode.host;
    }
    current = current.parentElement || current.parentNode?.host;
  }
  return null;
}

/**
 * Find parent custom element of a given type
 */
export function findParentCustomElement(element, tagName) {
  let current = element;
  while (current && current !== document.body) {
    if (current.tagName?.toLowerCase() === tagName.toLowerCase()) {
      return current;
    }
    // Check if we're in shadow DOM
    if (current.parentNode instanceof ShadowRoot) {
      current = current.parentNode.host;
    } else {
      current = current.parentElement;
    }
  }
  return null;
}

/**
 * Bilibili-specific: Get comment root from within shadow DOM
 */
export function findBiliCommentRoot(element) {
  return findParentCustomElement(element, 'bili-comment-root') ||
         findParentCustomElement(element, 'bili-comments') ||
         findParentCustomElement(element, 'bili-comment-thread-renderer');
}

/**
 * Safe element.matches that works across shadow boundaries
 */
export function elementMatches(element, selector) {
  if (!element || !element.matches) return false;
  
  try {
    return element.matches(selector);
  } catch (e) {
    // Invalid selector
    return false;
  }
}

/**
 * Safe closest that pierces shadow DOM
 */
export function deepClosest(element, selector) {
  let current = element;
  
  while (current && current !== document.body) {
    if (elementMatches(current, selector)) {
      return current;
    }
    
    // Check if we're in shadow DOM
    if (current.parentNode instanceof ShadowRoot) {
      current = current.parentNode.host;
    } else {
      current = current.parentElement;
    }
  }
  
  return null;
}

/**
 * Observe mutations across shadow DOM boundaries
 * Returns a function to disconnect all observers
 */
export function observeShadowDOM(callback, target = document.body, options = { childList: true, subtree: true }) {
  const observers = new Map();
  
  function observeNode(node) {
    if (observers.has(node)) return;
    
    const observer = new MutationObserver((mutations) => {
      callback(mutations);
      
      // Observe any new shadow roots
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            observeNode(node);
            if (hasShadowRoot(node)) {
              observeNode(node.shadowRoot);
            }
            // Check children for shadow roots
            node.querySelectorAll('*').forEach((child) => {
              if (hasShadowRoot(child)) {
                observeNode(child.shadowRoot);
              }
            });
          }
        });
      });
    });
    
    observer.observe(node, options);
    observers.set(node, observer);
  }
  
  // Start observing
  observeNode(target);
  
  // Return disconnect function
  return () => {
    observers.forEach((observer) => observer.disconnect());
    observers.clear();
  };
}

/**
 * Wait for a custom element to be defined and ready
 */
export function waitForCustomElement(tagName, timeout = 5000) {
  return new Promise((resolve, reject) => {
    // Check if already defined
    const existing = document.querySelector(tagName);
    if (existing) {
      resolve(existing);
      return;
    }
    
    const observer = new MutationObserver(() => {
      const element = document.querySelector(tagName);
      if (element) {
        observer.disconnect();
        resolve(element);
      }
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
    
    // Timeout
    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timeout waiting for ${tagName}`));
    }, timeout);
  });
}

/**
 * Get text content from element, including shadow DOM slots
 */
export function getTextContent(element) {
  if (!element) return '';
  
  // Try standard text content
  if (element.textContent) {
    return element.textContent.trim();
  }
  
  // Try shadow DOM
  if (hasShadowRoot(element)) {
    const slot = element.shadowRoot.querySelector('slot');
    if (slot) {
      const assignedNodes = slot.assignedNodes();
      return assignedNodes.map(n => n.textContent).join('').trim();
    }
    return element.shadowRoot.textContent?.trim() || '';
  }
  
  return '';
}

/**
 * Bilibili-specific selectors with Shadow DOM piercing
 * These selectors work with the actual Bilibili DOM structure
 */
export const BILIBILI_SHADOW_SELECTORS = {
  // Comments are inside bili-comments custom element
  COMMENTS_CONTAINER: 'bili-comments, bili-comment-root, [name="comment"]',
  
  // Comment items
  COMMENT_THREAD: 'bili-comment-thread-renderer',
  COMMENT_REPLY: 'bili-comment-reply-renderer',
  COMMENT_ITEM: 'bili-comment-thread-renderer, bili-comment-reply-renderer',
  
  // Video cards in shadow DOM
  VIDEO_CARD: 'bili-video-card, [data-vod-type]',
  
  // User info within shadow DOM
  USER_NAME: '[data-user-profile-id], #user-name, .user-name',
  
  // Rich text content (comments)
  RICH_TEXT: 'bili-rich-text, bili-text-emote, [data-viewer]'
};
