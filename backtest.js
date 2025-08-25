// backtest.js

// --- FIX: Added import statements ---
import { BacktestRunner } from './backtestRunner.js';
import { ensureDataFileExists } from './dataFetcher.js';
import { log } from './logger.js';

// --- Configuration ---
const config = {
    DATA_FILE_PATH: './data/XBTUSD_60m_data.csv',
    INITIAL_BALANCE: 10000,
    MINIMUM_CONFIDENCE_THRESHOLD: 0,
    MIN_SECONDS_BETWEEN_CALLS: 10,
    MAX_API_CALLS: 200,
    DATA_WINDOW_SIZE: 720,
    WARMUP_PERIOD: 720
};

async function main() {
    try {
        await ensureDataFileExists(config.DATA_FILE_PATH);
        const runner = new BacktestRunner(config);
        await runner.run();
    } catch (error) {
        log.error("A critical error occurred during the backtest process:", error);
    }
}

main();
