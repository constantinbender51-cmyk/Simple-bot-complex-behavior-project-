import { createClient } from 'redis';
export const kv = createClient({ url: process.env.REDIS_URL });
kv.on('error', console.error);
await kv.connect();   // top-level await in ES module
