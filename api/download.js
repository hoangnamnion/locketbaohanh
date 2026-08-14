import { v4 as uuidv4 } from 'uuid';
import { redisGet, redisSet, isRedisConfigured } from './redis.js';

export default async function handler(req, res) {
  const { id, data } = req.query || {};
  let decoded = null;
  let fromRedis = false;

  const clientFp = req.headers['x-fp'] || 'Unknown-Device';

  // 1. Lấy dữ liệu từ Redis nếu có id
  if (id && isRedisConfigured()) {
    try {
      const redisPayload = await redisGet(`link:${id}`);
      if (redisPayload) {
        decoded = redisPayload;
        fromRedis = true;
      }
    } catch (e) {
      console.error('Lỗi đọc Redis trong download:', e);
    }
  }

  // 2. Fallback lấy dữ liệu từ data Base64
  if (!decoded && data) {
    try {
      decoded = JSON.parse(Buffer.from(data, 'base64').toString());
    } catch {
      return res.status(400).send('Dữ liệu không hợp lệ');
    }
  }

  if (!decoded) {
    return res.status(404).send('Link không tồn tại hoặc đã hết hạn');
  }

  if (Date.now() > decoded.exp) {
    return res.status(410).send('Liên kết đã hết hạn');
  }

  // 3. Kiểm tra thiết bị
  if (!decoded.devices) {
    decoded.devices = [clientFp];
  } else if (!decoded.devices.includes(clientFp)) {
    if (decoded.devices.length >= 2) {
      return res.status(403).send('Link đã đạt giới hạn tối đa 2 thiết bị');
    }
    decoded.devices.push(clientFp);
  }

  // Cập nhật lại danh sách thiết bị vào Redis nếu dùng Redis
  if (fromRedis && id) {
    const remainingSeconds = Math.max(60, Math.floor((decoded.exp - Date.now()) / 1000));
    try {
      await redisSet(`link:${id}`, decoded, remainingSeconds);
    } catch (e) {
      console.error('Lỗi cập nhật thiết bị Redis:', e);
    }
  }

  // 4. Gửi thông báo Telegram tức thì
  try {
    const botToken = "8236266375:AAGh1GzjPa9sRb0iouBX0FsrcljPFK1vd9w";
    const chatIds = ["6754356446"];
    const now = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
    const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress || 'Mạng di động';

    const notifyText = `📥 ⚡ KHÁCH VỪA BẤM TẢI PROFILE LOCKET DORAEMON ⚡
───────────────────────
👤 Khách hàng: ${decoded.name}
⏱️ Thời gian: ${now}
📱 Gói Profile: Locket Gold Doraemon 10s - ${decoded.name}
🌐 IP: ${clientIp}`;

    await Promise.all(
      chatIds.map(chatId =>
        fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: notifyText
          })
        }).then(r => r.json()).then(resJson => console.log("Telegram Result:", chatId, resJson)).catch(err => console.log("Telegram Error:", err))
      )
    );
  } catch (e) {
    console.log("Telegram notify exception:", e);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>DNSSettings</key>
      <dict>
        <key>DNSProtocol</key>
        <string>HTTPS</string>
        <key>ServerURL</key>
        <string>https://dns.nextdns.io/797d97/hoangnamutt</string>
        <key>ServerAddresses</key>
        <array>
          <string>45.90.28.0</string>
          <string>45.90.30.0</string>
          <string>2a07:a8c0::</string>
          <string>2a07:a8c1::</string>
        </array>
      </dict>
      <key>OnDemandEnabled</key>
      <integer>1</integer>
      <key>PayloadDescription</key>
      <string>Bản quyền DNS thuộc về LOCKET GOLD</string>
      <key>PayloadDisplayName</key>
      <string>Locket Gold Doraemon - ${decoded.name}</string>
      <key>PayloadIdentifier</key>
      <string>com.nextdns.profile.797d97.hoangnamutt</string>
      <key>PayloadType</key>
      <string>com.apple.dnsSettings.managed</string>
      <key>PayloadUUID</key>
      <string>${uuidv4()}</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
    </dict>
  </array>
  <key>PayloadDescription</key>
  <string>
🔔 Locket Gold Doraemon VIP - CAO VĂN NAM
Zalo 0378787154
</string>
  <key>PayloadDisplayName</key>
  <string>Locket Gold Doraemon - ${decoded.name}</string>
  <key>PayloadIdentifier</key>
  <string>com.nextdns.profile.797d97</string>
  <key>PayloadRemovalDisallowed</key>
  <false/>
  <key>PayloadType</key>
  <string>Configuration</string>
  <key>PayloadUUID</key>
  <string>${uuidv4()}</string>
  <key>PayloadVersion</key>
  <integer>1</integer>
</dict>
</plist>`;

  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${decoded.name}_Locket_10s.mobileconfig"`
  );
  res.setHeader("Content-Type", "application/x-apple-aspen-config");

  res.send(xml);
}
