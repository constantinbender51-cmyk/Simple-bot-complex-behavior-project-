// fetch_data.js

import axios from 'axios';
import fs from 'fs';
import { Parser } from 'json2csv';
import { log } from './logger.js';

// --- Configuration ---
const BINANCE_PAIR = 'BTCUSDT'; // Binance uses 'USDT'
const KRAKEN_PAIR_FILENAME = 'XBTUSD'; // We'll still name the file for Kraken
const INTERVAL = '1h'; // Binance uses '1h' for 1-hour
const OUTPUT_FILE = `./data/${KRAKEN_PAIR_FILENAME}_60m_data.csv`;
const START_DATE = '2022-01-01T00:00:00Z';
const BATCH_SIZE = 1000; // Binance allows up to 1000 candles per request

/**
 * Fetches a batch of OHLC data from Binance.
 * @param {string} symbol - The trading pair (e.g., 'BTCUSDT').
 * @param {string} interval - The candle interval (e.g., '1h').
 * @param {number} startTime - The timestamp to start fetching from (in milliseconds).
 * @param {number} limit - The number of candles to fetch.
 * @returns {Promise<Array<object>>} A promise that resolves to an array of formatted candles.
 */
async function fetchBinanceOHLC(symbol, interval, startTime, limit) {
    const url = 'https://api.binance.com/api/v3/klines';
    const params = { symbol, interval, startTime, limit };
    try {
        const response = await axios.get(url, { params });
        // Binance returns an array of arrays, so we format it.
        return response.data.map(kline => ({
            timestamp: Math.floor(kline[0] / 1000), // Convert ms to s
            open: parseFloat(kline[1]),
            high: parseFloat(kline[2]),
            low: parseFloat(kline[3]),
            close: parseFloat(kline[4]),
            volume: parseFloat(kline[5]),
        }));
    } catch (error) {
        log.error(`Failed to fetch Binance OHLC data. ${error.message}`);
        throw error;
    }
}

/**
 * Main function to paginate through the Binance API and save all data.
 */
async function fetchAllHistoricalData() {
    
    let allCandles = [];
    let startTime = new Date(START_DATE).getTime();
    const endTime = Date.now(); // Fetch up to the current time

    while (startTime < endTime) {
        
        try {
            const candles = await fetchBinanceOHLC(BINANCE_PAIR, INTERVAL, startTime, BATCH_SIZE);

            if (candles.length === 0) {
                break;
            }

            allCandles.push(...candles);

            // The next request starts after the last candle we received.
            startTime = candles[candles.length - 1].timestamp * 1000 + 1; // Move to the next millisecond

            // Be respectful to the API
            await new Promise(resolve => setTimeout(resolve, 500)); // 0.5-second delay is fine for Binance

        } catch (error) {
            log.error("Stopping fetch loop due to an error.");
            break;
        }
    }

    if (allCandles.length > 0) {
        const uniqueCandles = Array.from(new Map(allCandles.map(c => [c.timestamp, c])).values());
        log.info(`Removed ${allCandles.length - uniqueCandles.length} duplicate candles.`);

        if (!fs.existsSync('./data')) {
            fs.mkdirSync('./data');
        }
        const json2csvParser = new Parser({ fields: ["timestamp", "open", "high", "low", "close", "volume"] });
        const csv = json2csvParser.parse(uniqueCandles);
        fs.writeFileSync(OUTPUT_FILE, csv);
    }
}

fetchAllHistoricalData().catch(err => {
    log.info("Data fetching process finished.");
});
