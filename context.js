// context.js
import { kv } from './redis.js';

const CONTEXT_KEY = 'bot_context';

/**
 * Saves the current bot context, including the AI's next state and a journal entry.
 * This is for the AI's "short-term" memory and actions taken.
 * The journal will grow indefinitely to serve as "long-term" memory.
 * @param {object} data - The data to save, including nextCtx, reason, action, and marketData.
 */
export async function saveContext(data) {
  try {
    const currentContext = await loadContext();
    
    // The new context is the old one merged with the AI's nextCtx
    const newContext = { ...currentContext, nextCtx: data.nextCtx };
    
    // Create a journal entry for the current AI action and add it to the journal
    const journalEntry = {
      timestamp: new Date().toISOString(),
      reason: data.reason,
      action: data.action,
      marketData: data.marketData,
      type: 'bot_action'
    };
    
    // Append the new entry to the journal. The key fix is that we are no longer
    // using .slice(-10) so the journal will retain all entries.
    newContext.journal = (newContext.journal || []).concat(journalEntry);
    await kv.set(CONTEXT_KEY, JSON.stringify(newContext));
  } catch (e) {
    console.error('saveContext failed:', e);
  }
}

/**
 * Saves a journal entry for a realized P&L event.
 * @param {object} entry - The journal entry object.
 */
export async function saveJournalEntry(entry) {
  try {
    const currentContext = await loadContext();
    const newContext = { ...currentContext };
    
    // Add the new P&L entry to the journal
    newContext.journal = (newContext.journal || []).concat(entry);
    await kv.set(CONTEXT_KEY, JSON.stringify(newContext));
  } catch (e) {
    console.error('saveJournalEntry failed:', e);
  }
}


/**
 * Loads the last saved bot context.
 * @returns {object} The bot's context object.
 */
export async function loadContext() {
  const data = await kv.get(CONTEXT_KEY);
  return JSON.parse(data || '{}');
}

