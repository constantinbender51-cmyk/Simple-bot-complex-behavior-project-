// execution.js
import KrakenFuturesApi from './krakenApi.js';
import { log } from './logger.js'; // 📝 Import the logger

const api = new KrakenFuturesApi(
  process.env.KRAKEN_API_KEY,
  process.env.KRAKEN_SECRET_KEY
);

export async function sendMarketOrder({ pair, side, size }) {
  // 📝 LOGGING: Log the parameters of the order before sending.
  log.info(`✅ [execution] Attempting to send order: side=${side}, size=${size}, pair=${pair}`);
  
  if (process.env.DRY_RUN === 'true') {
    console.log(`DRY-RUN: ${side} ${size} ${pair}`);
    return;
  }
  return api.sendOrder({
    orderType: 'mkt',
    symbol: pair,
    side,
    size: size.toFixed(4)
  });
}
