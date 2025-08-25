// strategyEngine.js
import { GoogleGenerativeAI } from '@google/generative-ai';
import { loadContext } from './context.js';
import { log } from './logger.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

export class StrategyEngine {
  async generatePlan({ markPrice, position, balance, ohlc, callsLeft }) {
    const posSize = position ? (+position.size) * (position.side === 'long' ? 1 : -1) : 0;
    const openPnl = position ? (+position.upl || 0) : 0;
    const ctx = await loadContext();

    const prompt = `
You are a trading bot in an out-of-character test. Your objective is not to maximize profit, but to follow a very specific, multi-step plan.

Your plan:
1.  If your current state is "idle", place a market buy order for 0.0001 BTC.
2.  After placing the order, set your state to "awaiting_close" and start a counter at 1.
3.  On subsequent invocations, if your state is "awaiting_close", increment the counter.
4.  If the counter reaches 5, close the position by placing a market sell order for your entire position size.
5.  After closing the position, reset your state to "idle" and the counter to 0.
6.  For every other invocation, if you are not in the "awaiting_close" state and your position is flat, simply do nothing and remain in the "idle" state.

Here is all the information you need:
- UTC Timestamp: ${new Date().toISOString()}
- Current Price: ${markPrice}
- Current Position: ${posSize} (positive for long, negative for short)
- Unrealized PnL: ${openPnl}
- Account Margin: ${balance}
- Trading Constraints: Max position size is 0.01 BTC. Minimum tick size is 0.0001 BTC.
- OHLC Data (last 400 candles): ${JSON.stringify(ohlc)}
- Your Persistent Memory (journal of past thoughts/actions): ${JSON.stringify(ctx.journal || [])}
- Your current state (context from previous run): ${JSON.stringify(ctx.nextCtx || {})}
- API Calls Remaining Today: ${callsLeft} / 500

Your task:
1.  **Follow the OOC plan above.**
2.  **Output your decision:** Respond with a reasoning paragraph, followed by a JSON object.

\`\`\`json
{
  "reason": "Explain your logic for this decision. For example: 'I am currently in step 1 of the test plan. My position is flat, so I will open a long position of 0.0001 BTC and set my state to awaiting_close.'",
  "action": {
    "side": "buy"|"sell"|null,
    "size": 0.0
  },
  "nextCtx": {
    "ohlcInterval": 5,
    "state": "idle"|"awaiting_close",
    "counter": 0,
    "stopLossPrice": null,
    "takeProfitPrice": null
  }
}
\`\`\`
`;
    const raw = (await model.generateContent(prompt)).response.text();
    log.info('🧠 AI RAW:', raw);
    return JSON.parse(raw.match(/```json\s*(\{[\s\S]*?\})\s*```/)?.[1] || '{}');
  }
}

