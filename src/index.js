import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { router as menuRouter } from './routes/menu.js';
import { router as usersRouter } from './routes/users.js';
import { router as ordersRouter } from './routes/orders.js';
import { startBot } from './bot/index.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-telegram-init-data'],
}));
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/menu',   menuRouter);
app.use('/api/users',  usersRouter);
app.use('/api/orders', ordersRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startBot();
});
