import { getMarketSnapshot } from './marketProxy.js';
import { decideDesiredPosition } from './decisionEngine.js';
import { sendMarketOrder } from './execution.js';
import { log } from './logger.js';

const PAIR = 'PF_XBTUSD';

export async function runOnce() {
  try {
    const m = await getMarketSnapshot(PAIR);

    const currentSize = m.position ? Math.abs(+m.position.size) : 0;
    const currentSide = m.position ? (m.position.side === 'long' ? 'buy' : 'sell') : null;

    const { desiredPositionSize, reason } = await decideDesiredPosition({
      ...m,
      ohlc: /* fetch last 720 1-h candles here */
    });

    const delta = desiredPositionSize - (currentSide === 'buy' ? currentSize : -currentSize);

    if (Math.abs(delta) < 1e-8) {
      log.info('No change needed.');
      return;
    }

    const side   = delta > 0 ? 'buy' : 'sell';
    const size   = Math.abs(delta).toFixed(8); // Kraken wants string

    log.info(`Action: ${side} ${size} ${PAIR} – ${reason}`);
    await sendMarketOrder({ pair: PAIR, side, size });

  } catch (e) {
    log.error('runOnce failed', e);
  }
}
