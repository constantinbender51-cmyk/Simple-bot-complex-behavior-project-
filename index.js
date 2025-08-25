import { runOnce } from './runOnce.js';
const MINUTES = 5;
setInterval(runOnce, MINUTES * 60_000);
runOnce(); // first run immediately
