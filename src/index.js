import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { initBot } from './bot/index.js';
import menuRouter from './routes/menu.js';
import ordersRouter from './routes/orders.js';
import usersRouter from './routes/users.js';
import { verifyInitData } from './middleware/auth.js';

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
}));
app.use(express.json());

// Health check (no auth)
app.get('/health', (_req, res) => res.json({ ok: true }));

// All API routes require Telegram initData verification
app.use('/api', verifyInitData);

app.use('/api/menu',   menuRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/users',  usersRouter);

// Global error handler
app.use((err, _req, res, _next) => {
  console.error('[Error]', err);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
});

// ─── Start ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Backend listening on port ${PORT}`);
  initBot();
});
