// execution.js
import KrakenFuturesApi from './krakenApi.js';
import { log } from './logger.js'; // 📝 Import the logger

const api = new KrakenFuturesApi(
  process.env.KRAKEN_API_KEY,
  process.env.KRAKEN_SECRET_KEY
);

/**
 * Sends a limit order that is intended to fill immediately.
 * The price must be set aggressively (e.g., for a buy, price >= best ask).
 * @param {object} params
 * @param {string} params.pair - The trading pair (e.g., 'PF_XBTUSD').
 * @param {string} params.side - 'buy' or 'sell'.
 * @param {number} params.size - The size of the order in base currency.
 * @param {number} params.price - The limit price for the order.
 */
export async function sendLimitOrder({ pair, side, size, price }) {
  // Ensure a price is provided for the limit order
  if (typeof price !== 'number' || isNaN(price)) {
    log.error(`[sendLimitOrder] A valid price is required for a limit order. Received: ${price}`);
    return;
  }

  if (process.env.DRY_RUN === 'true') {
    log.info(`DRY-RUN: ${side} ${size.toFixed(4)} ${pair} @ ${price.toFixed(2)}`);
    return;
  }

  // The order type is now 'lmt' instead of 'mkt'
  return api.sendOrder({
    orderType: 'lmt',
    symbol: pair,
    side,
    size: size.toFixed(4),
    limitPrice: price.toFixed(0) // Pass the limit price
  });
}
