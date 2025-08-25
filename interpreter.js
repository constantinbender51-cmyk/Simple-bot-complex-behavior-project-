import { saveContext } from './context.js';
import { executePlan } from './execution.js';
import { log } from './logger.js';

export async function runStrategy(strategy, market, ctx) {
  const { name, params } = strategy;

  let steps = [];
  switch (name) {
    case 'gridWithTrail':
      steps = buildGridTrail(market, params, ctx);
      break;
    case 'momentumBreak':
      steps = buildMomentum(market, params, ctx);
      break;
    default:
      steps = [{ type: 'wait', minutes: 1 }];
  }

  // store before execution
  ctx.lastPlan = { steps, strategy };
  await saveContext(ctx);

  await executePlan(steps, 'PF_XBTUSD');

  // after fills we’ll update context (PnL, hit-rate)
}
