const router = require('express').Router();
const bcrypt = require('bcryptjs');
const pool   = require('../db/pool');
const { requireFreelancer } = require('../middleware/auth');

// GET /api/clients — list all clients
router.get('/', requireFreelancer, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT u.id, u.name, u.email, u.company, c.is_active, c.notes,
             COUNT(t.id)::int AS log_count,
             COALESCE(SUM(t.hours),0)::numeric AS total_hours
      FROM users u
      JOIN clients c ON c.user_id = u.id
      LEFT JOIN time_logs t ON t.client_id = u.id
      WHERE u.role = 'client'
      GROUP BY u.id, u.name, u.email, u.company, c.is_active, c.notes
      ORDER BY u.name
    `);
    res.json(rows);
  } catch (e) { next(e); }
});

// POST /api/clients — create new client (also creates user account)
router.post('/', requireFreelancer, async (req, res, next) => {
  try {
    const { name, email, company, password, notes } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'name, email, password required' });

    const hash = await bcrypt.hash(password, 10);

    const client = await pool.query('BEGIN');
    try {
      const userRow = await pool.query(
        'INSERT INTO users (name, email, password_hash, role, company) VALUES ($1,$2,$3,\'client\',$4) RETURNING id, name, email, company',
        [name, email.toLowerCase().trim(), hash, company || null]
      );
      await pool.query(
        'INSERT INTO clients (user_id, notes) VALUES ($1, $2)',
        [userRow.rows[0].id, notes || null]
      );
      await pool.query('COMMIT');
      res.status(201).json(userRow.rows[0]);
    } catch (e) {
      await pool.query('ROLLBACK');
      if (e.code === '23505') return res.status(409).json({ error: 'Email already exists' });
      throw e;
    }
  } catch (e) { next(e); }
});

// PUT /api/clients/:id — update client info
router.put('/:id', requireFreelancer, async (req, res, next) => {
  try {
    const { name, company, notes, is_active } = req.body;
    await pool.query(
      'UPDATE users SET name=$1, company=$2, updated_at=NOW() WHERE id=$3 AND role=\'client\'',
      [name, company, req.params.id]
    );
    if (notes !== undefined || is_active !== undefined) {
      await pool.query(
        'UPDATE clients SET notes=$1, is_active=$2 WHERE user_id=$3',
        [notes, is_active ?? true, req.params.id]
      );
    }
    res.json({ message: 'Updated' });
  } catch (e) { next(e); }
});

// DELETE /api/clients/:id
router.delete('/:id', requireFreelancer, async (req, res, next) => {
  try {
    await pool.query('DELETE FROM users WHERE id=$1 AND role=\'client\'', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (e) { next(e); }
});

module.exports = router;
