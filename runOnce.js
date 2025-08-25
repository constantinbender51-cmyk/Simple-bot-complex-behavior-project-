// runOnce.js
import { getMarketSnapshot } from './marketProxy.js';
import { decidePlan }        from './decisionEngine.js';
import { executePlan }       from './execution.js';
import { log }               from './logger.js';
import KrakenFuturesApi      from './krakenApi.js';

const PAIR = 'PF_XBTUSD';

// simple in-memory cache so we don’t hammer the history endpoint
let lastInterval = 60;   // default 1-hour candles
let lastCandles  = null;

export async function runOnce() {
  try {
    log.info('=== cycle start ===');

    // 1️⃣ initial snapshot
    const snap = await getMarketSnapshot(PAIR);

    // 2️⃣ ask AI for plan & desired interval
    let plan = await decidePlan({ ...snap, ohlc: lastCandles });

    // 3️⃣ re-fetch OHLC if AI wants different interval
    if (plan.ohlcInterval && plan.ohlcInterval !== lastInterval) {
      log.info(`Switching to ${plan.ohlcInterval}m candles`);
      lastInterval = plan.ohlcInterval;
      lastCandles  = await fetchOHLC(plan.ohlcInterval);
      plan         = await decidePlan({ ...snap, ohlc: lastCandles });
    }

    // 4️⃣ execute steps
    if (plan.steps?.length) {
      await executePlan(plan.steps, PAIR);
    } else {
      log.info('Plan says hold / no steps');
    }

    log.info('=== cycle end ===');
  } catch (err) {
    log.error('runOnce failed:', err);
  }
}

/* -------------------------------------------------------------- */
/* private helpers                                                */
/* -------------------------------------------------------------- */
async function fetchOHLC(intervalMinutes) {
  const api = new KrakenFuturesApi(
    process.env.KRAKEN_API_KEY,
    process.env.KRAKEN_SECRET_KEY
  );

  const now   = Date.now();
  const since = Math.floor((now - 1000 * 60 * 60 * 24 * 3) / 1000); // 3 days back
  const res   = await api.getHistory({
    symbol: PAIR,
    resolution: intervalMinutes,
    from: since
  });
  return res.history?.map(c => ({
    open:  +c.open,
    high:  +c.high,
    low:   +c.low,
    close: +c.close,
    volume: +c.volume,
    timestamp: c.timestamp
  })) || [];
}
