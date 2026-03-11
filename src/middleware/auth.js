import crypto from 'crypto';

export function verifyInitData(req, res, next) {
  const initData = req.headers['x-telegram-init-data'];

  if (!initData) {
    return res.status(401).json({ error: 'Missing Telegram initData' });
  }

  try {
    const parsed = Object.fromEntries(new URLSearchParams(initData));
    const { hash, ...dataWithoutHash } = parsed;

    if (!hash) {
      return res.status(401).json({ error: 'Missing hash in initData' });
    }

    const dataCheckString = Object.keys(dataWithoutHash)
      .sort()
      .map(k => `${k}=${dataWithoutHash[k]}`)
      .join('\n');

    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(process.env.BOT_TOKEN)
      .digest();

    const expectedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (expectedHash !== hash) {
      return res.status(401).json({ error: 'Invalid initData signature' });
    }

    const authDate = parseInt(dataWithoutHash.auth_date || '0', 10);
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > 3600) {
      return res.status(401).json({ error: 'initData expired' });
    }

    if (dataWithoutHash.user) {
      req.tgUser = JSON.parse(dataWithoutHash.user);
    }

    next();
  } catch (err) {
    console.error('[auth] verifyInitData error:', err);
    return res.status(401).json({ error: 'Invalid initData' });
  }
}
