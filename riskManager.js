// riskManager.js

import { log } from './logger.js';

export class RiskManager {
    constructor(config) {
        this.leverage = config.leverage || 10;
        this.marginBuffer = config.marginBuffer || 0.01;
    }

    /**
     * Calculates the position size based on the AI's trade plan.
     * The AI now provides the stop-loss and take-profit distances.
     * @param {object} marketData - Contains balance and last price.
     * @param {object} tradingSignal - The full trade plan from the AI.
     * @returns {object|null} The final trade parameters, or null if risk is invalid.
     */
    calculateTradeParameters(marketData, tradingSignal) {
        const { balance, ohlc } = marketData;
        const lastPrice = ohlc[ohlc.length - 1].close;

        if (!balance || balance <= 0) {
            log.error('[RISK] Invalid account balance.');
            return null;
        }

        // --- THE KEY CHANGE: We get SL/TP directly from the AI signal ---
        const { stop_loss_distance_in_usd, take_profit_distance_in_usd } = tradingSignal;

        if (!stop_loss_distance_in_usd || stop_loss_distance_in_usd <= 0) {
            log.warn('[RISK] AI provided an invalid stop-loss distance. Aborting trade.');
            return null;
        }
        if (!take_profit_distance_in_usd || take_profit_distance_in_usd <= 0) {
            log.warn('[RISK] AI provided an invalid take-profit distance. Aborting trade.');
            return null;
        }

        // --- Position Sizing (remains the same) ---
        const riskPerUnit = stop_loss_distance_in_usd;
        const totalCapitalToRisk = balance * 0.02; // Still risking 2% of capital per trade
        let sizeInUnits = totalCapitalToRisk / riskPerUnit;
        const positionValueUSD = sizeInUnits * lastPrice;
        const marginRequired = (positionValueUSD / this.leverage) * (1 + this.marginBuffer);

        if (marginRequired > balance) {
            log.warn(`[RISK] Insufficient funds. Required: $${marginRequired.toFixed(2)}, Available: $${balance.toFixed(2)}`);
            return null;
        }
        if (sizeInUnits < 0.0001) {
            log.warn(`[FAIL] Size = 0. Required: 0.0001`);
            return null;
        }

        // --- Final Trade Parameters ---
        const stopLossPrice = tradingSignal.signal === 'LONG' ? lastPrice - stop_loss_distance_in_usd : lastPrice + stop_loss_distance_in_usd;
        const takeProfitPrice = tradingSignal.signal === 'LONG' ? lastPrice + take_profit_distance_in_usd : lastPrice - take_profit_distance_in_usd;

        const tradeParams = {
            size: parseFloat(sizeInUnits.toFixed(4)),
            stopLoss: parseFloat(stopLossPrice.toFixed(2)),
            takeProfit: parseFloat(takeProfitPrice.toFixed(2)),
        };

        log.info(`[RISK] Final Trade Params: ${JSON.stringify(tradeParams, null, 2)}`);
        
        return tradeParams;
    }
}
