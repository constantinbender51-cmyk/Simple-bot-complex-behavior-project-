// marketProxy.js
import KrakenFuturesApi from './krakenApi.js';
import { log } from './logger.js';

const PAIR = 'PF_XBTUSD';

export async function getMarketSnapshot() {
  const api = new KrakenFuturesApi(
    process.env.KRAKEN_API_KEY,
    process.env.KRAKEN_SECRET_KEY
  );

  try {
    const [tickers, positions, accounts, fills] = await Promise.all([
      api.getTickers(),
      api.getOpenPositions(),
      api.getAccounts(),
      api.getFills({ lastFillTime: Date.now() - 1000 * 60 * 60 * 24 }) // 24 h
    ]);

    const ticker   = tickers.tickers.find(t => t.symbol === PAIR);
    const position = positions.openPositions.find(p => p.symbol === PAIR) || null;
    const balance  = +accounts.accounts.find(a => a.currency === 'USD')?.balanceValue || 0;
    const markPx   = +ticker?.markPrice || 0;

    return {
      markPrice: markPx,
      position,               // null or { side: 'long' | 'short', size: '0.001' }
      balance,
      fills: fills.fills || []
    };
  } catch (err) {
    log.error('marketProxy failed:', err);
    throw err;
  }
}
