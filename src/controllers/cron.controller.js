import { autoReleaseEscrows } from '../utils/cron.js';

export const releaseEscrow = async (req, res, next) => {
  if (!process.env.CRON_API_KEY) {
    return res.status(500).json({
      success: false,
      message: 'CRON_API_KEY is not configured. Set it in the environment before triggering the cron endpoint.',
    });
  }

  const apiKey = req.headers['x-cron-api-key'];
  if (!apiKey || apiKey !== process.env.CRON_API_KEY) {
    return res.status(401).json({ success: false, message: 'Invalid API key' });
  }
  try {
    await autoReleaseEscrows();
    res.json({ success: true, message: 'Escrow auto-release completed' });
  } catch (error) {
    next(error);
  }
};
