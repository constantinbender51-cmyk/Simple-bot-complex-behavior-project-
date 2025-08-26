// context.js
import { kv } from './redis.js';

const CONTEXT_KEY = 'bot_context';

/**
 * Loads the last saved bot context.
 * @returns {object} The bot's context object.
 */
export async function loadContext() {
  const data = await kv.get(CONTEXT_KEY);
  return JSON.parse(data || '{}');
}

/**
 * Saves the entire bot state to the database.
 * This is the single, centralized function for all state persistence.
 * @param {object} ctx - The complete bot context object to be saved.
 */
export async function saveState(ctx) {
  try {
    await kv.set(CONTEXT_KEY, JSON.stringify(ctx));
  } catch (e) {
    console.error('saveState failed:', e);
  }
}
