// scheduler.js
import { runOnce } from './runOnce.js';
import { loadContext } from './context.js';

const DEFAULT_INTERVAL_MINUTES = 5;

const startBot = async () => {
  console.log('Executing trading bot cycle...');
  
  try {
    // runOnce returns the AI's plan so we can read the waitTime.
    const plan = await runOnce();

    // The wait time can be set by the AI, otherwise, default to 5 minutes.
    const waitTimeInMinutes = plan?.nextCtx?.waitTime || DEFAULT_INTERVAL_MINUTES;

    const interval = waitTimeInMinutes * 60 * 1000;

    console.log(`Cycle complete. Waiting for ${waitTimeInMinutes} minutes before next run.`);
    setTimeout(startBot, interval);
  } catch (error) {
    console.error("An error occurred. The bot will restart after the default interval.", error);
    setTimeout(startBot, DEFAULT_INTERVAL_MINUTES * 60 * 1000);
  }
};

// Start the bot for the first time
startBot();

