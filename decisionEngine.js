// decisionEngine.js
import { StrategyEngine } from './strategyEngine.js'; // will be upgraded below
import { log } from './logger.js';

export async function decidePlan(marketSnapshot) {
  // 1️⃣  Ask the AI what it wants
  const engine = new StrategyEngine();
  const plan   = await engine.generatePlan(marketSnapshot);

  // 2️⃣  Validate & return
  if (!Array.isArray(plan.steps)) plan.steps = [];
  return plan;
}
