// runOnce.js
import { getMarketSnapshot } from './marketProxy.js';
import { decidePlan } from './decisionEngine.js';
import { interpret } from './interpreter.js';
import { saveContext, loadContext } from './context.js';
import { kv } from './redis.js';
import { log } from './logger.js';
import PnLCalculator from './pnlCalculator.js';

const PAIR = 'PF_XBTUSD';

// Initialize the P&L calculator here
const pnlCalculator = new PnLCalculator();

export async function runOnce() {
  try {
    const keyToday = `calls_${new Date().toISOString().slice(0, 10)}`;
    let callsSoFar = +(await kv.get(keyToday)) || 0;
    const limitPerDay = 500;
    const callsLeft = limitPerDay - callsSoFar;

    // --- LOAD ONCE, AT THE START ---
    // We now load the last processed fill time directly from the PnLCalculator's
    // state to avoid duplicate state management.
    const lastProcessedTime = await pnlCalculator.getLastProcessedFillTime();
    
    // The context will now only store the bot's action journal
    const ctx = await loadContext();
    
    log.info('📊 Keys in context loaded from Redis:', Object.keys(ctx));

    if (!ctx.journal) {
      ctx.journal = [];
    }

    // Pass the last processed time to getMarketSnapshot to fetch only new fills
    const snap = await getMarketSnapshot(lastProcessedTime);
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

    // --- NEW P&L CALCULATION AND JOURNALING ---
    // Use the PnLCalculator to process the fills and get new P&L data
    // The fills are now correctly filtered by time in marketProxy.js
    const { newFills, realizedPnL, totalFees, tradeCount } = await pnlCalculator.calculatePnL(snap.fills);
    
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
      
      // Update the cumulative P&L with the new data
      await pnlCalculator.updateCumulativePnL({
        realizedPnL: realizedPnL,
        totalFees: totalFees,
        tradeCount: tradeCount
      });
    }
    
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
    log.info(`📈 P&L Events: Added ${pnlEventsAdded} new fill events.`);
    log.info(`💰 Realized P&L from this cycle: ${realizedPnL}, Fees: ${totalFees}`);

    return plan;
  } catch (e) {
    console.error('runOnce failed:', e);
  }
}
