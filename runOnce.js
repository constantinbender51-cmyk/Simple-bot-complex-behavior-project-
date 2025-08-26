// runOnce.js
import { getMarketSnapshot } from './marketProxy.js';
import { decidePlan } from './decisionEngine.js';
import { interpret } from './interpreter.js';
import { loadContext, saveState } from './context.js';
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

    // Set initial fetch timestamp on the very first run
    if (!ctx.lastPositionEventsFetch) {
      ctx.lastPositionEventsFetch = Date.now();
      log.info('🤖 Initializing bot for the first time. Starting event tracking from now.');
    }

    const snap = await getMarketSnapshot(ctx.lastPositionEventsFetch);
    const ohlc = await fetchOHLC(ctx.ohlcInterval || 5, 400);

    const plan = await decidePlan({
      markPrice: snap.markPrice,
      position: snap.position,
      balance: snap.balance,
      ohlc,
      callsLeft
    });
    
    // Log the AI's action to the long-term journal BEFORE interpreting it.
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
    ctx.journal = (ctx.journal || []).concat(actionEntry);

    // Execute the plan. This might involve a wait time.
    await interpret(plan.action);

    // Process and log new P&L events.
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
            
            // Check for duplicates before saving to the in-memory journal.
            if (!ctx.journal.find(j => j.closedTime === journalEntry.closedTime && j.pair === journalEntry.pair)) {
              ctx.journal.push(journalEntry);
              log.info('📈 Realized P&L added to journal:', journalEntry);
            }
          }
        }
      });
      ctx.lastPositionEventsFetch = Date.now();
    }
    
    // Update the nextCtx property on the in-memory ctx object.
    ctx.nextCtx = plan.nextCtx;

    // Save the entire updated context to Redis in one go.
    await saveState(ctx);
    await kv.set(keyToday, callsSoFar + 1);

    log.info('✅ Cycle complete. Plan:', plan);
    log.info('📖 Journal Contents:', JSON.stringify(ctx.journal, null, 2));

    return plan;
  } catch (e) {
    console.error('runOnce failed:', e);
  }
}
