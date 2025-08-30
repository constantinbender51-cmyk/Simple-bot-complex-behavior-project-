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

// PnLCalculator has been removed as requested.

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

    // Capture the state of the open position before the trade
    const preExecutionSnap = await getMarketSnapshot();
    const preExecutionPosition = preExecutionSnap.position;
    const ohlc = await fetchOHLC(ctx.ohlcInterval || 5, 400);

    const plan = await decidePlan({
      markPrice: preExecutionSnap.markPrice,
      position: preExecutionPosition,
      balance: preExecutionSnap.balance,
      ohlc,
      callsLeft
    });

    log.info('📝 [runOnce] Plan received from decision engine:', JSON.stringify(plan, null, 2));

    await interpret(plan.action);

    // --- P&L ESTIMATION LOGIC ---
    // Capture the state of the open position after the trade
    const postExecutionSnap = await getMarketSnapshot();
    const postExecutionPosition = postExecutionSnap.position.openPositions;
    const currentPrice = postExecutionSnap.markPrice;

    let estimatedRealizedPnL = 0;
    let estimatedFees = 0; // We cannot accurately estimate fees with this method

    if (preExecutionPosition && !postExecutionPosition) {
      // Case 1: The position was completely closed
      estimatedRealizedPnL = (currentPrice - preExecutionPosition.price) * preExecutionPosition.size;
      log.info(`💰 Estimated P&L: Position completely closed.`);
    } else if (preExecutionPosition && postExecutionPosition && Math.abs(preExecutionPosition.size) > Math.abs(postExecutionPosition.size)) {
      // Case 2: The position was partially closed
      const sizeClosed = Math.abs(preExecutionPosition.size) - Math.abs(postExecutionPosition.size);
      estimatedRealizedPnL = (currentPrice - preExecutionPosition.price) * sizeClosed;
      log.info(`💰 Estimated P&L: Position partially closed.`);
    } else {
      log.info(`💰 No realized P&L to estimate in this cycle.`);
    }
    
    // --- UPDATE CONTEXT IN-MEMORY ---
    const actionEntry = {
      timestamp: new Date().toISOString(),
      reason: plan.reason,
      action: plan.action,
      marketData: {
        markPrice: preExecutionSnap.markPrice,
        position: preExecutionSnap.position,
        balance: preExecutionSnap.balance,
      },
      pnlEstimate: {
        realizedPnL: estimatedRealizedPnL,
        fees: estimatedFees,
      },
      type: 'bot_action'
    };
    ctx.journal.push(actionEntry);

    log.info('🚀 [runOnce] Passing action to interpreter:', JSON.stringify(plan.action, null, 2));

    // --- SAVE ONCE, AT THE END ---
    const finalCtx = {
        journal: ctx.journal,
        nextCtx: plan.nextCtx
    };

    await saveContext(finalCtx);
    log.info('💾 Save context operation requested.');

    await kv.set(keyToday, callsSoFar + 1);

    log.info('✅ Cycle complete. Plan:', plan);
    log.info(`📖 Journal: Current length is ${finalCtx.journal.length}.`);
    log.info(`📈 Estimated Realized P&L from this cycle: ${estimatedRealizedPnL}`);
    
    return plan;
  } catch (e) {
    console.error('runOnce failed:', e);
  }
}
