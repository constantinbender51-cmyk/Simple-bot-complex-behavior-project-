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

    if (callsLeft <= 0) {
      log.warn('Daily API call limit reached');
      return;
    }

    // Load last fetch timestamp from context
    const ctx = await loadContext();
    const lastFetchTimestamp = ctx.lastFetchTimestamp || 0;

    // Get market snapshot with PnL data
    const snapshot = await getMarketSnapshot(lastFetchTimestamp);
    
    // Fetch OHLC data using the interval from context or default
    const ohlcInterval = ctx.nextCtx?.ohlcInterval || 60;
    const ohlc = await fetchOHLC(ohlcInterval, 400);

    // Prepare data for strategy engine
    const strategyData = {
      markPrice: snapshot.markPrice,
      position: snapshot.position,
      balance: snapshot.balance,
      pnl: snapshot.pnl, // Include PnL data
      ohlc,
      callsLeft
    };

    // Generate trading plan
    const plan = await decidePlan(strategyData);
    log.info('Generated plan:', plan);

    // Interpret and execute the plan
    if (plan.action && (plan.action.side || plan.action.size > 0)) {
      await interpret(plan, krakenApi, PAIR);
    }

    // Save updated context with current timestamp
    await saveContext({
      ...ctx,
      lastFetchTimestamp: snapshot.timestamp,
      journal: [...(ctx.journal || []), {
        timestamp: new Date().toISOString(),
        decision: plan.reason,
        pnl: snapshot.pnl,
        marketData: {
          markPrice: snapshot.markPrice,
          balance: snapshot.balance,
          positionSize: snapshot.position ? (+snapshot.position.size) * (snapshot.position.side === 'long' ? 1 : -1) : 0
        }
      }],
      nextCtx: plan.nextCtx
    });

    // Update API call counter
    await kv.set(keyToday, callsSoFar + 1);

  } catch (e) {
    console.error('runOnce failed:', e);
    log.error('runOnce error:', e);
  }
}
