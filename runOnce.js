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

    // --- LOAD ONCE, AT THE START ---
    const ctx = await loadContext();

    // The key fix: set the initial fetch timestamp and ensure journal is an array
    if (!ctx.lastPositionEventsFetch) {
      ctx.lastPositionEventsFetch = Date.now();
      log.info('🤖 Initializing bot for the first time. Starting event tracking from now.');
    }
    // Fix for TypeError: Ensure the journal is an array
    if (!ctx.journal) {
      ctx.journal = [];
    }

    // --------------------------------

    const snap = await getMarketSnapshot(ctx.lastPositionEventsFetch);
    const ohlc = await fetchOHLC(ctx.ohlcInterval || 5, 400);

    const plan = await decidePlan({
      markPrice: snap.markPrice,
      position: snap.position,
      balance: snap.balance,
      ohlc,
      callsLeft
    });
    
    // --- UPDATE CONTEXT IN-MEMORY ---
    // Log the AI's action directly to the local context object
    const actionEntry = {
      timestamp: new Date().toISOString(),
      reason: plan.reason,
      action: plan.action,
      marketData: {
        markPrice: snap.markPrice,
        position: snap.position,
        balance: snap.balance,
      },
      type: 'bot_action'
    };
    ctx.journal.push(actionEntry);

    // Now, execute the plan.
    await interpret(plan.action);

    // Process any new events and add them to the local journal
    if (snap.events && snap.events.length > 0) {
      // Filter events to only process those that are truly new
      const newEvents = snap.events.filter(apiEvent => {
        // Convert Kraken's timestamp (in seconds) to milliseconds for comparison
        const eventTimeMs = apiEvent.timestamp * 1000;
        return eventTimeMs > ctx.lastPositionEventsFetch;
      });
      
      if (newEvents.length > 0) {
        newEvents.forEach(apiEvent => {
          if (apiEvent.event && apiEvent.event.PositionUpdate) {
            const event = apiEvent.event.PositionUpdate;
            if (event.updateReason === 'trade' && event.positionChange === 'close') {
              const journalEntry = {
                closedTime: new Date(apiEvent.timestamp * 1000).toISOString(),
                pair: event.tradeable,
                pnl: +event.realizedPnL,
                side: event.oldPosition === 'long' ? 'sell' : 'buy',
                size: +event.positionChange, 
                entryPrice: +event.oldAverageEntryPrice,
                exitPrice: +event.executionPrice,
                type: 'realized_pnl',
              };
              
              ctx.journal.push(journalEntry);
              log.info('📈 Realized P&L added to journal:', journalEntry);
            }
          }
        });

        // Update the last fetch timestamp.
        const latestEvent = newEvents[newEvents.length - 1];
        ctx.lastPositionEventsFetch = latestEvent.timestamp * 1000;
      }
    }
    
    // --- SAVE ONCE, AT THE END ---
    // Save the AI's state for the next invocation
    ctx.nextCtx = plan.nextCtx;
    await saveContext(ctx);
    // ----------------------------

    await kv.set(keyToday, callsSoFar + 1);

    log.info('✅ Cycle complete. Plan:', plan);
    log.info('📖 Journal Contents:', JSON.stringify(ctx.journal, null, 2));

    return plan;
  } catch (e) {
    console.error('runOnce failed:', e);
  }
}
