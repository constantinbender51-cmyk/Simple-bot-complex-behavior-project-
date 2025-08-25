import 'dotenv/config';
import { createClient } from 'redis';
import { marketApi } from './marketApi.js';
import { think } from './geminiApi.js';

const KV   = createClient({ url: process.env.REDIS_URL });
await KV.connect();
const PAIR = 'XBTUSD';

async function runOnce() {
  try {
    const [ctx, ohlc, { price }] = await Promise.all([
      JSON.parse(await KV.get('ctx') || '{}'),
      marketApi.ohlc(PAIR),
      marketApi.ticker(PAIR)
    ]);
    const plan = await think({ price, margin: 0, position: null, ohlc, ctx });
    if (plan.side && plan.size !== 0) {
      console.log(`EXEC ${plan.side} ${plan.size}`);
      // TODO: real order via Kraken Futures
    }
    await KV.set('ctx', JSON.stringify({ ...ctx, ...plan.nextCtx, lastPlan: plan }));
  } catch (e) {
    console.error(e);
  }
}
runOnce();
