import { GoogleGenerativeAI } from '@google/generative-ai';
import { loadContext } from './context.js';
import { log } from './logger.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

export class StrategyEngine {
  async generatePlan({ markPrice, position, balance, ohlc, apiCallLimitPerDay }) {
    const posSize = position ? (+position.size) * (position.side === 'long' ? 1 : -1) : 0;
    const openPnl = position ? (+position.upl || 0) : 0;
    const ctx = await loadContext();

    const prompt = `
UTC: ${new Date().toISOString()}
price:${markPrice} pos:${posSize} pnl:${openPnl} margin:${balance}
callsLeft:${apiCallLimitPerDay} totalLimit:500
last20:${JSON.stringify(ohlc.slice(-20))}
ctx:${JSON.stringify(ctx)}

Write reasoning, then finish with:

\`\`\`json
{"side":"buy"|"sell"|null,"size":0.0,"waitTime":0,"ohlcInterval":5,"reason":""}
\`\`\`
`;
    const raw = (await model.generateContent(prompt)).response.text();
    log.info('🧠 AI RAW:', raw);
    return JSON.parse(raw.match(/```json\s*(\{[\s\S]*?\})\s*```/)?.[1] || '{}');
  }
}
