// marketProxy.js
import KrakenFuturesApi from './krakenApi.js';
import { log } from './logger.js';

const PAIR = 'PF_XBTUSD';

const api = new KrakenFuturesApi(
  process.env.KRAKEN_API_KEY,
  process.env.KRAKEN_SECRET_KEY
);

/**
 * Fetches a snapshot of the current market data and PnL information.
 * @param {number} lastFetchTimestamp - The timestamp in milliseconds of the last fetch.
 * @returns {object} A market data snapshot with PnL information.
 */
export async function getMarketSnapshot(lastFetchTimestamp) {
  try {
    const sinceInSeconds = lastFetchTimestamp ? Math.floor(lastFetchTimestamp / 1000) : undefined;

    const [tickers, positions, accounts, pnl] = await Promise.all([
      api.getTickers(),
      api.getOpenPositions(),
      api.getAccounts(),
      api.calculateProfitAndLoss({ since: sinceInSeconds })
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
      pnl, // Now contains PnL information instead of events
      timestamp: Date.now()
    };
  } catch (err) {
    log.error('marketProxy failed:', err);
    throw err;
  }
}
