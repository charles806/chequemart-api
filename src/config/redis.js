let redis = null;

try {
  const { default: Redis } = await import('ioredis');
  if (process.env.REDIS_URL) {
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 50, 2000),
      lazyConnect: true,
    });
    redis.on('error', (err) => console.warn('Redis:', err.message));
  }
} catch (err) {
  console.warn('Redis not available (optional)');
}

export const getCache = async (key) => {
  if (!redis) return null;
  try {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch { return null; }
};

export const setCache = async (key, data, ttl = 300) => {
  if (!redis) return;
  try { await redis.setex(key, ttl, JSON.stringify(data)); } catch {}
};

export const invalidateCache = async (pattern) => {
  if (!redis) return;
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) await redis.del(...keys);
  } catch {}
};

export default redis;
