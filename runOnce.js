// runOnce.js
import { getMarketSnapshot } from './marketProxy.js';
import { decidePlan }        from './decisionEngine.js';   // wraps StrategyEngine
import { sendMarketOrder }   from './execution.js';
import { saveContext }       from './context.js';
import KrakenFuturesApi from './krakenApi.js';
import axios from 'axios';

const SPOT_URL = 'https://api.kraken.com/0/public/OHLC';

// inside runOnce.js, right after imports
const test = await new KrakenFuturesApi(
  process.env.KRAKEN_API_KEY,
  process.env.KRAKEN_SECRET_KEY
).getHistory({
  symbol: 'PF_XBTUSD',
  resolution: 1440,
  from: Math.floor(Date.now()/1000 - 86400*30)   // 30 days ago
});
console.log('✅ OHLC test:', test.history?.length || 0, 'candles');


const PAIR = 'PF_XBTUSD';

export async function runOnce() {
  try {
    // 1️⃣ fetch snapshot (no OHLC here)
    const snap = await getMarketSnapshot(PAIR);

    // 2️⃣ always fetch 30 daily candles
    const ohlc = await fetchOHLC(1440, 30);

    // 3️⃣ AI decides everything
    const plan = await decidePlan({
      markPrice: snap.markPrice,
      position: snap.position,
      balance: snap.balance,
      fills: snap.fills,
      ohlc,
      intervalMinutes: 1440
    });

    // 4️⃣ execute single market order
    if (plan.side && plan.size !== 0) {
      await sendMarketOrder({ pair: PAIR, side: plan.side, size: Math.abs(plan.size) });
    }

    // 5️⃣ persist context
    await saveContext({ ...snap.context, ...plan.nextCtx, lastPlan: plan });
  } catch (err) {
    console.error('runOnce failed:', err);
  }
}
/* ------------------------------------------------------------------ */
/* helper – fetch OHLC                                                */
/* ------------------------------------------------------------------ */
async function fetchOHLC(intervalMinutes, candleCount) {
  const now   = Date.now();
  const since = Math.floor((now - intervalMinutes * 60_000 * candleCount) / 1000);

  const { data } = await axios.get(SPOT_URL, {
    params: { pair: 'XBTUSD', interval: intervalMinutes, since }
  });
  if (data.error?.length) throw new Error(data.error.join(', '));

  const key = Object.keys(data.result).find(k => k !== 'last');
  return (data.result[key] || []).map(o => ({
    date: new Date(o[0] * 1000).toISOString(),
    open: +o[1], high: +o[2], low: +o[3], close: +o[4], volume: +o[6]
  }));
}
