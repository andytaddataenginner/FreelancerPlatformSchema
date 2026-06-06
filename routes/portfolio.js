// portfolio.js
const router = require('express').Router();
const pool   = require('../db/pool');
const { requireFreelancer } = require('../middleware/auth');

// Public
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM portfolio_items WHERE is_published=TRUE ORDER BY sort_order, created_at'
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// Freelancer CRUD
router.post('/', requireFreelancer, async (req, res, next) => {
  try {
    const { title, description, category, emoji, url, image_url, sort_order } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO portfolio_items (title,description,category,emoji,url,image_url,sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [title, description, category, emoji || '💻', url, image_url, sort_order || 0]
    );
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

router.put('/:id', requireFreelancer, async (req, res, next) => {
  try {
    const { title, description, category, emoji, url, image_url, sort_order, is_published } = req.body;
    const { rows } = await pool.query(
      'UPDATE portfolio_items SET title=$1,description=$2,category=$3,emoji=$4,url=$5,image_url=$6,sort_order=$7,is_published=$8 WHERE id=$9 RETURNING *',
      [title, description, category, emoji, url, image_url, sort_order, is_published ?? true, req.params.id]
    );
    res.json(rows[0]);
  } catch (e) { next(e); }
});

router.delete('/:id', requireFreelancer, async (req, res, next) => {
  try {
    await pool.query('DELETE FROM portfolio_items WHERE id=$1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (e) { next(e); }
});

module.exports = router;
