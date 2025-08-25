import KrakenFuturesApi from './krakenApi.js';

export async function getMarketSnapshot(pair) {
  const api = new KrakenFuturesApi(
    process.env.KRAKEN_API_KEY,
    process.env.KRAKEN_SECRET_KEY
  );

  const [tickers, positions, balance, fills] = await Promise.all([
    api.getTickers(),
    api.getOpenPositions(),
    api.getAccounts(),
    api.getFills({ lastFillTime: Date.now() - 1000 * 60 * 60 * 24 }) // 24 h
  ]);

  const ticker = tickers.tickers.find(t => t.symbol === pair);
  return {
    markPrice: +ticker.markPrice,
    position: positions.openPositions.find(p => p.symbol === pair) || null,
    balance: +balance.accounts.find(a => a.currency === 'USD').balanceValue,
    fills: fills.fills
  };
}
