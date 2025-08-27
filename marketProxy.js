// marketProxy.js
import KrakenFuturesApi from './krakenApi.js';
import { log } from './logger.js';

const PAIR = 'PF_XBTUSD';

const api = new KrakenFuturesApi(
  process.env.KRAKEN_API_KEY,
  process.env.KRAKEN_SECRET_KEY
);

/**
 * Fetches a snapshot of the current market data and new position events.
 * @param {number} lastPositionEventsFetch - The timestamp in milliseconds of the last event fetch.
 * @returns {object} A market data snapshot including new fills.
 */
export async function getMarketSnapshot(lastPositionEventsFetch) {
  try {
    // The Kraken API expects a `lastFillTime` parameter, which we can provide
    // directly from our `lastPositionEventsFetch` context value.
    const [tickers, positions, accounts, fills] = await Promise.all([
      api.getTickers(),
      api.getOpenPositions(),
      api.getAccounts(),
      api.getFills({ lastFillTime: lastPositionEventsFetch })
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
