import { GoogleGenerativeAI } from '@google/generative-ai';
import { loadContext } from './context.js';
import { log } from './logger.js';
import KrakenFuturesApi from './krakenApi.js';

// Initialize the Generative AI client and Kraken API.
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
const krakenApi = new KrakenFuturesApi(
  process.env.KRAKEN_API_KEY,
  process.env.KRAKEN_SECRET_KEY
);

// Helper function to fetch OHLC data for a given interval.
async function fetchOHLC(intervalMinutes, count) {
  try {
    const since = Math.floor(Date.now() / 1000 - intervalMinutes * 60 * count);
    const data = await krakenApi.fetchKrakenData({ pair: 'XBTUSD', interval: intervalMinutes, since });
    return data;
  } catch (error) {
    log.error(`Error fetching OHLC for interval ${intervalMinutes}:`, error);
    return [];
  }
}

/**
 * Performs preliminary AI analysis on the trading journal and market timeframes.
 * @returns {Promise<object>} An object containing insights from the AI calls.
 */
export async function getExpertInsights() {
  const ctx = await loadContext();

  // Step 1: Fetch OHLC data for all relevant timeframes for multi-timeframe analysis.
  const ohlc1m = await fetchOHLC(1, 400);
  const ohlc5m = await fetchOHLC(5, 400);
  const ohlc15m = await fetchOHLC(15, 400);
  const ohlc60m = await fetchOHLC(60, 400);
  const ohlc240m = await fetchOHLC(240, 400);
  const ohlc1d = await fetchOHLC(1440, 400);
  const ohlc1w = await fetchOHLC(10080, 400);

  // Step 2: AI Call to analyze the trading journal.
  const journalPrompt = `
You are a trading performance analyst. Your task is to analyze the provided trading journal and identify key patterns, recurring errors, successful strategies, and any actionable insights that can improve future trading decisions. 

Provide a concise, single-paragraph summary of your findings.
Journal: ${JSON.stringify(ctx.journal || [])}
`;
  log.info('Running AI analysis on trading journal...');
  const journalResponse = await model.generateContent(journalPrompt);
  const journalInsight = journalResponse.response.text();
  log.info('✅ Journal Analysis Complete:', journalInsight);

  // Step 3: AI Call to analyze multiple timeframes and select the most interesting one.
  const timeframePrompt = `
You are a technical market analyst. Your task is to analyze OHLC data from multiple timeframes and identify which one currently shows the most a clear, tradeable signal (e.g., strong trend, clear support/resistance, a breakout pattern, or a reversal signal).

Provide a reasoning paragraph for your choice, followed by a JSON object with the best timeframe and a summary of the signal. The timeframe must be one of the provided values (1, 5, 15, 60, 240, 1440, 10080).

Timeframe Data:
- 1-minute: ${JSON.stringify(ohlc1m.slice(-10))}
- 5-minute: ${JSON.stringify(ohlc5m.slice(-10))}
- 15-minute: ${JSON.stringify(ohlc15m.slice(-10))}
- 60-minute: ${JSON.stringify(ohlc60m.slice(-10))}
- 240-minute: ${JSON.stringify(ohlc240m.slice(-10))}
- 1-day: ${JSON.stringify(ohlc1d.slice(-10))}
- 1-week: ${JSON.stringify(ohlc1w.slice(-10))}

---
Example Output:
\`\`\`json
{
  "reason": "The 60-minute chart shows a clear, sustained bullish trend with higher highs and higher lows. The 15-minute chart, while showing a minor retracement, is not as clear as the 60-minute trend. The daily chart is too flat for a clear signal at this time.",
  "bestTimeframe": 60,
  "signalSummary": "Strong bullish trend."
}
\`\`\`
`;
  log.info('Running AI analysis on multiple timeframes...');
  const timeframeResponse = await model.generateContent(timeframePrompt);
  const timeframeData = JSON.parse(timeframeResponse.response.text().match(/```json\s*(\{[\s\S]*?\})\s*```/)?.[1] || '{}');
  log.info('✅ Timeframe Analysis Complete:', timeframeResponse.response.text);

  return {
    journalInsight,
    timeframeData: {
      ...timeframeData,
      ohlcData: {
        1: ohlc1m,
        5: ohlc5m,
        15: ohlc15m,
        60: ohlc60m,
        240: ohlc240m,
        1440: ohlc1d,
        10080: ohlc1w,
      }
    }
  };
}
