// marketProxy.js
import KrakenFuturesApi from './krakenApi.js';
import { log } from './logger.js';

const PAIR = 'PF_XBTUSD';

const api = new KrakenFuturesApi(
  process.env.KRAKEN_API_KEY,
  process.env.KRAKEN_SECRET_KEY
);

export async function getMarketSnapshot(lastFillTime, lastFetchTime) {
  try {
    const [tickers, positions, accounts, fills, events] = await Promise.all([
      api.getTickers(),
      api.getOpenPositions(),
      api.getAccounts(),
      api.getFills({ lastFillTime }),
      api.getPositionEvents({ since: lastFetchTime })
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
      fills: fills.fills || [],
      events: events.events || []
    };
  } catch (err) {
    log.error('marketProxy failed:', err);
    throw err;
  }
}
