import axios from 'axios';

const BASE_SPOT = 'https://api.kraken.com/0/public';
export const marketApi = {
  async ohlc(pair = 'XBTUSD', interval = 5, count = 400) {
    const since = Math.floor(Date.now() / 1000 - interval * 60 * count);
    const { data } = await axios.get(`${BASE_SPOT}/OHLC`, {
      params: { pair, interval, since }
    });
    const key = Object.keys(data.result).find(k => k !== 'last');
    return (data.result[key] || []).map(o => ({
      t: o[0], o: +o[1], h: +o[2], l: +o[3], c: +o[4], v: +o[6]
    }));
  },
  async ticker(pair = 'XBTUSD') {
    const { data } = await axios.get(`${BASE_SPOT}/Ticker`, { params: { pair } });
    const key = Object.keys(data.result)[0];
    return { price: +data.result[key].c[0] };
  }
};
