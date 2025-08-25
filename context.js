// context.js
import { kv } from './redis.js';

const CONTEXT_KEY = 'bot_context';

export async function saveContext(data) {
  const currentContext = await loadContext();
  const newContext = { ...currentContext, ...data.nextCtx };
  // Add a journal entry for the current action
  const journalEntry = {
    timestamp: new Date().toISOString(),
    plan: data.plan,
    marketData: data.marketData,
    outcome: data.outcome || 'executed'
  };
  newContext.journal = (newContext.journal || []).concat(journalEntry).slice(-10); // Keep last 10 entries
  await kv.set(CONTEXT_KEY, JSON.stringify(newContext));
}

export async function loadContext() {
  const data = await kv.get(CONTEXT_KEY);
  return JSON.parse(data || '{}');
}
