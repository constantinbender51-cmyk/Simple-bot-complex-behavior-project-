// runOnce.js
import { getMarketSnapshot } from './marketProxy.js';
import { decidePlan } from './decisionEngine.js';
import { interpret } from './interpreter.js';
import { saveContext, loadContext } from './context.js';
import { kv } from './redis.js';
import { log } from './logger.js';
import KrakenFuturesApi from './krakenApi.js';

const PAIR = 'PF_XBTUSD';

const krakenApi = new KrakenFuturesApi(
  process.env.KRAKEN_API_KEY,
  process.env.KRAKEN_SECRET_KEY
);

async function fetchOHLC(intervalMinutes, count) {
  const since = Math.floor(Date.now() / 1000 - intervalMinutes * 60 * count);
  return krakenApi.fetchKrakenData({ pair: 'XBTUSD', interval: intervalMinutes, since });
}

export async function runOnce() {
  try {
    const keyToday = `calls_${new Date().toISOString().slice(0, 10)}`;
    let callsSoFar = +(await kv.get(keyToday)) || 0;
    const limitPerDay = 500;
    const callsLeft = limitPerDay - callsSoFar;

    // Load the existing context, which might be an empty object on the first run
    const ctx = await loadContext();
    const lastFillTime = (Date.now() - 1000 * 60 * 60 * 24).toString();

    const snap = await getMarketSnapshot(lastFillTime, ctx.lastPositionEventsFetch);
    const ohlc = await fetchOHLC(ctx.ohlcInterval || 5, 400);

    const plan = await decidePlan({
      markPrice: snap.markPrice,
      position: snap.position,
      balance: snap.balance,
      ohlc,
      callsLeft
    });
    console.log('📋 PLAN:', plan);

    await interpret(plan.action);

    // FIX: Ensure the journal is an array from the start
    // The journal is now a property of the main context object.
    const journal = ctx.journal || [];

    // FIX: Access the nested 'elements' array
    if (snap.events && snap.events.elements && snap.events.elements.length > 0) {
      // FIX: Iterate over 'elements' and access the nested 'event' object
      snap.events.elements.forEach(apiEvent => {
        // FIX: Check for the nested PositionUpdate object
        if (apiEvent.event && apiEvent.event.PositionUpdate) {
          const event = apiEvent.event.PositionUpdate;
          if (event.updateReason === 'trade' && event.positionChange === 'close') {
            const journalEntry = {
              closedTime: new Date(apiEvent.timestamp).toISOString(),
              pair: event.tradeable,
              pnl: +event.realizedPnL,
              side: event.oldPosition === 'long' ? 'sell' : 'buy',
              size: +event.positionChange,
              entryPrice: +event.oldAverageEntryPrice,
              exitPrice: +event.executionPrice,
              type: 'realized_pnl',
            };
            // Only add a new entry if it doesn't already exist
            if (!journal.find(j => j.closedTime === journalEntry.closedTime && j.pair === journalEntry.pair)) {
              journal.push(journalEntry);
              log.info('📈 Realized P&L added to journal:', journalEntry);
            }
          }
        }
      });
      ctx.lastPositionEventsFetch = Date.now();
    }
    
    // Log the current journal contents for debugging
    log.info('📖 Journal Contents:', JSON.stringify(journal, null, 2));

    // FIX: Construct the new context object with all the updated information,
    // including the journal, and pass it to a simplified saveContext function.
    const newContext = {
      ...ctx, // Start with the old context
      nextCtx: plan.nextCtx, // Add the AI's plan context
      reason: plan.reason,
      action: plan.action,
      marketData: snap.markPrice,
      journal: journal.slice(-10) // Keep the last 10 entries
    };

    await saveContext(newContext);

    await kv.set(keyToday, callsSoFar + 1);
    log.info('✅ Cycle complete. Plan:', plan);

    return plan;
  } catch (e) {
    console.error('runOnce failed:', e);
  }
}
