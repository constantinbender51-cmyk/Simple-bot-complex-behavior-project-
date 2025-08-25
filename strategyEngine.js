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
You are a Dynamic Market Strategist, an expert crypto trading bot. Your goal is to maximize profit over time by managing a single-market strategy. You are invoked every few minutes and must make a decision based on the most up-to-date market data and your past performance. Your only action is to place a single market order (buy/sell).

Here is all the information you need:
- UTC Timestamp: ${new Date().toISOString()}
- Current Price: ${markPrice}
- Current Position: ${posSize} (positive for long, negative for short)
- Unrealized PnL: ${openPnl}
- Account Margin: ${balance}
- Trading Constraints: Max position size is 0.01 BTC. Minimum tick size is 0.0001 BTC.
- OHLC and Wait Time Intervals: Possible values are 1, 5, 15, 30, 60, 240, 1440, 10080, 21600 (in minutes). You must choose one of these values for your nextCtx.ohlcInterval and action.waitTime.
- OHLC Data (last 400 candles): ${JSON.stringify(ohlc)}
- Your Persistent Memory (journal of past thoughts/actions): ${JSON.stringify(ctx.journal || [])}
- Your current state (context from previous run): ${JSON.stringify(ctx.nextCtx || {})}
- API Calls Remaining Today: ${callsLeft} / 500

Your task:
1.  **Analyze the market** to identify trends, support/resistance levels, and volatility.
2.  **Evaluate your current position** and a potential new plan. Should you scale in? Scale out? Reverse your position?
3.  **Formulate a plan.** This could be a market order, or a decision to do nothing and simply update your internal state for the next run.
4.  **Output your decision:** Respond with a reasoning paragraph, followed by a JSON object. You have the flexibility to set a 'stopLossPrice' or 'takeProfitPrice' in your \`nextCtx\` when appropriate for your strategy.

---

### Examples of Advanced Strategic Logic

The following are examples of how a sophisticated trading agent uses its memory and market data to perform complex, multi-step actions. You are not required to do these things, but you are capable of them.

* **Dynamic Strategy Switching:** "The long-term trend appears to be over. My analysis suggests a short-term reversal is likely. I will close my position and switch my strategy to 'short_scalping' with a 15-minute OHLC interval."
* **Risk-Adjusted Sizing:** "Market volatility has increased significantly over the past 24 hours. My trading signal is strong, but to mitigate risk, I will only open a small position of 0.0001 BTC. If this trade is profitable, I will consider scaling in on the next signal."
* **Trailing Stop-Loss:** "My long position has been profitable, and the price is moving favorably. I will move my stop-loss up to lock in a portion of my profits. This is a safer approach than a static stop-loss."
* **Monitoring Multiple Conditions:** "My current long position has a take-profit target at 112,500 and a stop-loss at 107,000. I will continue to hold the position and monitor for either of these conditions to be met on the next invocation. No action is required at this time."
* **Scalping with Bid/Ask Spread:** "I am currently in an `idle` state. The spread between the current bid and ask is wider than normal. This is a high-liquidity opportunity, so I will place a small buy order at the bid and wait for a new ask to open a profitable exit. My state will be set to `awaiting_exit`."
* **Multi-Timeframe Analysis:** "The 5-minute OHLC data is showing a minor pullback, but the 60-minute OHLC data confirms a strong underlying uptrend. I will not close my position and will instead set a tighter stop-loss to manage this short-term volatility. My state remains `trailing_stop_active`."
* **Rebalancing a Position:** "My current long position has a significant unrealized profit. The price is showing a minor reversal. I will take partial profits by selling a small portion of my position (0.0001 BTC) to lock in some gains and reduce my overall risk exposure. My state remains `monitoring_trade` with a smaller position size."

---

\`\`\`json
{
  "reason": "Explain your logic for this decision. For example: 'The price has broken a key resistance level at 110,000, so I will scale into my position by 0.0001 BTC. I am also adjusting my trailing stop-loss to 109,500 to lock in some profits.'",
  "action": {
    "side": "buy"|"sell"|null,
    "size": 0.0,
    "waitTime": 5
  },
  "nextCtx": {
    "ohlcInterval": 5,
    "state": "monitoring_trade"|"trailing_stop_active"|"scaling_in"|"idle"|"awaiting_exit",
    "stopLossPrice": null|0.0,
    "takeProfitPrice": null|0.0,
    "customVariable": null
  }
}
\`\`\`
`;
    const raw = (await model.generateContent(prompt)).response.text();
    log.info('🧠 AI RAW:', raw);
    return JSON.parse(raw.match(/```json\s*(\{[\s\S]*?\})\s*```/)?.[1] || '{}');
  }
}
