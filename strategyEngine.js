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
You are a Dynamic Market Strategist, an expert crypto trading bot. Your goal is to maximize profit over time by managing a single-market strategy. You MUST respond with valid JSON only.

CURRENT DATA:
- Timestamp: ${new Date().toISOString()}
- Price: ${markPrice}
- Position: ${posSize}
- Unrealized PnL: ${openPnl}
- Margin: ${balance}
- Realized PnL: ${pnl?.realizedPnL || 0}
- Net PnL: ${pnl?.netPnL || 0}
- Fees: ${pnl?.totalFees || 0}
- Trades: ${pnl?.tradeCount || 0}
- OHLC Interval: ${ctx.nextCtx?.ohlcInterval || 60}
- API Calls Left: ${callsLeft}

YOUR TASK:
Analyze market conditions and your PnL performance. Make a trading decision.

RESPONSE FORMAT - STRICT JSON ONLY:
{
  "reason": "Brief explanation of your decision",
  "action": {
    "side": "buy|sell|null",
    "size": 0.0,
    "waitTime": 1|5|15|30|60|240|1440|10080|21600
  },
  "nextCtx": {
    "ohlcInterval": 1|5|15|30|60|240|1440|10080|21600,
    "state": "monitoring_trade|trailing_stop_active|scaling_in|idle|awaiting_exit|awaiting_breakout",
    "stopLossPrice": null|number,
    "takeProfitPrice": null|number
  }
}

IMPORTANT: 
- Size must be a number between 0 and 9.0
- waitTime and ohlcInterval must be one of the specified values
- side must be "buy", "sell", or null
- Do not include any text outside the JSON object
- Ensure all quotes are properly closed
- Do not use trailing commas`;

    try {
      const result = await model.generateContent(prompt);
      const rawText = result.response.text();
      
      // Clean and extract JSON
      let jsonText = rawText.trim();
      
      // Remove any markdown code blocks
      jsonText = jsonText.replace(/```json\s*/g, '').replace(/```\s*/g, '');
      
      // Remove any text before the first { and after the last }
      const firstBrace = jsonText.indexOf('{');
      const lastBrace = jsonText.lastIndexOf('}');
      
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        jsonText = jsonText.substring(firstBrace, lastBrace + 1);
      }
      
      // Parse and validate the JSON
      const plan = JSON.parse(jsonText);
      
      // Validate required fields
      if (!plan.reason || !plan.action || !plan.nextCtx) {
        throw new Error('Missing required fields in plan');
      }
      
      // Validate action object
      const validSides = ['buy', 'sell', null];
      if (!validSides.includes(plan.action.side)) {
        plan.action.side = null;
      }
      
      if (typeof plan.action.size !== 'number' || plan.action.size < 0) {
        plan.action.size = 0;
      }
      
      // Validate waitTime
      const validWaitTimes = [1, 5, 15, 30, 60, 240, 1440, 10080, 21600];
      if (!validWaitTimes.includes(plan.action.waitTime)) {
        plan.action.waitTime = 15; // Default to 15 minutes
      }
      
      // Validate nextCtx
      if (!validWaitTimes.includes(plan.nextCtx.ohlcInterval)) {
        plan.nextCtx.ohlcInterval = 15;
      }
      
      const validStates = [
        'monitoring_trade', 'trailing_stop_active', 'scaling_in', 
        'idle', 'awaiting_exit', 'awaiting_breakout'
      ];
      
      if (!validStates.includes(plan.nextCtx.state)) {
        plan.nextCtx.state = 'idle';
      }
      
      // Ensure optional fields exist
      plan.nextCtx.stopLossPrice = plan.nextCtx.stopLossPrice || null;
      plan.nextCtx.takeProfitPrice = plan.nextCtx.takeProfitPrice || null;
      
      log.info('Generated valid plan:', plan);
      return plan;
      
    } catch (error) {
      log.error('Strategy generation failed:', error);
      log.error('Raw AI response:', rawText);
      
      // Return a safe default plan
      return {
        reason: 'Error generating plan - using conservative default',
        action: { 
          side: null, 
          size: 0, 
          waitTime: 15 
        },
        nextCtx: { 
          ohlcInterval: 15, 
          state: 'idle',
          stopLossPrice: null,
          takeProfitPrice: null
        }
      };
    }
  }
}
