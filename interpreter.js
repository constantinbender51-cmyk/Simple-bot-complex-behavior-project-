// interpreter.js
import { sendMarketOrder } from './execution.js';
import { saveContext } from './context.js';
const PAIR = 'PF_XBTUSD';
const MIN_TICK = 0.0001;

export async function interpret(plan) {
  const { side, size, waitTime, ohlcInterval, reason } = plan;

  if (side && size !== 0) {
    if (size % MIN_TICK !== 0) {
      console.error(`❌ Invalid order size: ${size}. Must be a multiple of ${MIN_TICK}`);
      return; // Stop execution
    }
    await sendMarketOrder({ pair: PAIR, side, size });
  }
  if (waitTime > 0) {
    console.log(`⏳ waiting ${waitTime} min`);
    await new Promise(r => setTimeout(r, waitTime * 60_000));
  }
  await saveContext({ nextCtx: { ohlcInterval, reason } });
}
