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
async function fetchOHLC(intervalMinutes, maxCandles = 400) {
  // clamp to 720 days max
  const maxSec = Math.min(maxCandles * intervalMinutes * 60, 720 * 86400);
  const since  = Math.floor(Date.now() / 1000 - maxSec);

  const url = 'https://api.kraken.com/0/public/OHLC';
  const params = { pair: 'XBTUSD', interval: intervalMinutes, since };

  console.log('🔍 OHLC request:', url, params);

  const { data } = await axios.get(url, { params });
  console.log('🔍 OHLC response:', JSON.stringify(data, null, 2));

  if (data.error?.length) throw new Error(data.error.join(', '));

  const key  = Object.keys(data.result).find(k => k !== 'last');
  const list = data.result[key] || [];
  console.log(`📊 received ${list.length} candles`);
  return list.map(o => ({
    date: new Date(o[0] * 1000).toISOString(),
    open: +o[1], high: +o[2], low: +o[3], close: +o[4], volume: +o[6]
  }));
}
