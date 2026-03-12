import { Router } from 'express';
import { supabase } from '../services/supabase.js';

const router = Router();

// GET /api/menu — full menu with categories and items
router.get('/', async (_req, res, next) => {
  try {
    const { data: categories, error: catErr } = await supabase
      .from('menu_categories')
      .select('id, title, sort_order')
      .order('sort_order');

    if (catErr) throw catErr;

    const { data: items, error: itemsErr } = await supabase
      .from('menu_items')
      .select('id, category_id, title, description, price, sort_order, image_url')
      .eq('is_active', true)
      .order('sort_order');

    if (itemsErr) throw itemsErr;

    // Group items by category
    const result = categories.map(cat => ({
      ...cat,
      items: items.filter(i => i.category_id === cat.id),
    }));

    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
