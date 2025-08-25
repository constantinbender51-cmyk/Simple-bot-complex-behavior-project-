// runOnce.js
import { getMarketSnapshot } from './marketProxy.js';
import { decidePlan }        from './decisionEngine.js';
import { executePlan }       from './execution.js';
import { log }               from './logger.js';
import KrakenFuturesApi      from './krakenApi.js';

const PAIR = 'PF_XBTUSD';

// in-memory caches (reset on every Railway container start)
let lastInterval   = 60;   // fallback
let lastCandles    = null;

export async function runOnce() {
  try {
    log.info('=== cycle start ===');

    // 1️⃣ fresh market snapshot
    const snap = await getMarketSnapshot(PAIR);

    // 2️⃣ ask AI for plan & preferred OHLC parameters
    let plan = await decidePlan({ ...snap, ohlc: lastCandles });

    // 3️⃣ re-fetch OHLC if AI changed interval or count
    if (plan.intervalMinutes && plan.candleCount) {
      log.info(`AI requesting ${plan.candleCount} candles @ ${plan.intervalMinutes}m`);
      lastInterval = plan.intervalMinutes;
      lastCandles  = await fetchOHLC(plan.intervalMinutes, plan.candleCount);
      plan         = await decidePlan({ ...snap, ohlc: lastCandles });
    }

    // 4️⃣ execute the resulting steps
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
/* helper – fetch OHLC                                            */
/* -------------------------------------------------------------- */
async function fetchOHLC(intervalMinutes, candleCount) {
  const api   = new KrakenFuturesApi(
    process.env.KRAKEN_API_KEY,
    process.env.KRAKEN_SECRET_KEY
  );

  const now   = Date.now();
  const since = Math.floor((now - intervalMinutes * 60_000 * candleCount) / 1000);

  // ensure everything is a string/number
  const params = {
    symbol: `${PAIR}`,
    resolution: Number(intervalMinutes),
    from: since
  };
  console.log('fetchOHLC params:', params);
  
  const res = await api.getHistory(params);
  return (res.history || []).map(c => ({
    open:      +c.open,
    high:      +c.high,
    low:       +c.low,
    close:     +c.close,
    volume:    +c.volume,
    timestamp: c.timestamp
  }));
}
