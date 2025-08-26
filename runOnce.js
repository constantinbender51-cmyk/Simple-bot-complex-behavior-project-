// runOnce.js
import { ExecutionHandler } from './executionHandler.js';
import { StrategyEngine } from './strategyEngine.js';
import { DataHandler } from './dataHandler.js';
import { loadContext, saveContext } from './context.js';
import { log } from './logger.js';
import { getPositionEvents } from './krakenApi.js';
import { createClient } from 'redis';

const KV = createClient({ url: process.env.REDIS_URL });
KV.connect();

const KEY = d => `calls_${d.toISOString().slice(0, 10)}`;

export const runOnce = async () => {
  try {
    const data = new DataHandler();
    const market = await data.getMarketData();
    const snap = await data.getAccountSnapshot();
    const ohlc = await data.getOHLC(market.pair);
    const engine = new StrategyEngine();
    
    const todayKey = KEY(new Date());
    const callsToday = +(await KV.get(todayKey)) || 0;
    const callsLeft = 500 - callsToday;

    if (callsLeft <= 0) {
      log.info('API call limit reached. Waiting for next day.');
      return { nextCtx: { waitTime: 1440 } };
    }

    const ctx = await loadContext();

    const plan = await engine.generatePlan({
      markPrice: market.price,
      position: snap.position,
      balance: snap.balance,
      ohlc,
      callsLeft
    });

    if (plan?.action?.side && plan.action.size > 0) {
      const execution = new ExecutionHandler();
      log.info(`Attempting to place market order: ${plan.action.side} ${plan.action.size}`);
      await execution.placeMarketOrder(plan.action);
    }

    const lastFetch = ctx.lastPositionEventsFetch || 0;
    const events = await getPositionEvents({ since: lastFetch });
    
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
    
    // --- NEW LOGGING STATEMENT ---
    log.info('📖 Journal Contents:', JSON.stringify(ctx.journal, null, 2));

    await saveContext(ctx);
    
    await KV.set(todayKey, callsToday + 1);
    
    log.info('✅ Cycle complete. Plan:', plan);
    
    return plan;
  } catch (error) {
    log.error("An error occurred in runOnce. The bot will restart after the default interval.", error);
    const plan = { nextCtx: { waitTime: 5 } };
    return plan;
  }
};
