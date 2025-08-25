// krakenApi.js – minimal Kraken Futures REST client
import crypto from 'crypto';
import axios from 'axios';
import qs from 'querystring';

const SPOT_OHLC_URL = 'https://api.kraken.com/0/public/OHLC';
const BASE_URL      = 'https://futures.kraken.com';

export class KrakenFuturesApi {
  constructor(apiKey, apiSecret, baseUrl = BASE_URL) {
    if (!apiKey || !apiSecret) throw new Error('API key & secret required');
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.baseUrl = baseUrl;
    this.nonceCtr = 0;
  }

  /* ---------- internal helpers ---------- */
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
    const nonce   = this._nonce();
    const post    = method === 'POST' ? qs.stringify(params) : '';
    const query   = method === 'GET'  && Object.keys(params).length
                  ? '?' + qs.stringify(params) : '';

    const headers = {
      APIKey:  this.apiKey,
      Nonce:   nonce,
      Authent: this._sign(endpoint, nonce, post),
      'User-Agent': 'TradingBot/1.0'
    };
    if (method === 'POST') headers['Content-Type'] = 'application/x-www-form-urlencoded';

    const url = this.baseUrl + endpoint + query;

    try {
      const { data } = await axios({ method, url, headers, data: post });
      return data;
    } catch (e) {
      const info = e.response?.data || { message: e.message };
      throw new Error(`[${method} ${endpoint}] ${JSON.stringify(info)}`);
    }
  }

  /* ---------- public endpoints ---------- */
  getInstruments      = () => this._request('GET', '/derivatives/api/v3/instruments');
  getTickers          = () => this._request('GET', '/derivatives/api/v3/tickers');
  getOrderbook        = p => this._request('GET', '/derivatives/api/v3/orderbook', p);
  getHistory          = p => this._request('GET', '/derivatives/api/v3/history', p);

  /* ---------- private endpoints ---------- */
  getAccounts         = () => this._request('GET', '/derivatives/api/v3/accounts');
  getOpenOrders       = () => this._request('GET', '/derivatives/api/v3/openorders');
  getOpenPositions    = () => this._request('GET', '/derivatives/api/v3/openpositions');
  getRecentOrders     = p => this._request('GET', '/derivatives/api/v3/recentorders', p);
  getFills            = p => this._request('GET', '/derivatives/api/v3/fills', p);
  getTransfers        = p => this._request('GET', '/derivatives/api/v3/transfers', p);
  getNotifications    = () => this._request('GET', '/derivatives/api/v3/notifications');

  sendOrder           = p => this._request('POST', '/derivatives/api/v3/sendorder', p);
  editOrder           = p => this._request('POST', '/derivatives/api/v3/editorder', p);
  cancelOrder         = p => this._request('POST', '/derivatives/api/v3/cancelorder', p);
  cancelAllOrders     = p => this._request('POST', '/derivatives/api/v3/cancelallorders', p);
  cancelAllOrdersAfter= p => this._request('POST', '/derivatives/api/v3/cancelallordersafter', p);
  batchOrder          = p => this._request('POST', '/derivatives/api/v3/batchorder', p);

  /* ---------- spot OHLC (unauthenticated) ---------- */
  async fetchKrakenData({ pair = 'XBTUSD', interval = 60, since } = {}) {
    const params = { pair, interval };
    if (since) params.since = since;

    try {
      const { data } = await axios.get(SPOT_OHLC_URL, { params });
      if (data.error?.length) throw new Error(data.error.join(', '));

      const key = Object.keys(data.result).find(k => k !== 'last');
      return (data.result[key] || []).map(o => ({
        date:  new Date(o[0] * 1000).toISOString(),
        open:  +o[1], high: +o[2], low: +o[3], close: +o[4], volume: +o[6]
      }));
    } catch (e) {
      console.error('fetchKrakenData error:', e.message);
      return null;
    }
  }
}

export default KrakenFuturesApi;
