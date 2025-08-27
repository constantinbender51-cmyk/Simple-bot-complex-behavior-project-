// marketProxy.js - Update getMarketSnapshot function
import KrakenFuturesApi from './krakenApi.js';
import { PnLCalculator } from './pnlCalculator.js';
import { log } from './logger.js';

const PAIR = 'PF_XBTUSD';

const api = new KrakenFuturesApi(
  process.env.KRAKEN_API_KEY,
  process.env.KRAKEN_SECRET_KEY
);

const pnlCalculator = new PnLCalculator();

export async function getMarketSnapshot(lastPositionEventsFetch) {
  try {
    // Calculate PnL from new fills
    const newPnLData = await pnlCalculator.calculatePnL();
    const cumulativePnL = await pnlCalculator.getCumulativePnL();
    
    // Update cumulative PnL if we have new data
    if (newPnLData.tradeCount > 0) {
      await pnlCalculator.updateCumulativePnL(newPnLData);
    }

    const [tickers, positions, accounts] = await Promise.all([
      api.getTickers(),
      api.getOpenPositions(),
      api.getAccounts()
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
      pnl: {
        realizedPnL: cumulativePnL.realizedPnL,
        totalFees: cumulativePnL.totalFees,
        tradeCount: cumulativePnL.tradeCount,
        netPnL: cumulativePnL.netPnL,
        newTrades: newPnLData.tradeCount,
        newRealizedPnL: newPnLData.realizedPnL
      },
      timestamp: Date.now()
    };
  } catch (err) {
    log.error('marketProxy failed:', err);
    throw err;
  }
}
