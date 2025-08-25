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
You are an expert crypto trading bot running a single-market strategy. Your goal is to maximize profit over time. You operate on a single pair (PF_XBTUSD). You are invoked every few minutes and must make a decision based on the current market data and your past performance. Your only action is to place a market order (buy/sell).

Here is all the information you need:
- UTC Timestamp: ${new Date().toISOString()}
- Current Price: ${markPrice}
- Current Position: ${posSize} (positive for long, negative for short)
- Unrealized PnL: ${openPnl}
- Account Margin: ${balance}
- OHLC Data (last 400 candles): ${JSON.stringify(ohlc)}
- Your Persistent Memory (journal of past thoughts/actions): ${JSON.stringify(ctx.journal || [])}
- Your current state (context): ${JSON.stringify(ctx.nextCtx || {})}
- API Calls Remaining Today: ${callsLeft} / 500

Your task:
1.  **Analyze the market:** Based on the OHLC data, price, and your past performance, what is the best course of action?
2.  **Check for conditions:** Do you need to close a position? Monitor for a stop-loss or take-profit target?
3.  **Formulate a plan:** Based on your analysis, decide on a single action. This could be to place an order, or to do nothing and simply update your internal state.
4.  **Output your decision:** Respond with a reasoning paragraph, followed by a JSON object.

\`\`\`json
{
  "reason": "Explain your logic for this decision. For example: 'The price has fallen below my mental stop-loss of X. I will close the position to limit further losses.'",
  "action": {
    "side": "buy"|"sell"|null,
    "size": 0.0
  },
  "nextCtx": {
    "ohlcInterval": 5,
    "someOtherState": "You can add any other state variables here for memory."
  }
}
\`\`\`
`;
    const raw = (await model.generateContent(prompt)).response.text();
    log.info('🧠 AI RAW:', raw);
    return JSON.parse(raw.match(/```json\s*(\{[\s\S]*?\})\s*```/)?.[1] || '{}');
  }
}
