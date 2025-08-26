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
    const currentContext = await loadContext();
    // Only update the nextCtx part of the context
    const newContext = { ...currentContext, nextCtx: data };
    await kv.set(CONTEXT_KEY, JSON.stringify(newContext));
  } catch (e) {
    console.error('saveContext failed:', e);
  }
}
