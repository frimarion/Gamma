import { Router } from 'express';
import { supabase } from '../services/supabase.js';

const router = Router();

const LOGIN_REGEX = /^[a-zA-Z0-9_-]{3,20}$/;

router.get('/me', async (req, res, next) => {
  try {
    const telegramId = req.tgUser?.id;
    if (!telegramId) return res.status(400).json({ error: 'No telegram user' });

    const { data, error } = await supabase
      .from('users')
      .select('id, telegram_id, telegram_username, login, display_name, created_at')
      .eq('telegram_id', telegramId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'User not found' });

    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.post('/register', async (req, res, next) => {
  try {
    const telegramId = req.tgUser?.id;
    if (!telegramId) return res.status(400).json({ error: 'No telegram user' });

    const { login, display_name } = req.body;

    if (!login || !LOGIN_REGEX.test(login)) {
      return res.status(400).json({
        error: 'Логин должен содержать от 3 до 20 символов (латиница, цифры, _ и -)',
      });
    }

    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('login', login)
      .maybeSingle();

    if (existing) {
      return res.status(409).json({ error: 'Этот логин уже занят' });
    }

    const { data: existingTg } = await supabase
      .from('users')
      .select('id')
      .eq('telegram_id', telegramId)
      .maybeSingle();

    if (existingTg) {
      return res.status(409).json({ error: 'Пользователь уже зарегистрирован' });
    }

    const { data, error } = await supabase
      .from('users')
      .insert({
        telegram_id: telegramId,
        telegram_username: req.tgUser?.username || null,
        login: login.toLowerCase(),
        display_name: display_name?.trim() || null,
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

router.patch('/me', async (req, res, next) => {
  try {
    const telegramId = req.tgUser?.id;
    if (!telegramId) return res.status(400).json({ error: 'No telegram user' });

    const { login, display_name } = req.body;
    const updates = {};

    if (login !== undefined) {
      if (!LOGIN_REGEX.test(login)) {
        return res.status(400).json({
          error: 'Логин должен содержать от 3 до 20 символов (латиница, цифры, _ и -)',
        });
      }

      const { data: me } = await supabase
        .from('users')
        .select('id')
        .eq('telegram_id', telegramId)
        .maybeSingle();

      const { data: existing } = await supabase
        .from('users')
        .select('id')
        .eq('login', login)
        .neq('id', me?.id)
        .maybeSingle();

      if (existing) {
        return res.status(409).json({ error: 'Этот логин уже занят' });
      }

      updates.login = login.toLowerCase();
    }

    if (display_name !== undefined) {
      updates.display_name = display_name?.trim() || null;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('telegram_id', telegramId)
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (err) {
    next(err);
  }
});

export { router }
