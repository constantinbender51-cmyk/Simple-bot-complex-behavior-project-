import { GoogleGenerativeAI } from '@google/generative-ai';
import { loadContext } from './context.js';
import { log } from './logger.js';
import { getExpertInsights } from './expertAnalysis.js';

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
  async generatePlan({ markPrice, position, balance, callsLeft }) {
    // Log each element passed into the function for analysis and debugging.
    log.info('Current Mark Price:', markPrice);
    log.info('Current Position:', position);
    log.info('Account Balance:', balance);
    log.info('Remaining API Calls:', callsLeft);

    const posSize = position ? (+position.size) * (position.side === 'long' ? 1 : -1) : 0;
    const openPnl = position ? (+position.unrealizedFunding || 0) : 0;
    const ctx = await loadContext();
    
    // Get expert insights from the separate analysis module
    const { journalInsight, timeframeData } = await getExpertInsights();
    const selectedOhlc = timeframeData.ohlcData[timeframeData.bestTimeframe] || [];

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
- Trading Constraints: Max position size is 900% of account margin. Minimum tick size is 0.0001 BTC. Use leverage by increasing your position size up to 9x your margin.
- OHLC and Wait Time Intervals: Possible values are 1, 5, 15, 30, 60, 240, 1440, 10080, 21600 (in minutes). You must choose one of these values for your nextCtx.ohlcInterval and action.waitTime.
- OHLC Data (last ${selectedOhlc.length} candles) for the selected timeframe (${timeframeData.bestTimeframe} minutes): ${JSON.stringify(selectedOhlc)}
- Your Persistent Memory (journal of past thoughts and actions): ${JSON.stringify(ctx.journal || [])}
- Your current state (context from previous run): ${JSON.stringify(ctx.nextCtx || {})}
- API Calls Remaining Today: ${callsLeft} / 500

---
### Expert Analysis Provided by Sub-AIs:
- **Journal Insights:** ${journalInsight}
- **Timeframe Analysis:** The best timeframe to trade on is the ${timeframeData.bestTimeframe}-minute chart. The primary signal is: ${timeframeData.signalSummary}
This analysis is not binding. It represents a recommendation, not your final decision, which you must conclude on your own.

---
Your task:
1.  **Analyze the market** to identify trends, support/resistance levels, and volatility.
2.  **Evaluate your current position** and a potential new plan. Should you scale in? Scale out? Reverse your position?
3.  **Formulate a plan.** This could be a market order, or a decision to do nothing and simply update your internal state for the next run.
4.  **Output your decision:** Respond with a reasoning paragraph, followed by a JSON object. You have the flexibility to set a 'stopLossPrice' or 'takeProfitPrice' in your \`nextCtx\` when appropriate for your strategy. You may ommit keys that are not in use, eg. stopLossPrice when you are not managing a position. Save custom variables to give your thought process more depth.

---

### Custom Strategy Generation

You are not limited to the examples below. You have the freedom to invent and apply a new strategy based on your analysis of the current market conditions. Use the data provided to develop a unique plan that you believe will maximize profit. This could be a novel combination of indicators, a new approach to risk management, or a previously unseen trading pattern you've identified.

### Strategic Logic Examples

#### Entry Strategies
* **Initiating a New Trade from an Idle State:** "I am currently in an 'idle' state. My analysis of the recent OHLC data shows a clear bullish trend with strong volume on the 5-minute chart. I have detected a valid entry signal and will initiate a long position of 1% of my account margin with a stop-loss and take-profit target to manage risk."
* **Confirming a Breakout Before Entry:** "I am in an 'idle' state, but my analysis shows the price is at a significant resistance level of 110,500. I will not enter a position yet. My state will be set to 'awaiting_breakout', and I will wait for a confirmed candle close above this resistance level before I consider opening a long position."
* **Scalping with Bid/Ask Spread:** "I am currently in an 'idle' state. The spread between the current bid and ask is wider than normal. This is a high-liquidity opportunity, so I will place a small buy order at the bid and wait for a new ask to open a profitable exit. My state will be set to 'awaiting_exit'."
* **Volatility-Based Breakout Entry:** "The price has been consolidating in a very narrow range for the last two hours, and the Bollinger Bands have narrowed significantly, indicating low volatility. This often precedes a major price move. I will not enter a position yet. I will set my state to 'awaiting_volatility_breakout', and I will wait for a decisive move and a corresponding increase in volume before entering a trade in the direction of the breakout."
* **Fibonacci Retracement Entry:** "I am currently in an 'idle' state. After a recent significant price drop, the market is now retracing. It has just reached the 61.8% Fibonacci level, which is a common reversal point. I will initiate a small long position of 0.5% of my account margin with a take-profit target at the previous high."
* **RSI Divergence Signal:** "The price is making a new low, but the Relative Strength Index (RSI) is failing to confirm this with a new low of its own, creating a bullish divergence. This is a strong reversal signal. I will open a long position of 2% of my account margin and set a stop-loss just below the recent price low."

#### Exit Strategies
* **Stop-Loss Execution:** "The current price has crossed my stop-loss level. I will close my position to prevent further losses by placing a market order in the opposite direction for the same size. My state will be reset to 'idle' and my stop-loss and take-profit prices will be cleared."
* **Trailing Stop-Loss:** "My long position has been profitable, and the price is moving favorably. I will move my stop-loss up to lock in a portion of my profits. This is a safer approach than a static stop-loss."
* **Rebalancing a Position:** "My current long position has a significant unrealized profit. The price is showing a minor reversal. I will take partial profits by selling a small portion of my position (0.5% of account margin) to lock in some gains and reduce my overall risk exposure. My state remains 'monitoring_trade' with a smaller position size."
* **Time-Based Exit:** "I entered this scalping trade with a clear objective to exit within 15 minutes. While the trade is not yet at my take-profit target, the time limit is approaching. To adhere to my short-term strategy and free up capital, I will close my entire position at the current market price, regardless of the small unrealized PnL."

#### Monitoring Strategies
* **Monitoring Multiple Conditions:** "My current long position has a take-profit target at 112,500 and a stop-loss at 107,000. I will continue to hold the position and monitor for either of these conditions to be met on the next invocation. No action is required at this time."
* **Multi-Timeframe Analysis:** "The 5-minute OHLC data is showing a minor pullback, but the 60-minute OHLC data confirms a strong underlying uptrend. I will not close my position and will instead set a tighter stop-loss to manage this short-term volatility. My state remains 'trailing_stop_active'."
* **Volume Confirmation:** "The price has risen significantly, but there is no corresponding increase in volume. This suggests the move may not be sustainable. I will hold my current position but set a much tighter trailing stop-loss to protect against a sudden reversal."
* **Multi-Indicator Confirmation:** "The 30-minute chart shows that the MACD is about to cross bullish, and the RSI is rising from the neutral zone. This is a strong confluence of signals. My current state is 'awaiting_confirmation'. I will wait for a confirmed bullish cross of the MACD on the next candle before initiating a long position, as this will strengthen the conviction of the trade."
* **Multi-Timeframe Strategy Alignment:** "I am currently in a 'awaiting_breakout' state on the 60-minute chart, with my target breakout level set at 112,000. While the expert analysis from the sub-AI suggests the 240-minute timeframe is most relevant for overall market direction, my current strategy is focused on a shorter-term, high-probability setup. I will continue to monitor for the 60-minute breakout, but I will keep the broader bullish trend from the 240-minute analysis in mind to add conviction to my potential long entry. No action will be taken at this time."
* **Maintaining Context and Strategy:** "I have just been invoked, and my persistent state from the previous run indicates that I am in a 'trailing_stop_active' state with a specific stop-loss price and other variables defined. My analysis confirms that the market has not yet hit my stop-loss or take-profit target. I will maintain my current context and continue to monitor the position according to the established plan, as no new information requires me to change my strategy. I will continue to use a 60-minute OHLC interval to monitor for a potential exit signal."

#### Macro Strategies
* **Exploratory Analysis of Timeframes:** "I have no immediate trades to manage and am in an 'idle' state. I will use this opportunity to perform a deeper analysis of the weekly and monthly candles to re-evaluate my position within the 4-year BTC cycle. I'll save my findings in the \`nextCtx\` variable to inform my longer-term strategy. No market action will be taken at this time."
* **Evaluating Position in a Multi-Year Cycle:** "I am currently in an 'idle' state, trading on 60-minute candles. However, my last review of the weekly and monthly charts indicates that the overall market is in a bullish phase of the 4-year BTC halving cycle. This big-picture analysis reinforces my bullish bias for short-term trades. I'll note this finding and continue seeking high-probability entry signals on my primary timeframe."
* **Dynamic Strategy Switching:** "The long-term trend appears to be over. My analysis suggests a short-term reversal is likely. I will close my position and switch my strategy to 'short_scalping' with a 15-minute OHLC interval."
* **Risk-Adjusted Sizing:** "Market volatility has increased significantly over the past 24 hours. My trading signal is strong, but to mitigate risk, I will only open a small position of 1% of my account margin. If this trade is profitable, I will consider scaling in on the next signal."
* **Trading Log and P&L:** "I have just closed a trade with a P&L of +$250.00. I will record this in my journal to keep a history of my performance, which will inform my future decisions."
* **Trading Based on API Call Budget:** "I only have 50 API calls remaining today. The market is currently consolidating with no clear signal. Instead of making a low-conviction trade, I will conserve my API budget and wait for a high-probability setup, such as a breakout on the 60-minute chart, to emerge. My next run will be after a wait time of 60 minutes."
* **Error Analysis and Strategy Adjustment:** "I have just closed a trade at a loss of -$150.00. The primary reason for the loss was entering a long position too early, without waiting for the bullish divergence to be confirmed by an increase in volume. I will record this mistake in my journal and, as a corrective measure, will reduce my maximum position size to 0.5% of my account margin for the next three trades to mitigate risk. My state is now 'error_correction'."
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
    "state": "monitoring_trade"|"trailing_stop_active"|"scaling_in"|"idle"|"awaiting_exit"|"awaiting_breakout"|"error_correction"|"<state>",
    "stopLossPrice": null|0.0,
    "takeProfitPrice": null|0.0,
    "variableName": null
    "variableName": null
  }
}
\`\`\`
or
\`\`\`json
{
  "reason": "I am currently managing a long position that is showing a small profit. Simultaneously, I am monitoring a key resistance level at 115,000 for a potential bullish breakout. My long-term trend-following strategy evaluation, which I've been running for 2 out of 4 days, began on August 25, 2025. This evaluation is showing a positive correlation with current market movements. I will continue to hold the position and monitor for either a breakout or the completion of my evaluation period.",
  "action": {
    "side": null,
    "size": 0.0,
    "waitTime": 60
  },
  "nextCtx": {
    "ohlcInterval": 60,
    "state": "manage_position&awaiting_breakout&evaluating_strategy",
    "stopLossPrice": 109500,
    "takeProfitPrice": 113000,
    "strategyEvaluationData": {
      "daysEvaluated": 2,
      "totalDaysToEvaluate": 4,
      "breakoutLevel": 115000,
      "trendFollowingResult": "positive",
      "trend": "bullish",
      "startDate": "2025-08-25"
    }
  }
}
\`\`\`
`;
    const raw = (await model.generateContent(prompt)).response.text();
    return JSON.parse(raw.match(/```json\s*(\{[\s\S]*?\})\s*```/)?.[1] || '{}');
  }
}
