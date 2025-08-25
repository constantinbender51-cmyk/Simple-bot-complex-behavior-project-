// execution.js
import KrakenFuturesApi from './krakenApi.js';
import { log } from './logger.js';

const api = new KrakenFuturesApi(
  process.env.KRAKEN_API_KEY,
  process.env.KRAKEN_SECRET_KEY
);

/**
 * Execute a plan synchronously (one step at a time).
 * @param {Object[]} steps  – array from decidePlan()
 * @param {string} pair     – e.g. 'PF_XBTUSD'
 * @returns {Promise<void>}
 */
export async function executePlan(steps, pair) {
  for (const step of steps) {
    switch (step.type) {
      case 'market': {
        const { side, size } = step;
        const sizeNum = Math.abs(parseFloat(size));
        if (!['buy', 'sell'].includes(side) || !sizeNum) {
          log.warn('Invalid market step:', step);
          return;
        }
        log.info(`Market ${side} ${sizeNum} ${pair}`);
        if (process.env.DRY_RUN !== 'true') {
          await api.sendOrder({
            orderType: 'mkt',
            symbol: pair,
            side,
            size: sizeNum.toFixed(8)
          });
        }
        break;
      }

      case 'wait': {
        const ms = (step.minutes || 0) * 60_000;
        log.info(`Waiting ${ms} ms`);
        await sleep(ms);
        break;
      }

      default:
        log.warn('Unknown step type:', step);
        return;
    }
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
