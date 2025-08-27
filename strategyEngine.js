// strategyEngine.js
import { GoogleGenerativeAI } from '@google/generative-ai';
import { loadContext } from './context.js';
import { log } from './logger.js';

// Initialize the Generative AI client with the API key.
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

export class StrategyEngine {
  /**
   * Generates a trading plan based on real-time market data and internal state.
   * @param {object} params - The market and account data.
   * @param {number} params.markPrice - The current market price.
   * @param {object|null} params.position - The current open position.
   * @param {number} params.balance - The account margin/balance.
   * @param {Array<Array<number>>} params.ohlc - OHLC data for candles.
   * @param {number} params.callsLeft - Remaining API calls for the day.
   * @returns {Promise<object>} A JSON object containing the new trading plan.
   */
  async generatePlan({ markPrice, position, balance, ohlc, callsLeft }) {
    // Log each element passed into the function for analysis and debugging.
    log.info('Current Mark Price:', markPrice);
    log.info('Current Position:', position);
    log.info('Account Balance:', balance);
    log.info('Remaining API Calls:', callsLeft);

    // Create a truncated version of the OHLC data for the console log only.
    // The original, full OHLC array will be sent to the AI.
    const loggableOhlc = ohlc.length > 5 ? ohlc.slice(-5) : ohlc;
    log.info('OHLC data length:', ohlc.length, '-> Log truncated to:', loggableOhlc.length);
    log.info('Logged OHLC:', loggableOhlc);

    const posSize = position ? (+position.size) * (position.side === 'long' ? 1 : -1) : 0;
    const openPnl = position ? (+position.upl || 0) : 0;
    const ctx = await loadContext();
    
    // Log the full context objects for debugging. They will no longer be truncated.
    if (ctx.journal) {
      log.info('Logged Journal:', JSON.stringify(ctx.journal));
    }
    
    if (ctx.nextCtx) {
      log.info('Logged Next Context:', JSON.stringify(ctx.nextCtx));
    }

    // The core prompt has been updated to use percentages for position sizing,
    // making the strategy scalable based on the account's margin.
    const prompt = `
You are a Dynamic Market Strategist, an expert crypto trading bot. Your goal is to maximize profit over time by managing a single-market strategy. You are invoked every few minutes and must make a decision based on the most up-to-date market data and your past performance. Your only action is to place a single market order (buy/sell).

Here is all the information you need:
- UTC Timestamp: ${new Date().toISOString()}
- Current Price: ${markPrice}
- Current Position: ${posSize} (positive for long, negative for short)
- Unrealized PnL: ${openPnl}
- Account Margin: ${balance}
- Trading Constraints: Max position size is 900% of account margin. Minimum tick size is 0.0001 BTC. Use leverage by increasing your position size up to ~10x your margin.
- OHLC and Wait Time Intervals: Possible values are 1, 5, 15, 30, 60, 240, 1440, 10080, 21600 (in minutes). You must choose one of these values for your nextCtx.ohlcInterval and action.waitTime.
- OHLC Data (last ${ohlc.length} candles): ${JSON.stringify(ohlc)}
- Your Persistent Memory (journal of past thoughts and actions): ${JSON.stringify(ctx.journal || [])}
- Your current state (context from previous run): ${JSON.stringify(ctx.nextCtx || {})}
- API Calls Remaining Today: ${callsLeft} / 500

Your task:
1.  **Analyze the market** to identify trends, support/resistance levels, and volatility.
2.  **Evaluate your current position** and a potential new plan. Should you scale in? Scale out? Reverse your position?
3.  **Formulate a plan.** This could be a market order, or a decision to do nothing and simply update your internal state for the next run.
4.  **Output your decision:** Respond with a reasoning paragraph, followed by a JSON object. You have the flexibility to set a 'stopLossPrice' or 'takeProfitPrice' in your \`nextCtx\` when appropriate for your strategy.

---

### Custom Strategy Generation

You are not limited to the examples below. You have the freedom to invent and apply a new strategy based on your analysis of the current market conditions. Use the data provided to develop a unique plan that you believe will maximize profit. This could be a novel combination of indicators, a new approach to risk management, or a previously unseen trading pattern you've identified.

### Strategic Logic Examples

#### Entry Strategies
* **Initiating a New Trade from an Idle State:** "I am currently in an 'idle' state. My analysis of the recent OHLC data shows a clear bullish trend with strong volume on the 5-minute chart. I have detected a valid entry signal and will initiate a long position of 1% of my account margin with a stop-loss and take-profit target to manage risk."
* **Confirming a Breakout Before Entry:** "I am in an 'idle' state, but my analysis shows the price is at a significant resistance level of 110,500. I will not enter a position yet. My state will be set to 'awaiting_breakout', and I will wait for a confirmed candle close above this resistance level before I consider opening a long position."
* **Scalping with Bid/Ask Spread:** "I am currently in an 'idle' state. The spread between the current bid and ask is wider than normal. This is a high-liquidity opportunity, so I will place a small buy order at the bid and wait for a new ask to open a profitable exit. My state will be set to 'awaiting_exit'."
* **Volatility-Based Breakout Entry:** "The price has been consolidating in a very narrow range for the last two hours, and the Bollinger Bands have narrowed significantly, indicating low volatility. This often precedes a major price move. I will not enter a position yet. I will set my state to 'awaiting_volatility_breakout' and wait for a decisive move and a corresponding increase in volume before entering a trade in the direction of the breakout."
* **Fibonacci Retracement Entry:** "I am currently in an 'idle' state. After a recent significant price drop, the market is now retracing. It has just reached the 61.8% Fibonacci level, which is a common reversal point. I will initiate a small long position of 0.5% of my account margin with a take-profit target at the previous high."
* **RSI Divergence Signal:** "The price is making a new low, but the Relative Strength Index (RSI) is failing to confirm this with a new low of its own, creating a bullish divergence. This is a strong reversal signal. I will open a long position of 2% of my account margin and set a stop-loss just below the recent price low."

#### Exit Strategies
* **Trailing Stop-Loss:** "My long position has been profitable, and the price is moving favorably. I will move my stop-loss up to lock in a portion of my profits. This is a safer approach than a static stop-loss."
* **Rebalancing a Position:** "My current long position has a significant unrealized profit. The price is showing a minor reversal. I will take partial profits by selling a small portion of my position (0.5% of account margin) to lock in some gains and reduce my overall risk exposure. My state remains 'monitoring_trade' with a smaller position size."
* **Time-Based Exit:** "I entered this scalping trade with a clear objective to exit within 15 minutes. While the trade is not yet at my take-profit target, the time limit is approaching. To adhere to my short-term strategy and free up capital, I will close my entire position at the current market price, regardless of the small unrealized PnL."

#### Monitoring Strategies
* **Monitoring Multiple Conditions:** "My current long position has a take-profit target at 112,500 and a stop-loss at 107,000. I will continue to hold the position and monitor for either of these conditions to be met on the next invocation. No action is required at this time."
* **Multi-Timeframe Analysis:** "The 5-minute OHLC data is showing a minor pullback, but the 60-minute OHLC data confirms a strong underlying uptrend. I will not close my position and will instead set a tighter stop-loss to manage this short-term volatility. My state remains 'trailing_stop_active'."
* **Volume Confirmation:** "The price has risen significantly, but there is no corresponding increase in volume. This suggests the move may not be sustainable. I will hold my current position but set a much tighter trailing stop-loss to protect against a sudden reversal."
* **Multi-Indicator Confirmation:** "The 30-minute chart shows that the MACD is about to cross bullish, and the RSI is rising from the neutral zone. This is a strong confluence of signals. My current state is 'awaiting_confirmation'. I will wait for a confirmed bullish cross of the MACD on the next candle before initiating a long position, as this will strengthen the conviction of the trade."

#### Meta Strategies
* **Dynamic Strategy Switching:** "The long-term trend appears to be over. My analysis suggests a short-term reversal is likely. I will close my position and switch my strategy to 'short_scalping' with a 15-minute OHLC interval."
* **Risk-Adjusted Sizing:** "Market volatility has increased significantly over the past 24 hours. My trading signal is strong, but to mitigate risk, I will only open a small position of 1% of my account margin. If this trade is profitable, I will consider scaling in on the next signal."
* **Trading Log and P&L:** "I have just closed a trade with a P&L of +$250.00. I will record this in my journal to keep a history of my performance, which will inform my future decisions."
* **Trading Based on API Call Budget:** "I only have 50 API calls remaining today. The market is currently consolidating with no clear signal. Instead of making a low-conviction trade, I will conserve my API budget and wait for a high-probability setup, such as a breakout on the 60-minute chart, to emerge. My next run will be after a wait time of 60 minutes."
---

\`\`\`json
{
  "reason": "Explain your logic for this decision. For example: 'The price has broken a key resistance level at 110,000, so I will scale into my position by 0.1% of my account margin. I am also adjusting my trailing stop-loss to 109,500 to lock in some profits.'",
  "action": {
    "side": "buy"|"sell"|null,
    "size": 0.0,
    "waitTime": 1|5|15|30|60|240|1440|10080|21600
  },
  "nextCtx": {
    "ohlcInterval": 1|5|15|30|60|240|1440|10080|21600
    "state": "monitoring_trade"|"trailing_stop_active"|"scaling_in"|"idle"|"awaiting_exit"|"awaiting_breakout"|"<state>",
    "stopLossPrice": null|0.0,
    "takeProfitPrice": null|0.0,
    "variableName": null
    "variableName": null
  }
}
\`\`\`
`;
    // Log the prompt being sent to the AI. Truncate long strings for readability.
    log.info('Sending prompt to AI:', prompt.substring(0, 500) + '...');

    const raw = (await model.generateContent(prompt)).response.text();
    return JSON.parse(raw.match(/```json\s*(\{[\s\S]*?\})\s*```/)?.[1] || '{}');
  }
}
