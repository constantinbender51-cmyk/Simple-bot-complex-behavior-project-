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

    // 2️⃣  default OHLC (30 daily candles) if missing
    let ohlc = snap.ohlc;
    if (!ohlc?.length) {
      ohlc = await fetchOHLC(1440, 30);
    }

    // 3️⃣  AI decides everything
    const plan = await decidePlan({
      ...snap,
      ohlc,
      intervalMinutes: 1440
    });

    // 4️⃣  execute single market order (or flatten)
    if (plan.side && plan.size !== 0) {
      await sendMarketOrder({ pair: PAIR, side: plan.side, size: Math.abs(plan.size) });
    }

    // 5️⃣  persist AI’s nextCtx + lastPlan
    await saveContext({ ...snap.context, ...plan.nextCtx, lastPlan: plan });

  } catch (err) {
    console.error('runOnce failed:', err);
  }
}
