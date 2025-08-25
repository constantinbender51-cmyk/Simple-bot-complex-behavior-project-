// backtestDataHandler.js

import fs from 'fs';
import { parse } from 'csv-parse/sync';
import { log } from './logger.js';

// --- FIX: Added export statement ---
export class BacktestDataHandler {
    constructor(pathToCsv) {
        try {
            const fileContent = fs.readFileSync(pathToCsv, { encoding: 'utf-8' });
            this.allOhlcData = parse(fileContent, { columns: true, cast: true });
        } catch (error) {
            log.error(`[BACKTEST] Failed to read or parse the CSV file at ${pathToCsv}`, error);
            throw new Error("Could not initialize backtest data.");
        }
    }

    getAllCandles() {
        return this.allOhlcData;
    }
}
