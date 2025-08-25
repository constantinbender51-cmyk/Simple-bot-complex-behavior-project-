// scheduler.js
import { runOnce } from './runOnce.js';
import { loadContext } from './context.js';

const DEFAULT_INTERVAL_MINUTES = 5;

const startBot = async () => {
  console.log('Executing trading bot cycle...');
  
  // runOnce now needs to return the AI's plan so we can read the waitTime.
  const plan = await runOnce();

  // Get the interval from the AI's plan, defaulting to our constant.
  const interval = (plan?.nextCtx?.waitTime || DEFAULT_INTERVAL_MINUTES) * 60 * 1000;

  console.log(`Cycle complete. Waiting for ${interval / 60_000} minutes before next run.`);
  setTimeout(startBot, interval);
};

// Start the bot for the first time
startBot();

