import { StrategyEngine } from './strategyEngine.js';

export async function decideDesiredPosition(marketSnapshot) {
  // reuse the LLM prompt already in StrategyEngine, but new schema
  const engine = new StrategyEngine();
  const signal = await engine.generateSignal(marketSnapshot);
  return {
    desiredPositionSize: signal.desiredPositionSize, // e.g. +0.0042
    reason: signal.reason
  };
}
