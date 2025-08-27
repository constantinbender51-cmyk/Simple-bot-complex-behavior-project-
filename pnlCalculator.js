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
  }

  /**
   * Calculate PnL from all fills since last processing
   */
  async calculatePnL() {
    try {
      // Get last processed fill time
      const lastProcessedTime = await kv.get(this.lastProcessedFillTimeKey) || 0;
      
      // Fetch new fills since last processing
      const fillsResponse = await krakenApi.getFills(lastProcessedTime ? parseInt(lastProcessedTime) : null);
      const fills = fillsResponse.fills || [];
      
      if (fills.length === 0) {
        return {
          realizedPnL: 0,
          totalFees: 0,
          tradeCount: 0,
          newFills: []
        };
      }

      // Process fills and calculate PnL
      let realizedPnL = 0;
      let totalFees = 0;
      let latestFillTime = lastProcessedTime;

      // Group fills by order to calculate complete trade PnL
      const trades = {};
      
      fills.forEach(fill => {
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
        
        // Track latest fill time
        const fillTime = new Date(fill.fillTime).getTime();
        if (fillTime > latestFillTime) {
          latestFillTime = fillTime;
        }
      });

      // Calculate PnL for each complete trade
      Object.values(trades).forEach(trade => {
        if (trade.fills.length >= 2) { // Complete trade (entry + exit)
          const entryFill = trade.fills.find(f => f.fillType === 'fill');
          const exitFill = trade.fills.find(f => f.fillType === 'fill' && f !== entryFill);
          
          if (entryFill && exitFill) {
            const entryPrice = parseFloat(entryFill.price);
            const exitPrice = parseFloat(exitFill.price);
            const quantity = parseFloat(entryFill.size);
            
            let tradePnL;
            if (trade.side === 'buy') {
              tradePnL = (exitPrice - entryPrice) * quantity;
            } else {
              tradePnL = (entryPrice - exitPrice) * quantity;
            }
            
            realizedPnL += tradePnL;
            totalFees += trade.totalFees;
          }
        }
      });

      // Update last processed time
      if (latestFillTime > lastProcessedTime) {
        await kv.set(this.lastProcessedFillTimeKey, latestFillTime.toString());
      }

      return {
        realizedPnL,
        totalFees,
        tradeCount: Object.keys(trades).length,
        newFills: fills,
        netPnL: realizedPnL - totalFees
      };

    } catch (error) {
      log.error('Error calculating PnL:', error);
      throw error;
    }
  }

  /**
   * Get cumulative PnL statistics
   */
  async getCumulativePnL() {
    const cumulativeKey = 'cumulative_pnl';
    const cumulativeData = await kv.get(cumulativeKey) || {
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

  /**
   * Update cumulative PnL with new data
   */
  async updateCumulativePnL(newPnLData) {
    const cumulativeKey = 'cumulative_pnl';
    const currentData = await this.getCumulativePnL();
    
    const updatedData = {
      totalRealizedPnL: currentData.realizedPnL + newPnLData.realizedPnL,
      totalFees: currentData.totalFees + newPnLData.totalFees,
      totalTrades: currentData.tradeCount + newPnLData.tradeCount,
      startTime: currentData.startTime
    };

    await kv.set(cumulativeKey, updatedData);
    return updatedData;
  }
}

export default PnLCalculator;
