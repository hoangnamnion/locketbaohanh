import { redisGet, redisSet, isRedisConfigured } from './redis.js';

const WORKER_URL = 'https://locketgold.caovannamutt.workers.dev/';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { username, forceAdmin = false } = req.body || {};
  const cleanUser = String(username || '').toLowerCase().trim();

  if (!cleanUser) {
    return res.status(400).json({ success: false, error: 'Vui lòng nhập username Locket' });
  }

  // 1. Kiểm tra Whitelist trên KV Database (Nếu không phải admin force kick)
  let whitelistItem = null;

  if (!forceAdmin) {
    if (isRedisConfigured()) {
      try {
        whitelistItem = await redisGet(`whitelist:${cleanUser}`);
      } catch (e) {
        console.error('Lỗi đọc whitelist KV:', e);
      }

      // NẾU KHÔNG CÓ TRONG DANH SÁCH DUYỆT
      if (!whitelistItem) {
        return res.status(403).json({
          success: false,
          notInWhitelist: true,
          error: 'ib qua admin hoặc mua gói đi đừng có ăn gian nhé bé yêu'
        });
      }

      // NẾU ĐÃ KÍCH TRƯỚC ĐÓ RỒI
      if (whitelistItem.status === 'activated') {
        return res.status(400).json({
          success: false,
          alreadyActivated: true,
          error: `Tài khoản @${cleanUser} đã được kích hoạt Gold thành công trước đó rồi nhé!`
        });
      }
    }
  }

  // 2. Gọi Cloudflare Worker API để thực hiện Kích Gold
  try {
    const workerRes = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'kick', username: cleanUser })
    });

    const workerData = await workerRes.json();

    if (!workerData || !workerData.success) {
      return res.status(400).json({
        success: false,
        error: workerData?.error || 'Kích Gold thất bại. Vui lòng kiểm tra lại username!'
      });
    }

    const userName = workerData.name || cleanUser;
    const avatar = workerData.avatar || '';
    const uid = workerData.uid || '';
    const now = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

    // 3. Cập nhật trạng thái 'activated' vào KV Cloud
    if (isRedisConfigured()) {
      try {
        const updatedPayload = {
          ...(whitelistItem || {}),
          username: cleanUser,
          name: userName,
          avatar: avatar || whitelistItem?.avatar || '',
          uid: uid || whitelistItem?.uid || '',
          status: 'activated',
          activatedAt: now
        };
        await redisSet(`whitelist:${cleanUser}`, updatedPayload, 0);
      } catch (e) {
        console.error('Lỗi cập nhật trạng thái KV:', e);
      }
    }

    // 4. Bắn thông báo Telegram tức thì về Bot
    try {
      const botToken = "8236266375:AAGh1GzjPa9sRb0iouBX0FsrcljPFK1vd9w";
      const chatIds = ["6754356446"];
      const clientIp = req.headers["x-forwarded-for"] || req.socket?.remoteAddress || 'Mạng di động';

      const notifyText = `🎉 ⚡ TÀI KHOẢN VỪA KÍCH GOLD THÀNH CÔNG ⚡
───────────────────────
👤 Khách hàng: ${userName} (@${cleanUser})
🆔 UID Locket: ${uid || 'N/A'}
⏱️ Thời gian: ${now}
🌐 IP Thực hiện: ${clientIp}
👑 Hệ thống: Kích Gold Tự Động CAO VĂN NAM`;

      await Promise.all(
        chatIds.map(chatId =>
          fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              text: notifyText
            })
          }).then(r => r.json()).catch(err => console.log("Telegram Error:", err))
        )
      );
    } catch (e) {
      console.log("Telegram notify exception:", e);
    }

    return res.json({
      success: true,
      name: userName,
      username: cleanUser,
      avatar,
      uid
    });

  } catch (err) {
    console.error('Lỗi gọi worker kick:', err);
    return res.status(500).json({
      success: false,
      error: 'Lỗi kết nối Server Worker: ' + err.message
    });
  }
}
