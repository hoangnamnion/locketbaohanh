import { redisSet, isRedisConfigured } from './redis.js';

function generateShortId(length = 4) {
  const chars = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { name, durationMinutes, type = '10s' } = req.body || {};
  const cleanName = String(name || '').trim();

  if (!cleanName) {
    return res.status(400).json({ error: 'Vui lòng nhập tên khách hàng' });
  }

  const minutes = parseInt(durationMinutes, 10) || 15;
  const ttlSeconds = minutes * 60;
  const exp = Date.now() + ttlSeconds * 1000;

  const shortId = generateShortId(4);

  const payload = {
    id: shortId,
    name: cleanName,
    type,
    exp,
    devices: []
  };

  let savedToRedis = false;

  if (isRedisConfigured()) {
    try {
      await redisSet(`link:${shortId}`, payload, ttlSeconds);
      savedToRedis = true;
    } catch (e) {
      console.error('Lỗi lưu Redis:', e);
    }
  }

  // Luôn tạo fallback Base64 data để hệ thống chạy 100% không bao giờ gián đoạn
  const fallbackPayload = {
    id: shortId,
    name: cleanName,
    type,
    exp,
    devices: []
  };
  const encoded = Buffer.from(JSON.stringify(fallbackPayload)).toString('base64');

  res.json({
    id: shortId,
    name: cleanName,
    exp,
    savedToRedis,
    data: encoded
  });
}