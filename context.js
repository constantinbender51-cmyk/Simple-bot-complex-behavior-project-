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
    // Load the current context to ensure we don't overwrite other data
    const currentContext = await loadContext();
    
    // Merge the new data directly into the main context object,
    // overwriting keys as needed. This ensures all state is saved at the top level.
    const newContext = { ...currentContext, ...data };

    await kv.set(CONTEXT_KEY, JSON.stringify(newContext));
  } catch (e) {
    console.error('saveContext failed:', e);
  }
}
