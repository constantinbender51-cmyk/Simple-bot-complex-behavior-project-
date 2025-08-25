// logger.js  (no date-fns)
import fs from 'fs';
import path from 'path';

const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);

const humanLog = path.join(logDir, 'trading-bot.log');
const jsonLog  = path.join(logDir, 'metrics.ndjson');

class Logger {
  _write(level, msg, extra = {}) {
    const ts = new Date().toISOString();
    const line = `[${ts}] [${level.padEnd(5)}] ${msg}`;
    console.log(line);
    fs.appendFileSync(humanLog, line + '\n');

    if (Object.keys(extra).length) {
      fs.appendFileSync(
        jsonLog,
        JSON.stringify({ ts, level, msg, ...extra }) + '\n'
      );
    }
  }

  info(msg, extra)  { this._write('INFO',  msg, extra); }
  warn(msg, extra)  { this._write('WARN',  msg, extra); }
  error(msg, err)   {
    const extra = err ? { error: err.message, stack: err.stack } : {};
    this._write('ERROR', msg, extra);
  }

  metric(metric, value, unit = '', tags = {}) {
    this._write('METRIC', `${metric} = ${value} ${unit}`, { metric, value, unit, ...tags });
  }
}

export const log = new Logger();
