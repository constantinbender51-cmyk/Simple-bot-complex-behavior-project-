// interpreter.js change 20:22
import { sendLimitOrder } from './execution.js';
import { saveContext } from './context.js';
import { log } from './logger.js';
import KrakenFuturesApi from './krakenApi.js';

const PAIR = 'PF_XBTUSD';
const MIN_TICK = 0.0001;

const api = new KrakenFuturesApi(
  process.env.KRAKEN_API_KEY,
  process.env.KRAKEN_SECRET_KEY
);

/**
 * Interprets the trading plan and executes the corresponding action.
 * It now fetches the most up-to-date market price just before placing the order.
 * @param {object} plan - The trading plan from the decision engine.
 * @param {string} plan.side - 'buy' or 'sell'.
 * @param {number} plan.size - The size of the order.
 * @param {number} plan.waitTime - Time to wait before the next cycle.
 * @param {number} plan.ohlcInterval - The OHLC interval for the next cycle.
 * @param {string} plan.reason - The reason for the action.
 */
export async function interpret(plan) {
  const { side, size, waitTime, ohlcInterval, reason } = plan;
  
  if (side && size !== 0) {
    // allow 1 tick of numerical tolerance
    const remainder = Math.abs((size / MIN_TICK) % 1);
    if (remainder > 1e-9 && Math.abs(remainder - 1) > 1e-9) {
      log.error(`❌ Invalid order size: ${size}. Must be a multiple of ${MIN_TICK}`);
      return;
    }

    // 📝 NEW: Fetch the latest market prices just before placing the order
    try {
      const tickers = await api.getTickers();
      const ticker = tickers.tickers.find(t => t.symbol === PAIR);

      if (!ticker) {
        log.error(`Could not get ticker data for pair: ${PAIR}. Order not placed.`);
        return;
      }
      
      const price = side === 'buy' ? +ticker.ask : +ticker.bid;

      // Now calling sendLimitOrder with the fresh price
      await sendLimitOrder({ pair: PAIR, side, size, price });

    } catch (e) {
      log.error(`Failed to fetch latest ticker data: ${e.message}`);
      return;
    }
  }

  if (waitTime > 0) {
    log.info(`⏳ Waiting ${waitTime} minutes.`);
    await new Promise(r => setTimeout(r, waitTime * 60_000));
  }

  await saveContext({ nextCtx: { ohlcInterval, reason } });
}
