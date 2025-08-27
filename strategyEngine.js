// strategyEngine.js
import { GoogleGenerativeAI } from '@google/generative-ai';
import { loadContext } from './context.js';
import { log } from './logger.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

export class StrategyEngine {
  /**
   * Generates a trading plan based on real-time market data, PnL, and internal state.
   * @param {object} params - The market, account, and PnL data.
   * @param {number} params.markPrice - The current market price.
   * @param {object|null} params.position - The current open position.
   * @param {number} params.balance - The account margin/balance.
   * @param {object} params.pnl - Profit and loss data.
   * @param {Array<Array<number>>} params.ohlc - OHLC data for candles.
   * @param {number} params.callsLeft - Remaining API calls for the day.
   * @returns {Promise<object>} A JSON object containing the new trading plan.
   */
  async generatePlan({ markPrice, position, balance, pnl, ohlc, callsLeft }) {
    const posSize = position ? (+position.size) * (position.side === 'long' ? 1 : -1) : 0;
    const openPnl = position ? (+position.upl || 0) : 0;
    const ctx = await loadContext();

    const prompt = `
You are a Dynamic Market Strategist, an expert crypto trading bot. Your goal is to maximize profit over time by managing a single-market strategy. You are invoked every few minutes and must make a decision based on the most up-to-date market data, PnL performance, and your past performance. Your only action is to place a single market order (buy/sell).

Here is all the information you need:

· UTC Timestamp: ${new Date().toISOString()}
· Current Price: ${markPrice}
· Current Position: ${posSize} (positive for long, negative for short)
· Unrealized PnL: ${openPnl}
· Account Margin: ${balance}
· Trading Constraints: Max position size is 900% of account margin. Minimum tick size is 0.0001 BTC. Use leverage by increasing your position size up to ~10x your margin.

· PROFIT & LOSS ANALYSIS:
  - Realized PnL: ${pnl?.realizedPnL || 0}
  - Unrealized PnL: ${pnl?.unrealizedPnL || 0}
  - Total PnL: ${pnl?.totalPnL || 0}
  - Net PnL (after fees): ${pnl?.netPnL || 0}
  - Total Fees: ${pnl?.totalFees || 0}
  - Total Trades: ${pnl?.tradeCount || 0}
  - Open Positions: ${pnl?.openPositionsCount || 0}

· OHLC and Wait Time Intervals: Possible values are 1, 5, 15, 30, 60, 240, 1440, 10080, 21600 (in minutes). You must choose one of these values for your nextCtx.ohlcInterval and action.waitTime.
· OHLC Data (last 400 candles): ${JSON.stringify(ohlc.slice(-50))} // Showing last 50 for brevity
· Your Persistent Memory (journal of past thoughts and actions): ${JSON.stringify(ctx.journal?.slice(-5) || [])} // Last 5 entries
· Your current state (context from previous run): ${JSON.stringify(ctx.nextCtx || {})}
· API Calls Remaining Today: ${callsLeft} / 500

Your task:

1. Analyze the market to identify trends, support/resistance levels, and volatility.
2. Evaluate your current PnL performance - are you profitable? What's your win rate?
3. Consider your trading costs (fees) and how they impact your net returns.
4. Evaluate your current position and a potential new plan. Should you scale in? Scale out? Reverse your position?
5. Formulate a plan based on both market conditions and your performance metrics.
6. Output your decision: Respond with a reasoning paragraph, followed by a JSON object.

---

Enhanced Strategy Considerations with PnL Data:

· Performance-Based Risk Management: "My net PnL is negative (-$150) with high fees. I will reduce position size to 0.5% and focus on higher timeframes to improve win rate and reduce trading costs."
· Profit-Taking Strategy: "I'm up $500 net with a 75% win rate. I'll take partial profits on this position to lock in gains and reduce risk exposure."
· Fee Optimization: "I notice my fees are high relative to my profits. I'll switch to longer timeframes (60min) to reduce trading frequency and improve net returns."
· Trend Following with Confirmation: "The 15-minute trend is bullish and my recent trades have been profitable. I'll add to my long position with a tight stop-loss."
· Loss Recovery: "I'm down $200 on my last trades. The market is consolidating - I'll wait for a clear breakout signal before entering to avoid further losses."
· Volume-Price Analysis: "High volume on the recent move up confirms the trend. Combined with my positive PnL on recent long positions, I'll increase my long exposure."

\`\`\`json
{
  "reason": "Explain your logic incorporating PnL analysis. Example: 'The price broke resistance at 110,000 with strong volume. My recent long trades have been profitable (+$300 net), so I'll scale into my position by 0.2% margin. I'm also setting a trailing stop at 109,500 to protect profits given my positive PnL trend.'",
  "action": {
    "side": "buy"|"sell"|null,
    "size": 0.0,
    "waitTime": 1|5|15|30|60|240|1440|10080|21600
  },
  "nextCtx": {
    "ohlcInterval": 1|5|15|30|60|240|1440|10080|21600,
    "state": "monitoring_trade"|"trailing_stop_active"|"scaling_in"|"idle"|"awaiting_exit"|"awaiting_breakout"|"<state>",
    "stopLossPrice": null|0.0,
    "takeProfitPrice": null|0.0,
    "variableName": null
  }
}
\`\`\``;

    try {
      const raw = (await model.generateContent(prompt)).response.text();
      const jsonMatch = raw.match(/json\s*(\{[\s\S]*?\})\s*/)?.[1] || '{}';
      return JSON.parse(jsonMatch);
    } catch (error) {
      log.error('Strategy generation failed:', error);
      // Return a safe default plan
      return {
        reason: 'Error generating plan - using conservative default',
        action: { side: null, size: 0, waitTime: 15 },
        nextCtx: { ohlcInterval: 15, state: 'idle' }
      };
    }
  }
}
