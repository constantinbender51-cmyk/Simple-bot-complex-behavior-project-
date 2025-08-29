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

    if (!ctx.journal) {
      ctx.journal = [];
    }
    
    // Now calling getMarketSnapshot without the lastProcessedTime parameter
    // as it was causing an API error.
    const snap = await getMarketSnapshot();
    const ohlc = await fetchOHLC(ctx.ohlcInterval || 5, 400);
    
    const plan = await decidePlan({
      markPrice: snap.markPrice,
      position: snap.position,
      balance: snap.balance,
      ohlc,
      callsLeft
    });

    // 📝 LOGGING: Show the full plan object received from the decision engine.
    log.info('📝 [runOnce] Plan received from decision engine:', JSON.stringify(plan, null, 2));
    
    // --- NEW P&L CALCULATION LOGIC ---
    // We calculate P&L by comparing the balance at the beginning of a trade
    // to the balance at the beginning of the next trade.
    let pnlEvent = null;
    // Check if a new trade is being opened (i.e., we're moving from a zero position)
    const isNewTrade = snap.position?.size !== 0 && (ctx.lastPositionSize === undefined || ctx.lastPositionSize === 0);
    
    // If we're entering a new trade and have a previous trade's balance,
    // calculate the P&L from the last trade.
    if (isNewTrade && ctx.lastTradeBalance !== undefined) {
      const realizedPnL = snap.balance.total - ctx.lastTradeBalance;
      pnlEvent = {
        timestamp: new Date().toISOString(),
        type: 'pnl_event',
        realizedPnL,
        startBalance: ctx.lastTradeBalance,
        endBalance: snap.balance.total,
      };
      log.info(`💰 Realized P&L for previous trade: ${realizedPnL}`);
    }

    // Set the last trade balance if a new trade is being opened, or if it's the very first run.
    if (isNewTrade || ctx.lastTradeBalance === undefined) {
      ctx.lastTradeBalance = snap.balance.total;
    }
    
    // Store the current position size for the next cycle's comparison
    ctx.lastPositionSize = snap.position?.size ?? 0;

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
    if (pnlEvent) {
        ctx.journal.push(pnlEvent);
    }

    // 📝 LOGGING: Show the specific action being passed to the interpreter.
    log.info('🚀 [runOnce] Passing action to interpreter:', JSON.stringify(plan.action, null, 2));

    await interpret(plan.action);
    
    // --- SAVE ONCE, AT THE END ---
    const finalCtx = {
        journal: ctx.journal,
        lastTradeBalance: ctx.lastTradeBalance,
        lastPositionSize: ctx.lastPositionSize,
        nextCtx: plan.nextCtx
    };

    await saveContext(finalCtx);
    log.info('💾 Save context operation requested.');

    await kv.set(keyToday, callsSoFar + 1);

    log.info('✅ Cycle complete. Plan:', plan);
    log.info(`📖 Journal: Current length is ${finalCtx.journal.length}.`);

    return plan;
  } catch (e) {
    console.error('runOnce failed:', e);
  }
}
