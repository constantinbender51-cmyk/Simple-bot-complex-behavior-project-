// strategyEngine.js
import { GoogleGenerativeAI } from '@google/generative-ai';
import { loadContext } from './context.js';
import { log } from './logger.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export class StrategyEngine {
  constructor() {
    this.model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  }

  async generatePlan({ markPrice, position, balance, ohlc, intervalMinutes, context }) {
    const posSize = position ? (+position.size) * (position.side === 'long' ? 1 : -1) : 0;
    const openPnl = position ? (+position.upl || 0) : 0;
    const ctx     = context || (await loadContext());

    const prompt = buildPrompt({
      markPrice,
      posSize,
      openPnl,
      balance,
      ohlc,
      intervalMinutes,
      context: ctx
    });

    const res = await this.model.generateContent(prompt);
    const raw = res.response.text();
    log.info('🧠 AI RAW:', raw);           // print for debugging

    try {
      return JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}');
    } catch {
      return { side: null, size: 0, nextCtx: {}, intervalMinutes: 60, candleCount: 100, reason: 'parse error' };
    }
  }
}

/* ------------------------------------------------------------------ */
/* prompt builder                                                     */
/* ------------------------------------------------------------------ */
function buildPrompt({
  markPrice,
  posSize,
  openPnl,
  balance,
  ohlc,
  intervalMinutes,
  context
}) {
  const now = new Date().toISOString();
  const candles = ohlc.slice(-20); // last 20 for brevity

  return `
You are an advanced, self-tuning crypto strategist.
You run every few minutes inside a Railway container.

Current UTC: ${now}

Market snapshot:
- markPrice (USD) = ${markPrice}
- positionSize (BTC, signed) = ${posSize}
- unrealisedPnL (USD) = ${openPnl}
- availableMargin (USD) = ${balance}
- OHLC (last ${candles.length} candles, ${intervalMinutes}m) = ${JSON.stringify(candles)}

Memory (from last cycle):
- lastPlan = ${JSON.stringify(context.lastPlan || {})}
- closedPnLSeries (last 20) = ${JSON.stringify(context.closedPnLSeries?.slice(-20) || [])}
- hitRate = ${context.hitRate || 0}%
- avgSlippageBps = ${context.avgSlippageBps || 0}
- strategyParams = ${JSON.stringify(context.strategyParams || {})}

Rules & Tools:
1. You may ONLY call sendMarketOrder({ side, size })
   • side ∈ { "buy", "sell", null }  
   • size ≥ 0 (positive = long, negative = short, 0 = flatten)
   • max abs size ≤ availableMargin / markPrice * 10   (10× leverage cap)
2. You may choose next intervalMinutes and candleCount for the next cycle.
3. You may update your own internal parameters inside nextCtx.

Output exactly one JSON object:
{
  "side": "buy" | "sell" | null,
  "size": 0.0,
  "nextCtx": { /* your choice of hyper-params / stats */ },
  "intervalMinutes": 5,
  "candleCount": 400,
  "reason": "≤30 words"
}
`;
}
