import { EMA, RSI, MACD, ATR } from 'technicalindicators';
import { log } from './logger.js';

/**
 * Calculates full series for all necessary technical indicators.
 * @param {Array<object>} ohlcData - Array of OHLC candles.
 * @returns {object|null} An object with all calculated indicator series, or null if data is insufficient.
 */
export function calculateIndicatorSeries(ohlcData) {
    if (ohlcData.length < 200) { // Still need a minimum warm-up period
        log.warn(`[INDICATORS] Insufficient data for calculation. Need 200 candles, have ${ohlcData.length}.`);
        return null;
    }

    const close = ohlcData.map(c => c.close);
    const high = ohlcData.map(c => c.high);
    const low = ohlcData.map(c => c.low);

    const indicatorSeries = {
        ema_50_series: EMA.calculate({ period: 50, values: close }),
        ema_200_series: EMA.calculate({ period: 200, values: close }),
        rsi_14_series: RSI.calculate({ period: 14, values: close }),
        macd_histogram_series: MACD.calculate({ values: close, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false }).map(m => m.histogram),
        atr_20_series: ATR.calculate({ high, low, close, period: 20 })
    };

    log.info(`[INDICATORS] Calculated full indicator series.`);
    return indicatorSeries;
}
