// strategyEngine.js  —  only buildLast10ClosedFromRawFills keeps debug logs
import fs from 'fs';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { log } from './logger.js';

const BOT_START_TIME = new Date().toISOString();   // UTC “now” when module loads


const readLast10ClosedTradesFromFile = () => {
  try {
    return JSON.parse(fs.readFileSync('./trades.json', 'utf8'))
               .filter(t => t.exitTime)
               .slice(-10);
  } catch { return []; }
};

function buildLast10ClosedFromRawFills(rawFills, n = 10) {
  if (!Array.isArray(rawFills) || rawFills.length === 0) return [];

  // 1️⃣  discard everything earlier than bot launch
  const eligible = rawFills.filter(
    f => new Date(f.fillTime) >= new Date(BOT_START_TIME)
  );
  console.log('[FIFO-DEBUG] after start-time filter =', eligible.length);

  if (eligible.length === 0) return [];

  const fills = [...eligible].reverse(); // oldest→newest
  const queue = [];
  const closed = [];

  // 2️⃣  rest of FIFO logic unchanged …
  for (const f of fills) {
    const side = f.side === 'buy' ? 'LONG' : 'SHORT';
    if (!queue.length || queue.at(-1).side === side) {
      queue.push({ side, entryTime: f.fillTime, entryPrice: f.price, size: f.size });
      continue;
    }

    let remaining = f.size;
    while (remaining > 0 && queue.length && queue[0].side !== side) {
      const open = queue.shift();
      const match = Math.min(remaining, open.size);
      const pnl = (f.price - open.entryPrice) * match * (open.side === 'LONG' ? 1 : -1);
      closed.push({
        side: open.side,
        entryTime: open.entryTime,
        entryPrice: open.entryPrice,
        exitTime: f.fillTime,
        exitPrice: f.price,
        size: match,
        pnl
      });
      remaining -= match;
      open.size -= match;
      if (open.size > 0) queue.unshift(open);
    }

    if (remaining > 0) {
      queue.push({ side, entryTime: f.fillTime, entryPrice: f.price, size: remaining });
    }
  }

  const last10 = closed.slice(-n).reverse();
  return last10;
}

export class StrategyEngine {
  constructor() {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const safety = [{ category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }];
    this.model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite', safetySettings: safety });
  }

  async _callWithRetry(prompt, max = 4) {
    for (let i = 1; i <= max; i++) {
      try {
        const res = await this.model.generateContent(prompt);
        const text = res.response.text?.();
        if (!text?.length) throw new Error('Empty response');
        return { ok: true, text };
      } catch (err) {
        if (i === max) return { ok: false, error: err };
        console.log(`Call retry ${i} of ${max}`);
        await new Promise(r => setTimeout(r, 61_000));
      }
    }
  }

  _prompt(market) {
    const closes = market.ohlc.map(c => c.close);
    const latest = closes.at(-1);
    const sma20  = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const atr14  = (() => {
      const trs = [];
      for (let i = 1; i < 15; i++) {
        const h  = market.ohlc.at(-i).high;
        const l  = market.ohlc.at(-i).low;
        const pc = market.ohlc.at(-i - 1)?.close ?? h;
        trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
      }
      return trs.reduce((a, b) => a + b, 0) / 14;
    })();

    const momPct = ((latest - sma20) / sma20 * 100).toFixed(2);
    const volPct = (atr14 / latest * 100).toFixed(2);

    const last10 = market.fills?.fills
      ? buildLast10ClosedFromRawFills(market.fills.fills, 10)
      : readLast10ClosedTradesFromFile();

    return `
    PF_XBTUSD Alpha Engine – 60-min cycle
You are a high-frequency statistical trader operating exclusively on the PF_XBTUSD perpetual contract.
Each 60-minute candle you emit exactly one JSON decision object.
You do not manage existing positions; you only propose the next intended trade (or cash).Output schema (mandatory, no extra keys):
{"signal":"LONG"|"SHORT"|"HOLD","confidence":0-100,"stop_loss_distance_in_usd":<positive_number>,"take_profit_distance_in_usd":<positive_number>,"reason":"<max_12_words>"}
You may place a concise reasoning paragraph above the JSON.  
The JSON object itself must still be the final, standalone block.
Hard constraints
 1. stop_loss_distance_in_usd
 • Compute 1.2 – 1.8 × 14-period ATR, round to nearest 0.5 USD, and return that absolute dollar value (e.g., 930.5).
 • Must be ≥ 0.5 USD. Never zero.
 2. take_profit_distance_in_usd
 • Compute 1.5 – 4 × the dollar value chosen for stop-loss, round to nearest 0.5 USD, and return that absolute dollar value (e.g., 2100.0).
 • Must be ≥ 1 USD. Never zero.
 3. confidence
 • 0–29: weak/no edge → HOLD.
 • 30–59: moderate edge.
 • 60–100: strong edge; only when momentum and order-flow agree.Decision logic (ranked)
A. Momentum filter
 • LONG only if (close > 20-SMA) AND (momentum > 0 %).
 • SHORT only if (close < 20-SMA) AND (momentum < 0 %).
 • Otherwise HOLD.
 B. Volatility regime
 • When ATR% < 0.8 %, widen TP/SL ratio toward 3.5.
 • When ATR% > 2 %, tighten TP/SL ratio toward 1.5.
 C. Micro-structure
 • If last10 net delta (buys-sells) > +500 contracts, raise confidence 10 pts for LONG, cut 10 pts for SHORT (reverse for negative delta).
 D. Risk symmetry
 • SL distance must be identical in absolute USD for LONG and SHORT signals of the same bar.
 Reason field
12-word max, e.g. “Long above SMA, bullish delta, SL 1500, TP 3800”.
Candles (720×1h): ${JSON.stringify(market.ohlc)}
Summary:
- lastClose=${latest}
- 20SMA=${sma20.toFixed(2)}
- momentum=${momPct}%
- 14ATR=${volPct}%

last10=${JSON.stringify(last10)}
`;
  }

  async generateSignal(marketData) {
    if (!marketData?.ohlc?.length) return this._fail('No OHLC');
    const prompt = this._prompt(marketData);
    const { ok, text } = await this._callWithRetry(prompt);
    try {
      return JSON.parse(text.match(/\{.*\}/s)?.[0]);
    } catch {
      return this._fail('Parse error');
    }
  }

  _fail(reason) {
    return { signal: 'HOLD', confidence: 0, stop_loss_distance_in_usd: 0, take_profit_distance_in_usd: 0, reason };
  }
}
