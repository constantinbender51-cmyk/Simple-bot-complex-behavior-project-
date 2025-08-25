import { kv } from './redis.js';
const KEY = 'bot_context';

export async function loadContext() {
  const raw = await kv.get(KEY);
  return raw ? JSON.parse(raw) : defaultContext();
}

export async function saveContext(ctx) {
  await kv.set(KEY, JSON.stringify(ctx));
}

function defaultContext() {
  return {
    lastPlan: null,
    lastReason: '',
    closedPnLSeries: [],      // last 50 realised PnLs
    hitRate: 0,              // % of plans that reached intended side
    avgSlippageBps: 0,
    strategyParams: { gridLevels: 5, trailPct: 0.3 }
  };
}
