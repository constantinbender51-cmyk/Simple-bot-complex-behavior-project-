// index.js
import { runOnce } from './runOnce.js';
const MINUTES = 5;
setInterval(runOnce, MINUTES * 60 * 1000);
runOnce(); // immediate first run
