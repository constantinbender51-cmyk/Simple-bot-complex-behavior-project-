import { kv } from './redis.js';
import { log } from './logger.js';
import KrakenFuturesApi from './krakenApi.js';

const SIM_ACCOUNT_KEY = 'sim_account_state';
const PAIR = 'PF_XBTUSD';

// The simulated API will extend the real one to inherit market data fetching, but override trading functions.
export default class SimulatedKrakenApi extends KrakenFuturesApi {
    constructor(key, secret) {
        super(key, secret);
        this.state = {
            balance: 1000,
            positions: [],
            events: [],
            journal: [],
            lastTradeId: 0,
            markPrice: 0, // Store the last known mark price
        };
    }

    async init() {
        const savedState = await kv.get(SIM_ACCOUNT_KEY);
        if (savedState) {
            this.state = JSON.parse(savedState);
            log.info('📈 Loaded simulated account state from Redis.');
        } else {
            await this.saveState();
            log.info('🆕 Initialized new simulated account with $1000.');
        }
    }

    async saveState() {
        await kv.set(SIM_ACCOUNT_KEY, JSON.stringify(this.state));
    }

    // Override the getTickers method to update the mark price in the simulated state
    async getTickers() {
        const tickers = await super.getTickers();
        const ticker = tickers.tickers.find(t => t.symbol === PAIR);
        if (ticker) {
            this.state.markPrice = +ticker.markPrice;
        }
        return tickers;
    }

    // Override to get positions from the simulated state
    async getOpenPositions() {
        return { openPositions: this.state.positions };
    }

    // Override to get account details from the simulated state
    async getAccounts() {
        return {
            accounts: {
                flex: {
                    availableMargin: this.state.balance
                }
            }
        };
    }

    // Override to get position events from the simulated state, filtered by timestamp
    async getPositionEvents({ since }) {
        const timestampInMillis = since ? since * 1000 : 0;
        const newEvents = this.state.events.filter(event => event.timestamp > timestampInMillis);
        return { elements: newEvents };
    }

    // Override the sendOrder method with a simulated execution logic
    async sendOrder({ orderType, symbol, side, size }) {
        if (symbol !== PAIR || orderType !== 'mkt') {
            log.error('❌ Only market orders for XBTUSD are supported in simulation.');
            return;
        }

        const sizeInBTC = +size;
        const currentPrice = this.state.markPrice;
        const tradeValue = sizeInBTC * currentPrice;

        if (this.state.balance < tradeValue) {
            log.warn('⚠️ Insufficient margin for this trade.');
            return;
        }

        const currentPosition = this.state.positions.find(p => p.symbol === PAIR) || null;
        let newPosition = currentPosition ? { ...currentPosition } : null;

        const timestamp = Date.now();
        const tradeId = ++this.state.lastTradeId;

        // Simulate trade execution
        let newRealizedPnl = 0;
        let oldPositionSize = 0;
        let oldAverageEntryPrice = 0;
        let tradeReason = null;
        
        // Handle opening, closing, or reversing position
        if (newPosition) {
            oldPositionSize = newPosition.size;
            oldAverageEntryPrice = newPosition.averageEntryPrice;

            // This is a partial or full close
            const closeSize = side === newPosition.side ? 0 : Math.min(Math.abs(sizeInBTC), +newPosition.size);
            if (closeSize > 0) {
                const pnl = closeSize * (currentPrice - oldAverageEntryPrice) * (newPosition.side === 'long' ? 1 : -1);
                newRealizedPnl = pnl;
                newPosition.size -= closeSize;
                this.state.balance += newRealizedPnl;
                tradeReason = 'trade';

                // If position is fully closed, remove it
                if (newPosition.size <= 0.00000001) {
                    this.state.positions = [];
                    newPosition = null;
                    tradeReason = 'trade';
                }
            }
            
            // This is scaling in or a reversal.
            if (sizeInBTC > closeSize) {
                const remainingSize = sizeInBTC - closeSize;
                const totalPositionValue = (newPosition ? newPosition.size * newPosition.averageEntryPrice : 0) + remainingSize * currentPrice;
                const totalSize = (newPosition ? newPosition.size : 0) + remainingSize;
                
                if (totalSize > 0) {
                    const side = newPosition?.side || (sizeInBTC > 0 ? 'long' : 'short');
                    newPosition = {
                        symbol: PAIR,
                        side,
                        size: totalSize,
                        averageEntryPrice: totalPositionValue / totalSize,
                        unrealizedPnL: 0, // This is calculated on the fly
                    };
                    tradeReason = 'trade';
                    if (newPosition.side !== side) {
                        newPosition.unrealizedPnL = (currentPrice - oldAverageEntryPrice) * oldPositionSize * (newPosition.side === 'long' ? 1 : -1);
                    }
                } else {
                    this.state.positions = [];
                }
            }

        } else {
            // Opening a new position from idle
            if (sizeInBTC > 0) {
                 newPosition = {
                    symbol: PAIR,
                    side: side,
                    size: sizeInBTC,
                    averageEntryPrice: currentPrice,
                    unrealizedPnL: 0
                };
                tradeReason = 'trade';
            }
        }
        
        if (newPosition) {
            newPosition.unrealizedPnL = (currentPrice - newPosition.averageEntryPrice) * newPosition.size * (newPosition.side === 'long' ? 1 : -1);
            this.state.positions = [newPosition];
        }

        // Add event to the journal
        if (tradeReason) {
            const positionUpdateEvent = {
                timestamp: timestamp,
                event: {
                    PositionUpdate: {
                        tradeable: PAIR,
                        updateReason: tradeReason,
                        positionChange: oldPositionSize > (newPosition?.size || 0) ? 'close' : 'open',
                        realizedPnL: newRealizedPnl.toFixed(2),
                        oldPosition: oldPositionSize > 0 ? (newPosition?.side || '') : '',
                        oldAverageEntryPrice: oldAverageEntryPrice,
                        executionPrice: currentPrice,
                    }
                }
            };
            this.state.events.push(positionUpdateEvent);
        }

        await this.saveState();
        log.info(`✅ SIMULATION: Order executed. New balance: $${this.state.balance.toFixed(2)}, Position: ${newPosition ? newPosition.size : 0} ${newPosition ? newPosition.side : ''}`);
    }
}
