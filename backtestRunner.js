// backtestRunner.js  –  cleaned, no AI post-backtest analysis
import fs from 'fs';
import { log } from './logger.js';
import { BacktestDataHandler } from './backtestDataHandler.js';
import { StrategyEngine } from './strategyEngine.js';
import { RiskManager } from './riskManager.js';
import { BacktestExecutionHandler } from './backtestExecutionHandler.js';

/* ------------------------------------------------------------------ */
/*  Utilities                                                         */
/* ------------------------------------------------------------------ */
function tsFromDate(dateStr) {
  return Math.floor(new Date(dateStr).getTime() / 1000);
}

function filterByDate(candles, start, end) {
  const startTs = tsFromDate(start);
  const endTs   = tsFromDate(end);
  return candles.filter(c => c.timestamp >= startTs && c.timestamp < endTs);
}

function calculateATR(ohlc, period = 14) {
  const tr = [];
  for (let i = 1; i < ohlc.length; i++) {
    const h  = ohlc[i].high;
    const l  = ohlc[i].low;
    const pc = ohlc[i - 1].close;
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const atrWindow = tr.slice(-period);
  return atrWindow.reduce((a, b) => a + b, 0) / atrWindow.length;
}

/* ------------------------------------------------------------------ */
/*  BacktestRunner                                                    */
/* ------------------------------------------------------------------ */
export class BacktestRunner {
  constructor(cfg) {
    this.cfg   = cfg;
    this.data  = new BacktestDataHandler(cfg.DATA_FILE_PATH);
    this.exec  = new BacktestExecutionHandler(cfg.INITIAL_BALANCE);
    this.strat = new StrategyEngine();
    this.risk  = new RiskManager({ leverage: 10, marginBuffer: 0.01 });
  }

  async run() { 
    let candles = this.data.getAllCandles();
    candles = filterByDate(candles, '2022-01-01', '2025-01-01');
    if (!candles || candles.length < this.cfg.WARMUP_PERIOD) {
      throw new Error('Not enough data for the warm-up period.');
    }
    console.log(`Backtesting ${candles.length} candles`);

    let apiCalls = 0;

    for (let i = this.cfg.WARMUP_PERIOD; i < candles.length; i++) {
      const candle = candles[i];
      const window = candles.slice(i - this.cfg.DATA_WINDOW_SIZE, i);

      if (this.exec.getOpenTrade()) this._checkExit(candle);

      if (!this.exec.getOpenTrade()) { // && this._hasSignal({ ohlc: window })) {
        if (apiCalls >= this.cfg.MAX_API_CALLS) {
          log.info('[BACKTEST] Reached the API call limit. Ending simulation.');
          break;
        }
        apiCalls++;
        console.log(`[CANDLE ${i-this.cfg.WARMUP_PERIOD} of ${candles.length-this.cfg.WARMUP_PERIOD}]`);;
        
        const date = new Date(candle.timestamp * 1000).toISOString();
        log.info(`[CANDLE] ${date}`);
        await this._handleSignal({ ohlc: window }, candle, apiCalls);
      }
    }
    this._printSummary(apiCalls);
  }

  /* ------------------------ Private ------------------------ */
  _checkExit(candle) {
    const t = this.exec.getOpenTrade();
    let exitPrice  = null;
    let exitReason = '';

    if (t.signal === 'LONG') {
      if (candle.low  <= t.stopLoss)   { exitPrice = t.stopLoss; exitReason = 'Stop-Loss'; }
      if (candle.high >= t.takeProfit) { exitPrice = t.takeProfit; exitReason = 'Take-Profit'; }
    } else if (t.signal === 'SHORT') {
      if (candle.high >= t.stopLoss)   { exitPrice = t.stopLoss; exitReason = 'Stop-Loss'; }
      if (candle.low  <= t.takeProfit) { exitPrice = t.takeProfit; exitReason = 'Take-Profit'; }
    }

    if (exitPrice) {
      const date = new Date(candle.timestamp * 1000).toISOString();
      this.exec.closeTrade(t, exitPrice, candle.timestamp);

      // persist updated trades
      const updated = this.exec.getTrades();
      fs.writeFileSync('./trades.json', JSON.stringify(updated, null, 2));
    }
  }

  _hasSignal(market) {
    const PERIOD = 21;
    if (market.ohlc.length < PERIOD + 1) return false;

    const cur   = market.ohlc[market.ohlc.length - 1];
    const prev  = market.ohlc.slice(-PERIOD - 1, -1);

    const hh  = Math.max(...prev.map(c => c.high));
    const ll  = Math.min(...prev.map(c => c.low));
    const mid = (hh + ll) / 2;

    const buffer  = cur.close * 0.0015;
    const bullish = cur.high > mid + buffer;
    const bearish = cur.low  < mid - buffer;

    if (bullish || bearish) {
      const dir  = bullish ? 'Bullish' : 'Bearish';
      const date = new Date(cur.timestamp * 1000).toISOString();
    }
    return bullish || bearish;
  }

  async _handleSignal(market, candle, apiCalls) {
    log.info(`[BACKTEST] [Call #${apiCalls}/${this.cfg.MAX_API_CALLS}]`);
    const t0 = Date.now();

    const sig = await this.strat.generateSignal(market);
    console.log(sig);
    if (sig.signal !== 'HOLD' && sig.confidence >= this.cfg.MINIMUM_CONFIDENCE_THRESHOLD) {
      const params = this.risk.calculateTradeParameters(
        { ...market, balance: this.exec.balance },
        sig
      );
      if (params?.size > 0) {
        this.exec.placeOrder({
          signal: sig.signal,
          params,
          entryPrice: candle.close,
          entryTime: candle.timestamp,
          reason: sig.reason
        });
      }
    }

    const elapsed = Date.now() - t0;
    const delay   = this.cfg.MIN_SECONDS_BETWEEN_CALLS * 1000 - elapsed;
    console.log(`WAITING ${delay/1000}s...`);
    if (delay > 0) await new Promise(r => setTimeout(r, delay));
  }

  _printSummary(apiCalls) {
    log.info('--- BACKTEST COMPLETE ---');
    const trades   = this.exec.getTrades();
    const closed   = trades.filter(t => t.exitTime);
    const total    = trades.length;
    const wins     = trades.filter(t => t.pnl > 0).length;
    const winRate  = total ? (wins / total) * 100 : 0;
    const pnl      = this.exec.balance - this.cfg.INITIAL_BALANCE;

    console.log(`Analyzed crossover events: ${apiCalls}`);
    console.log(`Initial Balance : $${this.cfg.INITIAL_BALANCE.toFixed(2)}`);
    console.log(`Final Balance   : $${this.exec.balance.toFixed(2)}`);
    console.log(`Total P&L       : $${pnl.toFixed(2)}`);
    console.log(`Total Trades    : ${total}`);
    console.log(`Winning Trades  : ${wins}`);
    console.log(`Losing Trades   : ${total - wins}`);
    console.log(`Win Rate        : ${winRate.toFixed(2)}%`);
    console.log('------------------------------------\n');

    fs.writeFileSync('./trades.json', JSON.stringify(trades, null, 2));
  }
}
