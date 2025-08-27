// marketProxy.js
import KrakenFuturesApi from './krakenApi.js';
import { log } from './logger.js';

const PAIR = 'PF_XBTUSD';

const api = new KrakenFuturesApi(
  process.env.KRAKEN_API_KEY,
  process.env.KRAKEN_SECRET_KEY
);

export async function getMarketSnapshot() {
  try {
    const [tickers, positions, accounts, fills] = await Promise.all([
      api.getTickers(),
      api.getOpenPositions(),
      api.getAccounts(),
      api.getFills()
    ]);
    
    // 📝 FIX: Add a check for tickers and tickers.tickers to prevent the error.
    if (!tickers || !tickers.tickers || !Array.isArray(tickers.tickers)) {
      log.error('Failed to get ticker data from Kraken API. Received:', tickers);
      // Optionally, throw a more specific error or return default values.
      return {
        markPrice: 0,
        position: null,
        balance: 0,
        fills: []
      };
    }

    const ticker = tickers.tickers.find(t => t.symbol === PAIR);
    const position = positions.openPositions.find(p => p.symbol === PAIR) || null;
    const flexAccount = accounts.accounts?.flex;
    const balance = flexAccount ? +flexAccount.availableMargin : 0;
    const markPx = +ticker?.markPrice || 0;

    return {
      markPrice: markPx,
      position,
      balance,
      fills: fills.fills || []
    };
  } catch (err) {
    log.error('marketProxy failed:', err);
    throw err;
  }
}
