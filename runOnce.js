// runOnce.js
import { getMarketSnapshot } from './marketProxy.js';
import { decidePlan } from './decisionEngine.js';
import { interpret } from './interpreter.js';
import { saveContext, loadContext, saveJournalEntry } from './context.js';
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

    const ctx = await loadContext();
    const lastFillTime = (Date.now() - 1000 * 60 * 60 * 24).toString();

    const snap = await getMarketSnapshot( ctx.lastPositionEventsFetch);
    const ohlc = await fetchOHLC(ctx.ohlcInterval || 5, 400);

    const plan = await decidePlan({
      markPrice: snap.markPrice,
      position: snap.position,
      balance: snap.balance,
      ohlc,
      callsLeft
    });
    
    await interpret(plan.action);

    // Now, process any new events and save them to the journal
    if (snap.events && snap.events.length > 0) {
      snap.events.forEach(apiEvent => {
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
            
            // Check for duplicates before saving
            if (!ctx.journal.find(j => j.closedTime === journalEntry.closedTime && j.pair === journalEntry.pair)) {
              saveJournalEntry(journalEntry); // Use the new function to save the entry
              log.info('📈 Realized P&L added to journal:', journalEntry);
            }
          }
        }
      });
      ctx.lastPositionEventsFetch = Date.now();
    }
    
    // Save the context for the AI's next invocation.
    // This is for the AI's short-term memory and the action it just took.
    await saveContext({
      nextCtx: plan.nextCtx,
      reason: plan.reason,
      action: plan.action,
      marketData: snap.markPrice
    });

    await kv.set(keyToday, callsSoFar + 1);
    log.info('✅ Cycle complete. Plan:', plan);
    log.info('📖 Journal Contents:', JSON.stringify((await loadContext()).journal, null, 2));

    return plan;
  } catch (e) {
    console.error('runOnce failed:', e);
  }
}
