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

    if (!ctx.lastPositionEventsFetch) {
      ctx.lastPositionEventsFetch = Date.now();
      log.info('🤖 Initializing bot for the first time. Starting event tracking from now.');
    }

    if (!ctx.journal) {
      ctx.journal = [];
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
    
    // --- UPDATE CONTEXT IN-MEMORY ---
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

    await interpret(plan.action);

    if (snap.events && snap.events.length > 0) {
      const newEvents = snap.events.filter(apiEvent => apiEvent.timestamp > ctx.lastPositionEventsFetch);
      
      if (newEvents.length > 0) {
        log.info(`✅ Found ${newEvents.length} new events and added to journal.`);
        newEvents.forEach(apiEvent => {
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
              
              ctx.journal.push(journalEntry);
            }
          }
        });

        const latestEvent = newEvents[newEvents.length - 1];
        ctx.lastPositionEventsFetch = latestEvent.timestamp;
      }
    }
    
    // --- SAVE ONCE, AT THE END ---
    ctx.nextCtx = plan.nextCtx;
    await saveContext(ctx);
    log.info('💾 Save context operation requested.');

    await kv.set(keyToday, callsSoFar + 1);

    log.info('✅ Cycle complete. Plan:', plan);
    log.info('📖 Journal Contents:', JSON.stringify(ctx.journal, null, 2));

    return plan;
  } catch (e) {
    console.error('runOnce failed:', e);
  }
}
