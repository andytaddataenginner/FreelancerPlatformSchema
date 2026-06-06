const router = require('express').Router();
const pool   = require('../db/pool');
const { requireFreelancer } = require('../middleware/auth');

// GET /api/timelogs
router.get('/', requireFreelancer, async (req, res, next) => {
  try {
    const { client_id, from, to, limit = 50, offset = 0 } = req.query;
    let where = ['t.freelancer_id = $1'];
    let params = [req.user.id];
    let i = 2;

    if (client_id) { where.push(`t.client_id = $${i++}`); params.push(client_id); }
    if (from)      { where.push(`t.date >= $${i++}`);     params.push(from); }
    if (to)        { where.push(`t.date <= $${i++}`);     params.push(to); }

    const { rows } = await pool.query(`
      SELECT t.*, u.name AS client_name, u.company AS client_company
      FROM time_logs t
      JOIN users u ON u.id = t.client_id
      WHERE ${where.join(' AND ')}
      ORDER BY t.date DESC, t.created_at DESC
      LIMIT $${i++} OFFSET $${i++}
    `, [...params, limit, offset]);

    res.json(rows);
  } catch (e) { next(e); }
});

// POST /api/timelogs
router.post('/', requireFreelancer, async (req, res, next) => {
  try {
    const { client_id, date, hours, task_description, source = 'manual' } = req.body;
    if (!client_id || !date || !hours || !task_description) {
      return res.status(400).json({ error: 'client_id, date, hours, task_description required' });
    }
    const { rows } = await pool.query(`
      INSERT INTO time_logs (client_id, freelancer_id, date, hours, task_description, source)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [client_id, req.user.id, date, hours, task_description, source]);
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

// PUT /api/timelogs/:id
router.put('/:id', requireFreelancer, async (req, res, next) => {
  try {
    const { hours, task_description, date } = req.body;
    const { rows } = await pool.query(`
      UPDATE time_logs
      SET hours=$1, task_description=$2, date=$3
      WHERE id=$4 AND freelancer_id=$5
      RETURNING *
    `, [hours, task_description, date, req.params.id, req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'Log not found' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// DELETE /api/timelogs/:id
router.delete('/:id', requireFreelancer, async (req, res, next) => {
  try {
    await pool.query(
      'DELETE FROM time_logs WHERE id=$1 AND freelancer_id=$2',
      [req.params.id, req.user.id]
    );
    res.json({ message: 'Deleted' });
  } catch (e) { next(e); }
});

module.exports = router;
