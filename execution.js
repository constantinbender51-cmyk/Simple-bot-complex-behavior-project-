// execution.js
import KrakenFuturesApi from './krakenApi.js';

const api = new KrakenFuturesApi(
  process.env.KRAKEN_API_KEY,
  process.env.KRAKEN_SECRET_KEY
);

export async function sendMarketOrder({ pair, side, size }) {
  if (process.env.DRY_RUN === 'true') {
    console.log(`DRY-RUN: ${side} ${size} ${pair}`);
    return;
  }
  return api.sendOrder({
    orderType: 'mkt',
    symbol: pair,
    side,
    size: size.toFixed(8)
  });
}
