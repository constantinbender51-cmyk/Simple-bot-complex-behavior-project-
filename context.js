import { kv } from './redis.js';

const CONTEXT_KEY = 'bot_context';

export async function loadContext() {
  const data = await kv.get(CONTEXT_KEY);
  if (!data) {
    return {};
  }
  return JSON.parse(data);
}

export async function saveContext(data) {
  try {
    // This is the correct, universal save function.
    // It saves the entire 'data' object directly.
    await kv.set(CONTEXT_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('saveContext failed:', e);
  }
}
