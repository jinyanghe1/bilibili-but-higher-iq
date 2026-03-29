// Bilibili Quality Filter - Lightweight ML Sentiment Analyzer
// Uses @xenova/transformers CDN for browser-based inference

import { ML_CONFIG } from '../utils/constants.js';

let sentimentPipeline = null;
let modelLoading = null;

/**
 * Load the sentiment analysis pipeline
 */
async function loadPipeline() {
  if (sentimentPipeline) return sentimentPipeline;
  if (modelLoading) return modelLoading;

  modelLoading = (async () => {
    try {
      // Dynamic import from CDN
      const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.1');

      // Configure for browser use
      env.allowLocalModels = false;
      env.useBrowserCache = true;

      // Create sentiment analysis pipeline
      sentimentPipeline = await pipeline('sentiment-analysis', 'Xenova/transformers-small', {
        progress_callback: (progress) => {
          if (progress.status === 'progress') {
            console.log(`[BQF] ML Model loading: ${Math.round(progress.progress)}%`);
          }
        }
      });

      console.log('[BQF] Sentiment analyzer loaded successfully');
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
 * Analyze sentiment with timeout fallback
 * @param {string} text - Text to analyze
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<{score: number, fallback: boolean}>}
 */
export async function analyzeSentiment(text, timeout = ML_CONFIG.DEFAULT_TIMEOUT) {
  if (!text || text.trim().length === 0) {
    return { score: 50, fallback: true };
  }

  try {
    // Create timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('ML analysis timeout')), timeout);
    });

    // Load pipeline if needed
    const pipelineFn = await Promise.race([
      loadPipeline(),
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

    // Convert to 0-100 scale
    // Positive: 50-100, Negative: 0-50
    const score = label === 'positive'
      ? 50 + (rawScore * 50)
      : label === 'negative'
        ? 50 - (rawScore * 50)
        : 50;

    return { score: Math.round(score), fallback: false };
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
