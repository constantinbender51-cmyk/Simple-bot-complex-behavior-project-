// backtestExecutionHandler.js

import { log } from './logger.js';

// --- FIX: Added export statement ---
export class BacktestExecutionHandler {
    constructor(initialBalance) {
        this.balance = initialBalance;
        this.trades = [];
    }

    placeOrder({ signal, params, entryPrice, entryTime, reason }) {
        const trade = {
            entryTime, entryPrice, signal, reason,
            size: params.size,
            stopLoss: params.stopLoss,
            takeProfit: params.takeProfit,
            status: 'open',
            exitTime: null, exitPrice: null, pnl: 0,
        };
        if (params.stopLoss === 0 || params.takeProfit === 0) console.log(`trade initiated with parameters equal to zero`);
        this.trades.push(trade);
    }

    getOpenTrade() {
        return this.trades.find(t => t.status === 'open');
    }

    closeTrade(trade, exitPrice, exitTime) {
        const pnl = (exitPrice - trade.entryPrice) * trade.size * (trade.signal === 'LONG' ? 1 : -1);
        this.balance += pnl;
        trade.status = 'closed';
        trade.exitPrice = exitPrice;
        trade.exitTime = exitTime;
        trade.pnl = pnl;
        log.info(`[BACKTEST] P&L: $${pnl.toFixed(2)} | New Balance: $${this.balance.toFixed(2)}`);
    }

    getTrades() {
        return this.trades;
    }
}
