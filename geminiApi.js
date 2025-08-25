import { GoogleGenerativeAI } from '@google/generative-ai';
const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
              .getGenerativeModel({ model: 'gemini-1.5-flash' });

export async function think({ price, margin, position, ohlc, ctx }) {
  const prompt = `
UTC: ${new Date().toISOString()}
price:${price} margin:${margin} pos:${JSON.stringify(position)}
last10:${JSON.stringify(ohlc.slice(-10))}
ctx:${JSON.stringify(ctx)}
Return JSON: {side:"buy"|"sell"|null,size,nextCtx:{},reason:"≤30w"}
`;
  const raw = (await model.generateContent(prompt)).response.text();
  console.log('🧠 AI:', raw);
  return JSON.parse(raw.match(/\{[\s\S]*\}/)[0]);
}
