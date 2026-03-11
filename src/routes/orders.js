import { Router } from 'express';
import { supabase } from '../services/supabase.js';
import { sendOrderToStaff } from '../bot/index.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const telegramId = req.tgUser?.id;

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('telegram_id', telegramId)
      .maybeSingle();

    if (!user) return res.status(404).json({ error: 'User not found' });

    const { data, error } = await supabase
      .from('orders')
      .select(`
        id, table_label, comment, status, total_amount, created_at,
        order_items (id, title, price, qty)
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const telegramId = req.tgUser?.id;

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('telegram_id', telegramId)
      .maybeSingle();

    if (!user) return res.status(404).json({ error: 'User not found' });

    const { data, error } = await supabase
      .from('orders')
      .select(`
        id, table_label, comment, status, total_amount, created_at,
        accepted_at, cooking_at, ready_at, delivered_at, cancelled_at,
        order_items (id, title, price, qty)
      `)
      .eq('id', req.params.id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Order not found' });

    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const telegramId = req.tgUser?.id;

    const { data: user } = await supabase
      .from('users')
      .select('id, login, display_name, telegram_username')
      .eq('telegram_id', telegramId)
      .maybeSingle();

    if (!user) return res.status(401).json({ error: 'User not registered' });

    const { table_label, comment, items } = req.body;

    if (!table_label?.trim()) {
      return res.status(400).json({ error: 'Укажите стол или зону' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Корзина пуста' });
    }

    const itemIds = items.map(i => i.menu_item_id);
    const { data: menuItems, error: menuErr } = await supabase
      .from('menu_items')
      .select('id, title, price, is_active')
      .in('id', itemIds);

    if (menuErr) throw menuErr;

    const menuMap = Object.fromEntries(menuItems.map(i => [i.id, i]));

    for (const item of items) {
      const mi = menuMap[item.menu_item_id];
      if (!mi || !mi.is_active) {
        return res.status(400).json({ error: `Блюдо недоступно: ${item.menu_item_id}` });
      }
      if (!Number.isInteger(item.qty) || item.qty < 1) {
        return res.status(400).json({ error: 'Некорректное количество' });
      }
    }

    const total_amount = items.reduce((sum, item) => {
      return sum + menuMap[item.menu_item_id].price * item.qty;
    }, 0);

    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        user_id: user.id,
        table_label: table_label.trim(),
        comment: comment?.trim() || null,
        status: 'new',
        total_amount,
      })
      .select()
      .single();

    if (orderErr) throw orderErr;

    const orderItems = items.map(item => ({
      order_id: order.id,
      menu_item_id: item.menu_item_id,
      title: menuMap[item.menu_item_id].title,
      price: menuMap[item.menu_item_id].price,
      qty: item.qty,
    }));

    const { error: itemsErr } = await supabase
      .from('order_items')
      .insert(orderItems);

    if (itemsErr) throw itemsErr;

    sendOrderToStaff({
      order,
      user,
      telegramId,
      items: orderItems,
    }).catch(err => console.error('[Bot] Failed to send order to staff:', err));

    res.status(201).json({ id: order.id, status: order.status });
  } catch (​​​​​​​​​​​​​​​​
