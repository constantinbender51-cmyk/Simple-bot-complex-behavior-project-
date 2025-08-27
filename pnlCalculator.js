// pnlCalculator.js
import { kv } from './redis.js';
import { log } from './logger.js';
import KrakenFuturesApi from './krakenApi.js';

const krakenApi = new KrakenFuturesApi(
  process.env.KRAKEN_API_KEY,
  process.env.KRAKEN_SECRET_KEY
);

export class PnLCalculator {
  constructor() {
    this.lastProcessedFillTimeKey = 'last_processed_fill_time';
    this.cumulativeKey = 'cumulative_pnl';
  }

  async getLastProcessedFillTime() {
    return await kv.get(this.lastProcessedFillTimeKey) || 0;
  }

  /**
   * Filter and calculate PnL from a list of all fills
   * @param {Array<Object>} allFills - The entire list of fills from the API.
   */
  async calculateAndSavePnL(allFills) {
    const lastProcessedTime = await this.getLastProcessedFillTime();
    
    // Filter the fills that have not been processed yet
    const newFills = allFills.filter(fill => new Date(fill.fillTime).getTime() > lastProcessedTime);
    
    if (newFills.length === 0) {
      return {
        realizedPnL: 0,
        totalFees: 0,
        tradeCount: 0,
        newFills: []
      };
    }
    
    let realizedPnL = 0;
    let totalFees = 0;
    let latestFillTime = lastProcessedTime;

    const trades = {};
    
    newFills.forEach(fill => {
      const orderId = fill.orderId;
      if (!trades[orderId]) {
        trades[orderId] = {
          symbol: fill.symbol,
          side: fill.side,
          fills: [],
          totalQuantity: 0,
          totalCost: 0,
          totalFees: 0
        };
      }
      
      trades[orderId].fills.push(fill);
      trades[orderId].totalQuantity += parseFloat(fill.size);
      trades[orderId].totalCost += parseFloat(fill.size) * parseFloat(fill.price);
      trades[orderId].totalFees += parseFloat(fill.fee) || 0;
      
      const fillTime = new Date(fill.fillTime).getTime();
      if (fillTime > latestFillTime) {
        latestFillTime = fillTime;
      }
    });

    Object.values(trades).forEach(trade => {
      if (Math.abs(trade.totalQuantity) < 0.0000001) {
        const entryPrice = trade.totalCost / trade.totalQuantity;
        const exitFill = trade.fills[trade.fills.length - 1];
        const exitPrice = parseFloat(exitFill.price);
        const quantity = parseFloat(trade.fills[0].size);
        
        let tradePnL;
        if (trade.side === 'buy') {
          tradePnL = (exitPrice - entryPrice) * quantity;
        } else {
          tradePnL = (entryPrice - exitPrice) * quantity;
        }
        
        realizedPnL += tradePnL;
        totalFees += trade.totalFees;
      }
    });

    if (latestFillTime > lastProcessedTime) {
      await kv.set(this.lastProcessedFillTimeKey, latestFillTime.toString());
    }

    // Update cumulative PnL with new data
    const currentData = await this.getCumulativePnL();
    const updatedData = {
      totalRealizedPnL: currentData.realizedPnL + realizedPnL,
      totalFees: currentData.totalFees + totalFees,
      totalTrades: currentData.tradeCount + Object.keys(trades).length,
      startTime: currentData.startTime
    };
    await kv.set(this.cumulativeKey, updatedData);

    return {
      realizedPnL,
      totalFees,
      tradeCount: Object.keys(trades).length,
      newFills: newFills,
      netPnL: realizedPnL - totalFees
    };
  }

  /**
   * Get cumulative PnL statistics
   */
  async getCumulativePnL() {
    const cumulativeData = await kv.get(this.cumulativeKey) || {
      totalRealizedPnL: 0,
      totalFees: 0,
      totalTrades: 0,
      startTime: Date.now()
    };

    return {
      realizedPnL: cumulativeData.totalRealizedPnL,
      totalFees: cumulativeData.totalFees,
      tradeCount: cumulativeData.totalTrades,
      netPnL: cumulativeData.totalRealizedPnL - cumulativeData.totalFees,
      startTime: cumulativeData.startTime
    };
  }
}

export default PnLCalculator;
