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

/**
 * Calculates realized P&L from a list of fills, grouping by order to find closed trades.
 * This is based on the logic you provided.
 * @param {Array<Object>} fills - The list of fill objects from the Kraken API.
 * @returns {Array<Object>} An array of journal entries for realized P&L events.
 */
function calculatePnlFromFills(fills) {
  if (!fills || fills.length === 0) {
    return [];
  }

  // Sort fills by time in ascending order to ensure correct processing
  const sortedFills = fills.sort((a, b) => new Date(a.fillTime) - new Date(b.fillTime));

  // Group fills by order ID
  const trades = {};
  sortedFills.forEach(fill => {
    const orderId = fill.orderId;
    if (!trades[orderId]) {
      trades[orderId] = {
        symbol: fill.symbol,
        fills: [],
        totalQuantity: 0,
        totalCost: 0,
      };
    }
    
    trades[orderId].fills.push(fill);
    trades[orderId].totalQuantity += parseFloat(fill.size);
    trades[orderId].totalCost += parseFloat(fill.size) * parseFloat(fill.price);
  });
  
  const pnlEvents = [];
  
  Object.values(trades).forEach(trade => {
    // For this simplified P&L calculation, we'll assume a single order represents a complete trade.
    // In a more complex scenario, you'd track open positions and match new fills against them (like FIFO).
    
    // We only process trades that are fully closed (i.e., have an opposing fill).
    // A simple way to check is if the total quantity for the order is zero or close to it.
    if (Math.abs(trade.totalQuantity) < 0.0000001) {
        // This is a closed trade. Calculate PnL.
        const firstFill = trade.fills[0];
        const lastFill = trade.fills[trade.fills.length - 1];
        
        const entryPrice = trade.totalCost / trade.totalQuantity;
        const exitPrice = parseFloat(lastFill.price);
        const quantity = parseFloat(firstFill.size);
        
        let pnl;
        if (firstFill.side === 'buy') {
          pnl = (exitPrice - entryPrice) * quantity;
        } else {
          pnl = (entryPrice - exitPrice) * quantity;
        }

        // Create the journal entry
        const journalEntry = {
          closedTime: new Date(lastFill.fillTime).toISOString(),
          pair: trade.symbol,
          pnl: pnl,
          side: firstFill.side,
          size: quantity,
          entryPrice: entryPrice,
          exitPrice: exitPrice,
          type: 'realized_pnl',
        };
        pnlEvents.push(journalEntry);
    }
  });

  return pnlEvents;
}

export async function runOnce() {
  try {
    const keyToday = `calls_${new Date().toISOString().slice(0, 10)}`;
    let callsSoFar = +(await kv.get(keyToday)) || 0;
    const limitPerDay = 500;
    const callsLeft = limitPerDay - callsSoFar;

    // --- LOAD ONCE, AT THE START ---
    const ctx = await loadContext();
    
    log.info('📊 Keys in context loaded from Redis:', Object.keys(ctx));

    if (!ctx.lastPositionEventsFetch) {
      // The context variable name is a remnant from the old method, but
      // we'll reuse it to store the timestamp of the last processed fill.
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

    // --- NEW P&L CALCULATION FROM FILLS ---
    const pnlEvents = calculatePnlFromFills(snap.fills);
    let pnlEventsAdded = 0;

    if (pnlEvents.length > 0) {
      pnlEvents.forEach(pnlEvent => {
        ctx.journal.push(pnlEvent);
        pnlEventsAdded++;
      });
      
      // Update the timestamp to the latest fill time to avoid re-processing
      // the same fills on the next cycle.
      const latestFill = snap.fills.reduce((latest, fill) => {
        return (new Date(fill.fillTime).getTime() > new Date(latest.fillTime).getTime()) ? fill : latest;
      }, snap.fills[0]);

      ctx.lastPositionEventsFetch = new Date(latestFill.fillTime).getTime();
    }
    
    // --- SAVE ONCE, AT THE END ---
    const finalCtx = {
        journal: ctx.journal,
        lastPositionEventsFetch: ctx.lastPositionEventsFetch,
        nextCtx: plan.nextCtx
    };
    
    log.info(`💾 LastPositionEventsFetch before save: ${finalCtx.lastPositionEventsFetch}`);

    await saveContext(finalCtx);
    log.info('💾 Save context operation requested.');

    await kv.set(keyToday, callsSoFar + 1);

    log.info('✅ Cycle complete. Plan:', plan);
    log.info(`📖 Journal: Current length is ${finalCtx.journal.length}.`);
    log.info(`📈 P&L Events: Added ${pnlEventsAdded} new events.`);

    return plan;
  } catch (e) {
    console.error('runOnce failed:', e);
  }
}
