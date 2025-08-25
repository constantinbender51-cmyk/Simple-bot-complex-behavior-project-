// runOnce.js
import { getMarketSnapshot } from './marketProxy.js';
import { decidePlan }        from './decisionEngine.js';   // wraps StrategyEngine
import { sendMarketOrder }   from './execution.js';
import { saveContext }       from './context.js';

const PAIR = 'PF_XBTUSD';

export async function runOnce() {
  try {
    // 1️⃣  fetch snapshot
    const snap = await getMarketSnapshot(PAIR);

    // 2️⃣  AI decides everything (side, size, nextCtx, interval, count)
    const plan = await decidePlan({
      ...snap,
      ohlc: snap.ohlc,           // latest candles already in snapshot
      intervalMinutes: snap.intervalMinutes || 60
    });

    // 3️⃣  execute the single market order (or flatten)
    if (plan.side && plan.size !== 0) {
      await sendMarketOrder({ pair: PAIR, side: plan.side, size: Math.abs(plan.size) });
    }

    // 4️⃣  persist AI’s nextCtx + lastPlan
    await saveContext({ ...snap.context, ...plan.nextCtx, lastPlan: plan });

  } catch (err) {
    console.error('runOnce failed:', err);
  }
}
