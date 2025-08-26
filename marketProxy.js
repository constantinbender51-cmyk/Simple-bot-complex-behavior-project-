// At the top, ensure the `api` object is passed in or loaded.
// The current setup uses a global-like variable, so you'll need to modify it
// to accept an injected dependency. The easiest way is to modify `runOnce`
// and pass `krakenApi` into `getMarketSnapshot`.

// marketProxy.js
import { log } from './logger.js';

const PAIR = 'PF_XBTUSD';

/**
 * Fetches a snapshot of the current market data and new position events.
 * The 'since' parameter is converted to a Unix timestamp (seconds)
 * to ensure compatibility with the Kraken API.
 * @param {object} api - The Kraken API instance (real or simulated).
 * @param {number} lastPositionEventsFetch - The timestamp in milliseconds of the last event fetch.
 * @returns {object} A market data snapshot.
 */
export async function getMarketSnapshot(api, lastPositionEventsFetch) {
  try {
    const sinceInSeconds = lastPositionEventsFetch ? Math.floor(lastPositionEventsFetch / 1000) : undefined;
    
    const [tickers, positions, accounts, events] = await Promise.all([
      api.getTickers(),
      api.getOpenPositions(),
      api.getAccounts(),
      api.getPositionEvents({ since: sinceInSeconds })
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
      events: events.elements || []
    };
  } catch (err) {
    log.error('marketProxy failed:', err);
    throw err;
  }
}
