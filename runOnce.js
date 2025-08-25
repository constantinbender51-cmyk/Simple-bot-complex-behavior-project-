// runOnce.js
import { getMarketSnapshot } from './marketProxy.js';
import { decidePlan }        from './decisionEngine.js';
import { interpret }         from './interpreter.js';
import { saveContext }       from './context.js';
import KrakenFuturesApi      from './krakenApi.js';

const PAIR = 'PF_XBTUSD';

async function fetchOHLC(intervalMinutes, count) {
  const api = new KrakenFuturesApi(
    process.env.KRAKEN_API_KEY,
    process.env.KRAKEN_SECRET_KEY
  );
  const since = Math.floor(Date.now() / 1000 - intervalMinutes * 60 * count);
  return api.fetchKrakenData({ pair: 'XBTUSD', interval: intervalMinutes, since });
}

export async function runOnce() {
  try {
    const keyToday = `calls_${new Date().toISOString().slice(0,10)}`;
    let callsSoFar = +(await KV.get(keyToday)) || 0;
    const limitPerDay = 500;
    const callsLeft   = limitPerDay - callsSoFar;
    
    const snap = await getMarketSnapshot(PAIR);
    const ctx  = await JSON.parse((await import('./context.js')).loadContext() || '{}');
    const ohlc = await fetchOHLC(ctx.ohlcInterval || 5, 400);

    const plan = await decidePlan({
  markPrice: snap.markPrice,
  position:  snap.position,
  balance:   snap.balance,
  ohlc,
  callsLeft
});

    await interpret(plan);
    await KV.set(keyToday, callsSoFar + 1);
  } catch (e) {
    console.error('runOnce failed:', e);
  }
}
