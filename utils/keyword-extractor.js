// Bilibili Quality Filter - Keyword Extractor
// Extracts meaningful keywords from comments for blocklist enhancement

/**
 * Stop words to filter out (common Chinese and English words)
 */
const STOP_WORDS = new Set([
  // Common Chinese
  '的', '了', '是', '我', '你', '他', '她', '它', '们', '这', '那', '有', '在', '就', '不', '会', '要', '还', '可以', '这个', '那个', '什么', '怎么', '为什么',
  // Common English
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
  // Bilibili-specific common
  '视频', 'up', '主', '评论', '弹幕', '点赞', '投币', '收藏', '转发', '关注', '粉丝', '播放', '观看', '觉得', '认为', '感觉', '真的', '其实', '不过', '但是', '因为', '所以', '如果', '的话'
]);

/**
 * Extract keywords from text using simple segmentation
 * @param {string} text - Input text
 * @param {number} maxKeywords - Maximum number of keywords to return
 * @returns {string[]} Array of extracted keywords
 */
export function extractKeywords(text, maxKeywords = 5) {
  if (!text || typeof text !== 'string') {
    return [];
  }

  // Clean the text
  const cleanedText = text
    .replace(/https?:\/\/\S+/g, '') // Remove URLs
    .replace(/[@#]\w+/g, '') // Remove @mentions and #hashtags
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g, ' ') // Keep only Chinese, English, numbers
    .trim();

  if (!cleanedText) {
    return [];
  }

  const wordFreq = new Map();

  // Extract Chinese words (2-4 characters)
  const chineseWords = extractChineseWords(cleanedText);
  for (const word of chineseWords) {
    if (!STOP_WORDS.has(word) && word.length >= 2) {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    }
  }

  // Extract English phrases
  const englishWords = extractEnglishWords(cleanedText);
  for (const word of englishWords) {
    const lowerWord = word.toLowerCase();
    if (!STOP_WORDS.has(lowerWord) && word.length >= 3) {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    }
  }

  // Sort by frequency and return top keywords
  const sortedWords = Array.from(wordFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([word]) => word);

  return sortedWords;
}

/**
 * Extract Chinese words using simple forward maximum matching
 * @param {string} text - Chinese text
 * @returns {string[]} Extracted words
 */
function extractChineseWords(text) {
  const words = [];
  const chineseText = text.replace(/[^\u4e00-\u9fa5]/g, '');
  
  if (!chineseText) return words;

  // Simple segmentation: try 4-gram, 3-gram, 2-gram
  let i = 0;
  while (i < chineseText.length - 1) {
    // Try 4-gram first
    if (i + 4 <= chineseText.length) {
      const quad = chineseText.slice(i, i + 4);
      if (isMeaningfulWord(quad)) {
        words.push(quad);
        i += 4;
        continue;
      }
    }
    
    // Try 3-gram
    if (i + 3 <= chineseText.length) {
      const tri = chineseText.slice(i, i + 3);
      if (isMeaningfulWord(tri)) {
        words.push(tri);
        i += 3;
        continue;
      }
    }
    
    // Try 2-gram (bigram)
    if (i + 2 <= chineseText.length) {
      const bi = chineseText.slice(i, i + 2);
      words.push(bi);
      i += 2;
      continue;
    }
    
    i++;
  }

  return words;
}

/**
 * Check if a word is likely meaningful (simple heuristic)
 * @param {string} word - Word to check
 * @returns {boolean} Whether word is meaningful
 */
function isMeaningfulWord(word) {
  // Filter out words with too many common characters
  const commonChars = ['的', '了', '是', '在', '和', '就', '都', '而', '及', '与', '或', '但', '如', '若', '因', '为', '之', '其', '这', '那'];
  const commonCount = word.split('').filter(c => commonChars.includes(c)).length;
  
  // If more than half are common characters, likely not meaningful
  if (commonCount > word.length / 2) {
    return false;
  }

  return true;
}

/**
 * Extract English words and phrases
 * @param {string} text - Text containing English
 * @returns {string[]} Extracted words
 */
function extractEnglishWords(text) {
  const words = [];
  const englishParts = text.match(/[a-zA-Z]+/g);
  
  if (englishParts) {
    for (const part of englishParts) {
      if (part.length >= 3) {
        words.push(part);
      }
    }
  }
  
  return words;
}

/**
 * Calculate relevance score for a keyword based on context
 * @param {string} keyword - The keyword
 * @param {string} context - Full text context
 * @returns {number} Relevance score (0-1)
 */
export function calculateRelevance(keyword, context) {
  if (!keyword || !context) return 0;
  
  const lowerKeyword = keyword.toLowerCase();
  const lowerContext = context.toLowerCase();
  
  // Frequency in context
  const regex = new RegExp(lowerKeyword, 'g');
  const matches = lowerContext.match(regex);
  const frequency = matches ? matches.length : 0;
  
  // Length factor (longer words are more specific)
  const lengthFactor = Math.min(keyword.length / 10, 1);
  
  // Position factor (words at beginning are often more important)
  const position = lowerContext.indexOf(lowerKeyword);
  const positionFactor = position >= 0 ? Math.max(1 - (position / lowerContext.length), 0.5) : 0.5;
  
  // Combined score
  const score = Math.min(frequency * 0.3 + lengthFactor * 0.4 + positionFactor * 0.3, 1);
  
  return score;
}

/**
 * Filter and rank extracted keywords
 * @param {string[]} keywords - Array of keywords
 * @param {string} context - Original context text
 * @param {number} minRelevance - Minimum relevance threshold
 * @returns {Array<{keyword: string, relevance: number}>} Ranked keywords
 */
export function rankKeywords(keywords, context, minRelevance = 0.3) {
  const ranked = keywords
    .map(keyword => ({
      keyword,
      relevance: calculateRelevance(keyword, context)
    }))
    .filter(item => item.relevance >= minRelevance)
    .sort((a, b) => b.relevance - a.relevance);
  
  return ranked;
}

/**
 * Quick keyword extraction with ranking
 * @param {string} text - Input text
 * @param {number} maxResults - Maximum results
 * @returns {Array<{keyword: string, relevance: number}>} Ranked keywords
 */
export function extractAndRankKeywords(text, maxResults = 5) {
  const keywords = extractKeywords(text, maxResults * 2);
  return rankKeywords(keywords, text).slice(0, maxResults);
}
