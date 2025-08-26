// context.js
import { kv } from './redis.js';

const CONTEXT_KEY = 'bot_context';

/**
 * Saves the bot's short-term context, which is the AI's next state.
 * This is used for the AI to remember specific variables for the next run.
 * @param {object} data - The AI's next context object.
 */
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

/**
 * Loads the last saved bot context.
 * @returns {object} The bot's context object.
 */
export async function loadContext() {
  const data = await kv.get(CONTEXT_KEY);
  return JSON.parse(data || '{}');
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
 * Saves a journal entry for an AI action.
 * @param {object} entry - The journal entry object.
 */
export async function saveActionEntry(entry) {
  try {
    const currentContext = await loadContext();
    const newContext = { ...currentContext };

    // Create a journal entry for the current AI action
    const journalEntry = {
      timestamp: new Date().toISOString(),
      reason: entry.reason,
      action: entry.action,
      marketData: entry.marketData,
      type: 'bot_action'
    };

    // Append the new entry to the journal
    newContext.journal = (newContext.journal || []).concat(journalEntry);
    await kv.set(CONTEXT_KEY, JSON.stringify(newContext));
  } catch (e) {
    console.error('saveActionEntry failed:', e);
  }
}
