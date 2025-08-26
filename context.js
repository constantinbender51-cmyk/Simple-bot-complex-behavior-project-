// context.js
import { kv } from './redis.js';

const CONTEXT_KEY = 'bot_context';

// FIX: This function now simply takes the complete context object and saves it
export async function saveContext(newContext) {
  try {
    await kv.set(CONTEXT_KEY, JSON.stringify(newContext));
    log.info('✅ Context saved successfully.');
  } catch (e) {
    log.error('❌ Failed to save context:', e);
  }
}

// This function remains the same, it handles the initial case where no context exists
export async function loadContext() {
  const data = await kv.get(CONTEXT_KEY);
  return JSON.parse(data || '{}');
}
