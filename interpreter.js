// interpreter.js
import { sendMarketOrder } from './execution.js';
import { saveContext } from './context.js';
import { log } from './logger.js'; // 📝 Import the logger
const PAIR = 'PF_XBTUSD';
const MIN_TICK = 0.0001;

export async function interpret(plan) {
  const { side, size, waitTime, ohlcInterval, reason } = plan;
  
  if (side && size !== 0) {
    // allow 1 tick of numerical tolerance
    const remainder = Math.abs((size / MIN_TICK) % 1);
    if (remainder > 1e-9 && Math.abs(remainder - 1) > 1e-9) {
      console.error(`❌ Invalid order size: ${size}. Must be a multiple of ${MIN_TICK}`);
      return;
    }
    await sendMarketOrder({ pair: PAIR, side, size });
  }

  if (waitTime > 0) {
    console.log(`⏳ waiting ${waitTime} min`);
    await new Promise(r => setTimeout(r, waitTime * 60_000));
  }

  await saveContext({ nextCtx: { ohlcInterval, reason } });
}
