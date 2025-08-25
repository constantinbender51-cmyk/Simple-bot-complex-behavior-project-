import { BacktestExecutionHandler } from './backtestExecutionHandler.js';
import { StrategyEngine } from './strategyEngine.js';

async function analyzeTrades() {
  const executionHandler = new BacktestExecutionHandler(10000); // dummy balance
  const trades = JSON.parse(fs.readFileSync('./trades.json', 'utf8'));


  const strategyEngine = new StrategyEngine(); // reuse or new instance

  const prompt = buildPrompt(trades);
  const { text } = await strategyEngine._callWithRetry(prompt);

  const analysis = JSON.parse(text.match(/\{.*\}/s)[0]);
  console.log("--- AI Trade Analysis ---");
  console.log(JSON.stringify(analysis, null, 2));
}
