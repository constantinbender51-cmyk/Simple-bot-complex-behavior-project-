// krakenApi.js
import crypto from 'crypto';
import axios from 'axios';
import qs from 'querystring';
import { log } from './logger.js';

const BASE_URL = 'https://demo-futures.kraken.com';

export class KrakenFuturesApi {
  constructor(apiKey, apiSecret) {
    if (!apiKey || !apiSecret) throw new Error('API key & secret required');
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.baseUrl = BASE_URL;
    this.nonceCtr = 0;
  }

  _nonce() {
    if (++this.nonceCtr > 9999) this.nonceCtr = 0;
    return Date.now() + this.nonceCtr.toString().padStart(5, '0');
  }

  _sign(endpoint, nonce, postData) {
    const path = endpoint.replace('/derivatives', '');
    const hash = crypto.createHash('sha256')
                   .update(postData + nonce + path).digest();
    return crypto.createHmac('sha512', Buffer.from(this.apiSecret, 'base64'))
                 .update(hash).digest('base64');
  }

  async _request(method, endpoint, params = {}) {
    const nonce = this._nonce();
    let postData = '';
    let query = '';

    if (method === 'POST') {
      postData = qs.stringify(params);
    } else if (method === 'GET' && Object.keys(params).length) {
      query = '?' + qs.stringify(params);
      postData = qs.stringify(params);
    }

    const headers = {
      APIKey: this.apiKey,
      Nonce: nonce,
      Authent: this._sign(endpoint, nonce, postData),
      'User-Agent': 'TradingBot/1.0'
    };
    if (method === 'POST') headers['Content-Type'] = 'application/x-www-form-urlencoded';

    const url = this.baseUrl + endpoint + query;
    
    // Add debug logging for the final URL
    log.debug(`[${method} ${endpoint}] Sending request to URL: ${url}`);
    if (method === 'POST') {
      log.debug(`[${method} ${endpoint}] POST Data: ${postData}`);
    }

    try {
      const { data } = await axios({ method, url, headers, data: postData });
      return data;
    } catch (e) {
      const info = e.response?.data || { message: e.message };
      throw new Error(`[${method} ${endpoint}] ${JSON.stringify(info)}`);
    }
  }

  getInstruments = () => this._request('GET', '/derivatives/api/v3/instruments');
  getTickers = () => this._request('GET', '/derivatives/api/v3/tickers');
  getOrderbook = p => this._request('GET', '/derivatives/api/v3/orderbook', p);
  getHistory = p => this._request('GET', '/derivatives/api/v3/history', p);
  getAccounts = () => this._request('GET', '/derivatives/api/v3/accounts');
  getOpenOrders = () => this._request('GET', '/derivatives/api/v3/openorders');
  getOpenPositions = () => this._request('GET', '/derivatives/api/v3/openpositions');
  getRecentOrders = p => this._request('GET', '/derivatives/api/v3/recentorders', p);
  
  /**
   * Fetches executed fills.
   * This replaces getPositionEvents for tracking closed trades and PnL.
   * @param {object} p - Parameters for the request.
   * @param {number} [p.lastFillTime] - The timestamp in milliseconds of the last fill to fetch from.
   * @returns {Promise<object>}
   */
  async getFills(p = {}) {
    // The Kraken API expects `lastFillTime` as a parameter. We'll pass it directly.
    const result = await this._request('GET', '/derivatives/api/v3/fills', p);
    return result;
  }
  
  getTransfers = p => this._request('GET', '/derivatives/api/v3/transfers', p);
  getNotifications = () => this._request('GET', '/derivatives/api/v3/notifications');
  sendOrder = p => this._request('POST', '/derivatives/api/v3/sendorder', p);
  editOrder = p => this._request('POST', '/derivatives/api/v3/editorder', p);
  cancelOrder = p => this._request('POST', '/derivatives/api/v3/cancelorder', p);
  cancelAllOrders = p => this._request('POST', '/derivatives/api/v3/cancelallorders', p);
  cancelAllOrdersAfter = p => this._request('POST', '/derivatives/api/v3/cancelallordersafter', p);
  batchOrder = p => this._request('POST', '/derivatives/api/v3/batchorder', p);

  async fetchKrakenData({ pair = 'XBTUSD', interval = 60, since } = {}) {
    const params = { pair, interval };
    if (since) params.since = since;
    const { data } = await axios.get('https://api.kraken.com/0/public/OHLC', { params });
    if (data.error?.length) throw new Error(data.error.join(', '));
    const key = Object.keys(data.result).find(k => k !== 'last');
    return (data.result[key] || []).map(o => ({
      date: +o[0], open: +o[1], high: +o[2], low: +o[3], close: +o[4], volume: +o[6]
    }));
  }
}

export default KrakenFuturesApi;
