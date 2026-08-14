export default function handler(req, res) {
  const { name, durationMinutes } = req.body;
  const minutes = parseInt(durationMinutes, 10) || 15;

  const payload = {
    name,
    exp: Date.now() + minutes * 60 * 1000,
    ip: null,
    ua: null
  };

  const encoded = Buffer.from(
    JSON.stringify(payload)
  ).toString("base64");

  res.json({ data: encoded });
}