// marketProxy.js
import KrakenFuturesApi from './krakenApi.js';
import { log } from './logger.js';

const PAIR = 'PF_XBTUSD';

const api = new KrakenFuturesApi(
  process.env.KRAKEN_API_KEY,
  process.env.KRAKEN_SECRET_KEY
);

/**
 * Fetches a snapshot of the current market data and all fills.
 * @returns {object} A market data snapshot including new fills.
 */
export async function getMarketSnapshot() {
  try {
    // Calling getFills without the lastFillTime parameter to avoid the API error.
    const [tickers, positions, accounts, fills] = await Promise.all([
      api.getTickers(),
      api.getOpenPositions(),
      api.getAccounts(),
      api.getFills()
    ]);

    const ticker = tickers.tickers.find(t => t.symbol === PAIR);
    const position = positions.openPositions.find(p => p.symbol === PAIR) || null;
    const flexAccount = accounts.accounts?.flex;
    const balance = flexAccount ? +flexAccount.availableMargin : 0;
    const markPx = +ticker?.markPrice || 0;

    return {
      markPrice: markPx,
      position,
      balance,
      // Use fills.fills, with a fallback to an empty array
      fills: fills.fills || []
    };
  } catch (err) {
    log.error('marketProxy failed:', err);
    throw err;
  }
}
