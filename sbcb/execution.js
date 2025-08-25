import KrakenFuturesApi from './krakenApi.js';

const api = new KrakenFuturesApi(
  process.env.KRAKEN_API_KEY,
  process.env.KRAKEN_SECRET_KEY
);

export async function sendMarketOrder({ pair, side, size }) {
  if (!size) return; // nothing to do
  return api.sendOrder({
    orderType: 'mkt',
    symbol: pair,
    side,
    size
  });
}
