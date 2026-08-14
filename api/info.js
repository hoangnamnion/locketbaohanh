import { redisGet, isRedisConfigured } from './redis.js';

export default async function handler(req, res) {
  const { id, data } = req.query || {};

  // 1. Kiểm tra theo Short ID trong Redis
  if (id && isRedisConfigured()) {
    try {
      const redisData = await redisGet(`link:${id}`);
      if (redisData) {
        if (Date.now() > redisData.exp) {
          return res.status(410).json({ error: 'Liên kết đã hết hạn' });
        }
        return res.json({
          id: redisData.id || id,
          name: redisData.name,
          exp: redisData.exp,
          type: redisData.type || '10s'
        });
      }
    } catch (e) {
      console.error('Lỗi đọc Redis info:', e);
    }
  }

  // 2. Fallback kiểm tra theo Base64 data
  if (data) {
    try {
      const decoded = JSON.parse(Buffer.from(data, 'base64').toString());
      if (Date.now() > decoded.exp) {
        return res.status(410).json({ error: 'Liên kết đã hết hạn' });
      }
      return res.json({
        id: decoded.id || id,
        name: decoded.name,
        exp: decoded.exp,
        type: decoded.type || '10s'
      });
    } catch {
      return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
    }
  }

  return res.status(404).json({ error: 'Link không tồn tại hoặc đã hết hạn' });
}
