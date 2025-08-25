import { StrategyEngine } from './strategyEngine.js';
import { loadContext } from './context.js';

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
    apiCallLimitPerDay: callsLeft // Pass callsLeft to the engine
  });
  console.log('🔍 decidePlan ohlc length:', ohlc?.length);

  return plan;
}
