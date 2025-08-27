// runOnce.js
import { getMarketSnapshot } from './marketProxy.js';
import { decidePlan } from './decisionEngine.js';
import { interpret } from './interpreter.js';
import { saveContext, loadContext } from './context.js';
import { kv } from './redis.js';
import { log } from './logger.js';
import PnLCalculator from './pnlCalculator.js';
import KrakenFuturesApi from './krakenApi.js';

const PAIR = 'PF_XBTUSD';
const krakenApi = new KrakenFuturesApi(
  process.env.KRAKEN_API_KEY,
  process.env.KRAKEN_SECRET_KEY
);

// Initialize the P&L calculator here
const pnlCalculator = new PnLCalculator();

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
    // as it was causing an API error. The PnLCalculator will handle filtering.
    const snap = await getMarketSnapshot();
    const ohlc = await fetchOHLC(ctx.ohlcInterval || 5, 400);
    
    // 📝 LOGGING: Show the specific parameters being passed to the decision engine.
    log.info('🔍 [runOnce] Preparing to call decidePlan with:', {
      markPrice: snap.markPrice,
      position: snap.position,
      balance: snap.balance,
      ohlcCount: ohlc.length,
      callsLeft
    });

    const plan = await decidePlan({
      markPrice: snap.markPrice,
      position: snap.position,
      balance: snap.balance,
      ohlc,
      callsLeft
    });

    // 📝 LOGGING: Show the full plan object received from the decision engine.
    log.info('📝 [runOnce] Plan received from decision engine:', JSON.stringify(plan, null, 2));
    
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

    // 📝 LOGGING: Show the specific action being passed to the interpreter.
    log.info('🚀 [runOnce] Passing action to interpreter:', JSON.stringify(plan.action, null, 2));

    await interpret(plan.action);

    // --- NEW P&L CALCULATION AND JOURNALING ---
    // Pass the full list of fills to the PnLCalculator, which will handle filtering
    // and processing only the new ones.
    const { newFills, realizedPnL, totalFees, tradeCount } = await pnlCalculator.calculateAndSavePnL(snap.fills);
    
    let pnlEventsAdded = 0;
    if (newFills.length > 0) {
      // Create journal entries for each new fill for a detailed record
      newFills.forEach(fill => {
        const pnlEvent = {
          fillTime: new Date(fill.fillTime).toISOString(),
          pair: fill.symbol,
          size: fill.size,
          price: fill.price,
          type: 'fill_event',
          fillType: fill.fillType,
        };
        ctx.journal.push(pnlEvent);
        pnlEventsAdded++;
      });
    }
    
    // --- SAVE ONCE, AT THE END ---
    const finalCtx = {
        journal: ctx.journal,
        nextCtx: plan.nextCtx
    };
    
    // 📝 LOGGING: Show the final context object before saving.
    log.info('📦 [runOnce] Saving final context:', JSON.stringify(finalCtx, null, 2));

    await saveContext(finalCtx);
    log.info('💾 Save context operation requested.');

    await kv.set(keyToday, callsSoFar + 1);

    log.info('✅ Cycle complete. Plan:', plan);
    log.info(`📖 Journal: Current length is ${finalCtx.journal.length}.`);
    log.info(`📈 P&L Events: Added ${pnlEventsAdded} new fill events.`);
    log.info(`💰 Realized P&L from this cycle: ${realizedPnL}, Fees: ${totalFees}`);

    return plan;
  } catch (e) {
    console.error('runOnce failed:', e);
  }
}
