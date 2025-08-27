//decision engine 
import { StrategyEngine } from './strategyEngine.js';
import { loadContext } from './context.js';
import { log } from './logger.js'; // 📝 Import the logger

export async function decidePlan({
  markPrice,
  position,
  balance,
  fills,
  ohlc,
  intervalMinutes,
  callsLeft
}) {
  const context = await loadContext();

  const engine = new StrategyEngine();
  const plan = await engine.generatePlan({
    markPrice,
    position,
    balance,
    fills,
    ohlc,
    intervalMinutes,
    context,
    callsLeft // Pass callsLeft to the engine
  });
  return plan;
}
