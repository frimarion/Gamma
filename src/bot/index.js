import TelegramBot from 'node-telegram-bot-api';
import { supabase } from '../services/supabase.js';

let bot = null;

export function initBot() {
  if (!process.env.BOT_TOKEN) {
    console.warn('[Bot] BOT_TOKEN not set — bot disabled');
    return;
  }

  bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

  bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id,
      '👋 Добро пожаловать!\n\nОткройте приложение для заказа еды.',
      {
        reply_markup: {
          inline_keyboard: [[
            {
              text: '🍽 Открыть меню',
              web_app: { url: process.env.FRONTEND_URL },
            },
          ]],
        },
      }
    );
  });

  bot.on('callback_query', handleCallbackQuery);

  console.log('[Bot] Telegram bot started');
}

const STATUS_TRANSITIONS = {
  new:      { next: 'accepted',  label: 'Принять' },
  accepted: { next: 'cooking',   label: 'Готовится' },
  cooking:  { next: 'ready',     label: 'Готов' },
  ready:    { next: 'delivered', label: 'Выдан' },
};

const STATUS_LABELS = {
  new:       '🆕 Новый',
  accepted:  '✅ Принят',
  cooking:   '👨‍🍳 Готовится',
  ready:     '🔔 Готов',
  delivered: '✔️ Выдан',
  cancelled: '❌ Отменён',
};

function buildKeyboard(orderId, status) {
  const buttons = [];

  const transition = STATUS_TRANSITIONS[status];
  if (transition) {
    buttons.push({
      text: transition.label,
      callback_data: `order:${orderId}:${transition.next}`,
    });
  }

  if (status !== 'delivered' && status !== 'cancelled') {
    buttons.push({
      text: '❌ Отменить',
      callback_data: `order:${orderId}:cancelled`,
    });
  }

  if (buttons.length === 0) return undefined;

  return { inline_keyboard: [buttons] };
}

function formatPrice(kopecks) {
  return `${(kopecks / 100).toLocaleString('ru-RU')} ₽`;
}

function formatOrderMessage({ order, user, telegramId, items, status }) {
  const time = new Date(order.created_at).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Moscow',
  });

  const itemLines = items
    .map(i => `• ${i.title} ×${i.qty}`)
    .join('\n');

  const commentLine = order.comment
    ? `\nКомментарий: ${order.comment}`
    : '';

  const tgUsernameStr = user.telegram_username
    ? `@${user.telegram_username}`
    : '—';

  const statusLabel = STATUS_LABELS[status || order.status] || order.status;

  return (
    `<b>Заказ #${order.id}</b>\n\n` +
    `Логин: <code>${user.login}</code>\n` +
    `Имя: ${user.display_name || '—'}\n` +
    `Telegram: ${tgUsernameStr}\n` +
    `Telegram ID: <code>${telegramId}</code>\n\n` +
    `Стол: <b>${order.table_label}</b>\n` +
    `Время: ${time}${commentLine}\n\n` +
    `Состав заказа:\n${itemLines}\n\n` +
    `Сумма: <b>${formatPrice(order.total_amount)}</b>\n\n` +
    `Статус: <b>${statusLabel}</b>`
  );
}

export async function sendOrderToStaff({ order, user, telegramId, items }) {
  if (!bot || !process.env.STAFF_CHAT_ID) {
    console.warn('[Bot] Cannot send order — bot or STAFF_CHAT_ID not configured');
    return;
  }

  const text = formatOrderMessage({ order, user, telegramId, items });
  const reply_markup = buildKeyboard(order.id, order.status);

  const sent = await bot.sendMessage(
    process.env.STAFF_CHAT_ID,
    text,
    { parse_mode: 'HTML', reply_markup }
  );

  await supabase
    .from('orders')
    .update({
      tg_message_id: sent.message_id,
      tg_chat_id: sent.chat.id,
    })
    .eq('id', order.id);
}

async function handleCallbackQuery(callbackQuery) {
  const data = callbackQuery.data;
  if (!data?.startsWith('order:')) return;

  const [, orderIdStr, targetStatus] = data.split(':');
  const orderId = parseInt(orderIdStr, 10);
  const answerId = callbackQuery.id;
  const staffName = callbackQuery.from?.username
    ? `@${callbackQuery.from.username}`
    : callbackQuery.from?.first_name || 'Сотрудник';

  try {
    const { data: order, error: fetchErr } = await supabase
      .from('orders')
      .select(`
        id, status, total_amount, table_label, comment, created_at,
        tg_message_id, tg_chat_id,
        user:users (id, login, display_name, telegram_username, telegram_id)
      `)
      .eq('id', orderId)
      .single();

    if (fetchErr || !order) {
      await bot.answerCallbackQuery(answerId, { text: 'Заказ не найден', show_alert: true });
      return;
    }

    if (order.status === 'delivered' || order.status === 'cancelled') {
      await bot.answerCallbackQuery(answerId, {
        text: 'Статус уже обновлен другим сотрудником',
        show_alert: true,
      });
      return;
    }

    const validNextStatuses = {
      new:      ['accepted', 'cancelled'],
      accepted: ['cooking',  'cancelled'],
      cooking:  ['ready',    'cancelled'],
      ready:    ['delivered','cancelled'],
    };

    const allowed = validNextStatuses[order.status] || [];
    if (!allowed.includes(targetStatus)) {
      await bot.answerCallbackQuery(answerId, {
        text: 'Статус уже обновлен другим сотрудником',
        show_alert: true,
      });
      return;
    }

    const statusUpdate = { status: targetStatus };
    const now = new Date().toISOString();

    if (targetStatus === 'accepted') {
      statusUpdate.accepted_by = staffName;
      statusUpdate.accepted_at = now;
    } else if (targetStatus === 'cooking') {
      statusUpdate.cooking_at = now;
    } else if (targetStatus === 'ready') {
      statusUpdate.ready_at = now;
    } else if (targetStatus === 'delivered') {
      statusUpdate.delivered_at = now;
    } else if (targetStatus === 'cancelled') {
      statusUpdate.cancelled_at = now;
    }

    const { error: updateErr } = await supabase
      .from('orders')
      .update(statusUpdate)
      .eq('id', orderId)
      .eq('status', order.status);

    if (updateErr) {
      await bot.answerCallbackQuery(answerId, {
        text: 'Статус уже обновлен другим сотрудником',
        show_alert: true,
      });
      return;
    }

    if (order.tg_message_id && order.tg_chat_id) {
      const updatedOrder = { ...order, status: targetStatus };
      const items = await fetchOrderItems(orderId);
      const newText = formatOrderMessage({
        order: updatedOrder,
        user: order.user,
        telegramId: order.user.telegram_id,
        items,
        status: targetStatus,
      });

      const newKeyboard = buildKeyboard(orderId, targetStatus);

      await bot.editMessageText(newText, {
        chat_id: order.tg_chat_id,
        message_id: order.tg_message_id,
        parse_mode: 'HTML',
        reply_markup: newKeyboard || { inline_keyboard: [] },
      });
    }

    await bot.answerCallbackQuery(answerId, {
      text: `Статус обновлён: ${STATUS_LABELS[targetStatus]}`,
    });
  } catch (err) {
    console.error('[Bot] handleCallbackQuery error:', err);
    await bot.answerCallbackQuery(answerId, {
      text: 'Ошибка при обновлении статуса',
      show_alert: true,
    }).catch(() => {});
  }
}

async function fetchOrderItems(orderId) {
  const { data } = await supabase
    .from('order_items')
    .select('title, qty, price')
    .eq('order_id', orderId);
  return data || [];
}
