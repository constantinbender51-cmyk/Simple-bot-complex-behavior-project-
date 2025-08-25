// strategyEngine.js
import { GoogleGenerativeAI } from '@google/generative-ai';
import { log } from './logger.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export class StrategyEngine {
  constructor() {
    this.model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  }

  async generatePlan(snapshot) {
    const prompt = buildPrompt(snapshot);
    const res    = await this.model.generateContent(prompt);
    const raw    = res.response.text();

    try {
      return JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}');
    } catch {
      return { steps: [], reason: 'parse error', ohlcInterval: 60 };
    }
  }
}

/* -------------------------------------------------------------- */
/* prompt builder                                                 */
/* -------------------------------------------------------------- */
function buildPrompt({
  markPrice,
  position,
  balance,
  fills
}) {
  const posSize = position ? (+position.size) * (position.side === 'long' ? 1 : -1) : 0;
  const openPnl = position ? (+position.upl || 0) : 0;

  return `
You are an advanced crypto strategist running every few minutes.
You can only emit ONE JSON plan per invocation.

The exchange gives you:
- current markPrice = ${markPrice}
- positionSize (BTC, signed) = ${posSize}
- unrealized P&L (USD) = ${openPnl}
- available balance (USD) = ${balance}
- last 50 fills = ${JSON.stringify(fills.slice(-50))}

Allowed tools:
1. request OHLC in intervals [1,5,60,240,1440] minutes
2. issue market orders with exact BTC size (signed)
3. wait (no action)

Output JSON plan:
{
  "ohlcInterval": 5,          // OR null to keep current
  "steps": [
    { "type": "market", "side": "buy", "size": 0.001 },
    { "type": "wait", "minutes": 5 },
    { "type": "market", "side": "sell", "size": 0.002 }
  ],
  "reason": "concise ≤20 words"
}

Constraints:
- Do NOT exceed 10× leverage (max abs size ≤ balance / markPrice * 10)
- Provide at least one step or explicit "steps":[] with reason "hold".
- Never output extra commentary outside JSON.
`;
}
