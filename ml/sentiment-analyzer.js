// Bilibili Quality Filter - Lightweight ML Sentiment Analyzer
// Uses @xenova/transformers CDN for browser-based inference

import { ML_CONFIG } from '../utils/constants.js';

let sentimentPipeline = null;
let modelLoading = null;
let currentConfig = null;

/**
 * Get default inference configuration
 * @returns {Object} Default config
 */
function getDefaultConfig() {
  return { ...ML_CONFIG.DEFAULT_INFERENCE_CONFIG };
}

/**
 * Load the sentiment analysis pipeline with custom configuration
 * @param {Object} customConfig - Optional configuration override
 * @param {string} customConfig.model - Model name
 * @param {string} customConfig.dtype - Quantization type ('q4', 'q8', 'fp16', 'fp32')
 * @param {string} customConfig.device - Device ('cpu', 'webgpu')
 */
async function loadPipeline(customConfig = null) {
  // If pipeline exists with same config, reuse it
  if (sentimentPipeline && !customConfig && !currentConfig) {
    return sentimentPipeline;
  }
  
  // If a different config is requested, reset pipeline
  if (customConfig && currentConfig) {
    const configChanged = 
      customConfig.model !== currentConfig.model ||
      customConfig.dtype !== currentConfig.dtype ||
      customConfig.device !== currentConfig.device;
    
    if (configChanged) {
      sentimentPipeline = null;
      modelLoading = null;
    }
  }

  if (modelLoading) return modelLoading;

  const config = customConfig || getDefaultConfig();
  currentConfig = config;

  modelLoading = (async () => {
    try {
      // Dynamic import from CDN
      const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.1');

      // Configure for browser use
      env.allowLocalModels = false;
      env.useBrowserCache = true;

      // Build pipeline options
      const pipelineOptions = {
        progress_callback: (progress) => {
          if (progress.status === 'progress') {
            console.log(`[BQF] ML Model loading: ${Math.round(progress.progress)}%`);
          }
        }
      };

      // Add dtype if specified (quantization)
      if (config.dtype) {
        pipelineOptions.dtype = config.dtype;
      }

      // Add device if specified
      if (config.device && config.device !== 'cpu') {
        pipelineOptions.device = config.device;
      }

      // Create sentiment analysis pipeline with custom model
      const modelName = config.model || ML_CONFIG.MODEL_NAME;
      sentimentPipeline = await pipeline('sentiment-analysis', modelName, pipelineOptions);

      console.log(`[BQF] Sentiment analyzer loaded: ${modelName} (dtype=${config.dtype || 'default'}, device=${config.device || 'cpu'})`);
      return sentimentPipeline;
    } catch (error) {
      console.error('[BQF] Failed to load sentiment analyzer:', error);
      modelLoading = null;
      throw error;
    }
  })();

  return modelLoading;
}

/**
 * Check if text contains Chinese characters
 * Note: English sentiment model performs poorly on Chinese
 */
function containsChinese(text) {
  return /[\u4e00-\u9fff]/.test(text);
}

/**
 * Reload pipeline with new configuration
 * @param {Object} newConfig - New configuration
 * @returns {Promise<boolean>} Success status
 */
export async function reloadPipeline(newConfig) {
  // Reset current pipeline
  sentimentPipeline = null;
  modelLoading = null;
  currentConfig = null;
  
  try {
    await loadPipeline(newConfig);
    return true;
  } catch (error) {
    console.error('[BQF] Failed to reload ML pipeline:', error);
    return false;
  }
}

/**
 * Get current ML configuration
 * @returns {Object} Current config or default
 */
export function getCurrentConfig() {
  return currentConfig ? { ...currentConfig } : getDefaultConfig();
}

/**
 * Analyze sentiment with timeout fallback
 * @param {string} text - Text to analyze
 * @param {Object} options - Analysis options
 * @param {number} options.timeout - Timeout in milliseconds
 * @param {Object} options.config - ML configuration override
 * @returns {Promise<{score: number, fallback: boolean, confidence?: number}>}
 */
export async function analyzeSentiment(text, options = {}) {
  const timeout = options.timeout || ML_CONFIG.DEFAULT_TIMEOUT;
  const config = options.config || null;

  if (!text || text.trim().length === 0) {
    return { score: ML_CONFIG.NEUTRAL_SCORE, fallback: true };
  }

  // Early return for Chinese text with English models
  if (containsChinese(text)) {
    // Check if using a multilingual model
    const modelName = config?.model || currentConfig?.model || ML_CONFIG.MODEL_NAME;
    const isMultilingual = modelName.includes('multilingual');
    
    if (!isMultilingual) {
      console.log('[BQF] Chinese text detected, skipping English-only ML model');
      return { score: ML_CONFIG.NEUTRAL_SCORE, fallback: true };
    }
  }

  try {
    // Create timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('ML analysis timeout')), timeout);
    });

    // Load pipeline if needed (with custom config)
    const pipelineFn = await Promise.race([
      loadPipeline(config),
      timeoutPromise
    ]);

    // Run inference with timeout
    const result = await Promise.race([
      pipelineFn(text),
      timeoutPromise
    ]);

    // Transform result to score (0-100 scale)
    // sentiment-analysis returns: { label: 'positive'|'negative', score: 0-1 }
    const label = result[0]?.label || 'neutral';
    const rawScore = result[0]?.score || 0.5;

    // Apply configurable scoring
    let score;
    if (label === 'positive') {
      score = ML_CONFIG.NEUTRAL_SCORE + (rawScore * ML_CONFIG.POSITIVE_BOOST);
    } else if (label === 'negative') {
      score = ML_CONFIG.NEUTRAL_SCORE - (rawScore * ML_CONFIG.NEGATIVE_PENALTY);
    } else {
      score = ML_CONFIG.NEUTRAL_SCORE;
    }

    // Apply confidence weighting if enabled
    if (ML_CONFIG.USE_CONFIDENCE_WEIGHTING) {
      // Pull score toward neutral if confidence is low
      const confidence = result[0]?.score || 0.5;
      if (confidence < ML_CONFIG.CONFIDENCE_THRESHOLD) {
        const confidenceFactor = confidence / ML_CONFIG.CONFIDENCE_THRESHOLD;
        score = (score * confidenceFactor) + (ML_CONFIG.NEUTRAL_SCORE * (1 - confidenceFactor));
      }
    }

    return { score: Math.round(score), fallback: false, confidence: rawScore };
  } catch (error) {
    console.warn('[BQF] ML analysis failed, using fallback:', error.message);
    return { score: 50, fallback: true };
  }
}

/**
 * Check if the ML model is loaded
 */
export function isModelLoaded() {
  return sentimentPipeline !== null;
}

/**
 * Check if the model is currently loading
 */
export function isModelLoading() {
  return modelLoading !== null;
}
