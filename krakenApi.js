// krakenApi.js – minimal Kraken Futures REST client
import crypto  from 'crypto';
import axios   from 'axios';
import qs      from 'querystring';
import { log } from './logger.js';

let nonceOffset = 0;       // module-level counter

const BASE_URL = 'https://futures.kraken.com';

export class KrakenFuturesApi {
  constructor(apiKey, apiSecret) {
    if (!apiKey || !apiSecret) throw new Error('Missing Kraken Futures credentials');
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
  }

  /* ---------- internal ---------- */

  _nonce() {
    const base = Date.now() * 1000;   // micro-second-ish
    return (base + (++nonceOffset)).toString();
  }

  _sign(path, nonce, post) {
    const hash = crypto.createHash('sha256')
                       .update(post + nonce + path).digest();
    return crypto.createHmac('sha512', Buffer.from(this.apiSecret, 'base64'))
                 .update(hash).digest('base64');
  }

  async _request(method, endpoint, params = {}) {
    const nonce = this._nonce();
    const post  = method === 'POST' ? qs.stringify(params) : '';
    const query = method === 'GET' && Object.keys(params).length
                  ? '?' + qs.stringify(params) : '';
    const url   = BASE_URL + endpoint + query;

    const headers = {
      APIKey: this.apiKey,
      Nonce: nonce,
      Authent: this._sign(endpoint, nonce, post),
      'User-Agent': 'sbcb/1.0'
    };
    if (method === 'POST') headers['Content-Type'] = 'application/x-www-form-urlencoded';

    try {
      const { data } = await axios({ method, url, headers, data: post });
      if (data.result !== 'success') throw new Error(JSON.stringify(data));
      return data;
    } catch (err) {
      log.error(`[KrakenApi] ${method} ${endpoint} failed:`, err.message);
      throw err;
    }
  }

  /* ---------- public endpoints ---------- */
  getTickers = () => this._request('GET', '/derivatives/api/v3/tickers');
  getHistory = params => this._request('GET', '/derivatives/api/v3/history', params);

  /* ---------- private endpoints ---------- */
  getAccounts      = () => this._request('GET', '/derivatives/api/v3/accounts');
  getOpenPositions = () => this._request('GET', '/derivatives/api/v3/openpositions');
  getFills         = params => this._request('GET', '/derivatives/api/v3/fills', params);
  sendOrder        = params => this._request('POST', '/derivatives/api/v3/sendorder', params);
}

export default KrakenFuturesApi;
