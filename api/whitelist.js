import { redisGet, redisSet, redisDel, isRedisConfigured } from './redis.js';

const WORKER_URL = 'https://locketgold.caovannamutt.workers.dev/';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 1. GET: Lấy toàn bộ danh sách Whitelist
  if (req.method === 'GET') {
    if (!isRedisConfigured()) {
      return res.json({ success: true, list: [], isRedis: false });
    }

    try {
      const keysList = await redisGet('locket_whitelist_index') || [];
      const items = [];

      for (const username of keysList) {
        const item = await redisGet(`whitelist:${username.toLowerCase()}`);
        if (item) {
          items.push(item);
        }
      }

      return res.json({ success: true, list: items, isRedis: true });
    } catch (e) {
      console.error('Lỗi lấy whitelist:', e);
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  // 2. POST: Thêm username mới vào Whitelist
  if (req.method === 'POST') {
    const { username, note } = req.body || {};
    const cleanUser = String(username || '').toLowerCase().trim();

    if (!cleanUser) {
      return res.status(400).json({ success: false, error: 'Vui lòng nhập username' });
    }

    if (!isRedisConfigured()) {
      return res.status(500).json({ success: false, error: 'Chưa cấu hình KV Cloud Database' });
    }

    try {
      // Gọi worker lấy info trước để lấy tên & avatar cho đẹp
      let userInfo = { name: cleanUser, avatar: '' };
      try {
        const infoRes = await fetch(WORKER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'info', username: cleanUser })
        });
        const infoData = await infoRes.json();
        if (infoData.success) {
          userInfo = {
            name: infoData.name || cleanUser,
            avatar: infoData.avatar || '',
            uid: infoData.uid || ''
          };
        }
      } catch (err) {
        console.log('Worker info lookup error:', err);
      }

      const itemPayload = {
        username: cleanUser,
        name: userInfo.name || cleanUser,
        avatar: userInfo.avatar || '',
        uid: userInfo.uid || '',
        status: 'pending', // 'pending' (chờ kích) | 'activated' (đã kích)
        note: note || 'Khách VIP',
        addedAt: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
        activatedAt: null
      };

      // Lưu chi tiết từng user (lưu vĩnh viễn không hết hạn)
      await redisSet(`whitelist:${cleanUser}`, itemPayload, 0);

      // Cập nhật danh sách index
      let keysList = await redisGet('locket_whitelist_index') || [];
      if (!keysList.includes(cleanUser)) {
        keysList.unshift(cleanUser);
        await redisSet('locket_whitelist_index', keysList, 0);
      }

      return res.json({ success: true, item: itemPayload });
    } catch (e) {
      console.error('Lỗi thêm whitelist:', e);
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  // 3. DELETE: Xóa username khỏi Whitelist
  if (req.method === 'DELETE') {
    const { username } = req.body || {};
    const cleanUser = String(username || '').toLowerCase().trim();

    if (!cleanUser) {
      return res.status(400).json({ success: false, error: 'Thiếu username cần xóa' });
    }

    try {
      await redisDel(`whitelist:${cleanUser}`);

      let keysList = await redisGet('locket_whitelist_index') || [];
      keysList = keysList.filter(u => u !== cleanUser);
      await redisSet('locket_whitelist_index', keysList, 0);

      return res.json({ success: true, message: 'Đã xóa thành công' });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
