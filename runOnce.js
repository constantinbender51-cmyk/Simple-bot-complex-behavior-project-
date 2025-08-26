// runOnce.js
import { getMarketSnapshot } from './marketProxy.js';
import { decidePlan }        from './decisionEngine.js';
import { interpret }         from './interpreter.js';
import { saveContext, loadContext } from './context.js';
import KrakenFuturesApi      from './krakenApi.js';
import { kv }                from './redis.js';
import { sendMarketOrder } from './execution.js';
import { log } from './logger.js';

const PAIR = 'PF_XBTUSD';

// --- Correct way to use KrakenFuturesApi as a class ---
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
    const keyToday = `calls_${new Date().toISOString().slice(0,10)}`;
    let callsSoFar = +(await kv.get(keyToday)) || 0;
    const limitPerDay = 500;
    const callsLeft   = limitPerDay - callsSoFar;
    
    const snap = await getMarketSnapshot(PAIR);
    const ctx = await loadContext();
    const ohlc = await fetchOHLC(ctx.ohlcInterval || 5, 400);

    const plan = await decidePlan({
        markPrice: snap.markPrice,
        position:  snap.position,
        balance:   snap.balance,
        ohlc,
        callsLeft
    });
    console.log('📋 PLAN:', plan);
    
    // Execute the action specified by the brain
    await interpret(plan.action);
    
    // ------------------ P&L LOGGING LOGIC ------------------
    const lastFetch = ctx.lastPositionEventsFetch || 0;
    // Correctly call the method on the krakenApi instance
    const events = await krakenApi.getPositionEvents({ since: lastFetch });
    
    if (events && events.length > 0) {
        ctx.journal = ctx.journal || [];
        
        events.forEach(event => {
            if (event.updateReason === 'trade' && event.positionChange === 'close') {
                const journalEntry = {
                    closedTime: new Date(event.timestamp).toISOString(),
                    pair: event.tradeable,
                    pnl: +event.realizedPnL,
                    side: event.oldPosition === 'long' ? 'sell' : 'buy',
                    size: +event.positionChange,
                    entryPrice: +event.oldAverageEntryPrice,
                    exitPrice: +event.executionPrice,
                    type: 'realized_pnl',
                };
                
                if (!ctx.journal.find(j => j.closedTime === journalEntry.closedTime && j.pair === journalEntry.pair)) {
                    ctx.journal.push(journalEntry);
                    log.info('📈 Realized P&L added to journal:', journalEntry);
                }
            }
        });
        
        ctx.lastPositionEventsFetch = Date.now();
    }
    
    log.info('📖 Journal Contents:', JSON.stringify(ctx.journal, null, 2));
    
    // Save the new context and journal data in one single call
    await saveContext({ 
        nextCtx: plan.nextCtx,
        reason: plan.reason,
        action: plan.action,
        marketData: snap
    });
    
    await kv.set(keyToday, callsSoFar + 1);
  } catch (e) {
    console.error('runOnce failed:', e);
  }
}
