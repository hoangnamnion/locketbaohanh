// Module kết nối Vercel KV / Upstash Redis thông qua Fetch REST API (Không cần cài thêm thư viện nặng)
const REST_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export async function redisCommand(command, ...args) {
  if (!REST_URL || !REST_TOKEN) {
    return null;
  }

  const endpoint = `${REST_URL.replace(/\/$/, '')}/${command}/${args.map(a => encodeURIComponent(typeof a === 'object' ? JSON.stringify(a) : a)).join('/')}`;

  try {
    const res = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${REST_TOKEN}`
      }
    });

    if (!res.ok) {
      console.error('Redis error response:', res.status, await res.text());
      return null;
    }

    const data = await res.json();
    return data.result;
  } catch (err) {
    console.error('Redis fetch error:', err);
    return null;
  }
}

export async function redisGet(key) {
  const result = await redisCommand('get', key);
  if (!result) return null;
  try {
    return JSON.parse(result);
  } catch {
    return result;
  }
}

export async function redisSet(key, value, ttlSeconds = 900) {
  const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (ttlSeconds && ttlSeconds > 0) {
    return await redisCommand('setex', key, ttlSeconds, stringValue);
  }
  return await redisCommand('set', key, stringValue);
}

export async function redisDel(key) {
  return await redisCommand('del', key);
}

export function isRedisConfigured() {
  return !!(REST_URL && REST_TOKEN);
}
