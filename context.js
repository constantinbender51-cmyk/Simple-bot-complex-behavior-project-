// context.js
import { kv } from './redis.js';

const CONTEXT_KEY = 'bot_context';

export async function saveContext(data) {
  const currentContext = await loadContext();
  
  // The new context is the old one combined with the AI's nextCtx
  const newContext = { ...currentContext, nextCtx: data.plan.nextCtx };
  
  // Add a journal entry for the current action
  const journalEntry = {
    timestamp: new Date().toISOString(),
    reason: data.plan.reason,
    action: data.plan.action,
    marketData: data.marketData
  };
  
  newContext.journal = (newContext.journal || []).concat(journalEntry).slice(-10); // Keep last 10 entries
  await kv.set(CONTEXT_KEY, JSON.stringify(newContext));
}

export async function loadContext() {
  const data = await kv.get(CONTEXT_KEY);
  return JSON.parse(data || '{}');
}
