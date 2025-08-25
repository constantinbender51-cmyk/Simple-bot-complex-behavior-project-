// executionHandler.js

import { log } from './logger.js';

/**
 * @class ExecutionHandler
 * @description Places a trade using an aggressive limit order for entry and a stop-limit for protection.
 */
export class ExecutionHandler {
    constructor(api) {
        if (!api) {
            throw new Error("ExecutionHandler requires an instance of the KrakenFuturesApi client.");
        }
        this.api = api;
        log.info("ExecutionHandler initialized.");
    }

    async placeOrder({ signal, pair, params, lastPrice }) {
        const { size, stopLoss, takeProfit } = params;

        if (!['LONG', 'SHORT'].includes(signal) || !pair || !size || !stopLoss || !takeProfit || !lastPrice) {
            throw new Error("Invalid trade details provided to ExecutionHandler, lastPrice is required.");
        }

        const entrySide = (signal === 'LONG') ? 'buy' : 'sell';
        const closeSide = (signal === 'LONG') ? 'sell' : 'buy';

        // Use an aggressive limit price for the entry order to simulate a market order.
        const entrySlippagePercent = 0.001; // 0.1%
        const entryLimitPrice = (signal === 'LONG')
            ? Math.round(lastPrice * (1 + entrySlippagePercent))
            : Math.round(lastPrice * (1 - entrySlippagePercent));

        // Create a stop-limit order for the stop-loss.
        const stopSlippagePercent = 0.01; // 1% slippage buffer
        const stopLimitPrice = (closeSide === 'sell')
            ? Math.round(stopLoss * (1 - stopSlippagePercent))
            : Math.round(stopLoss * (1 + stopSlippagePercent));

        log.info(`Preparing to place ${signal} order for ${size} BTC of ${pair}`);

        try {
            // Construct the stop-loss order with the required key order.
            const stopLossOrder = {
                order: 'send',
                order_tag: '2',
                orderType: 'stp',
                symbol: pair,
                side: closeSide,
                size: size,
                limitPrice: stopLimitPrice, // Required for the order to be accepted
                stopPrice: stopLoss,
                reduceOnly: true
            };

            const batchOrderPayload = {
                batchOrder: [
                    // 1. The Main Entry Order (Aggressive Limit)
                    {
                        order: 'send',
                        order_tag: '1',
                        orderType: 'lmt',
                        symbol: pair,
                        side: entrySide,
                        size: size,
                        limitPrice: entryLimitPrice,
                    },
                    // 2. The Stop-Loss Order (Stop-Limit)
                    stopLossOrder,
                    // 3. The Take-Profit Order (Limit Order)
                    {
                        order: 'send',
                        order_tag: '3',
                        orderType: 'lmt',
                        symbol: pair,
                        side: closeSide,
                        size: size,
                        limitPrice: takeProfit,
                        reduceOnly: true
                    }
                ]
            };

            log.info(`Reverting to working Batch Order (Aggressive LMT Entry): ${JSON.stringify(batchOrderPayload, null, 2)}`);

            const response = await this.api.batchOrder({ json: JSON.stringify(batchOrderPayload) });

            log.info(`Batch Order Response Received: ${JSON.stringify(response, null, 2)}`);

            if (response.result === 'success') {
                log.info("✅ Successfully placed batch order!");
            } else {
                log.error("❌ Failed to place batch order.", response);
            }

            return response;

        } catch (error) {
            log.error("❌ CRITICAL ERROR in ExecutionHandler during order placement:", error);
            throw error;
        }
    }
}
