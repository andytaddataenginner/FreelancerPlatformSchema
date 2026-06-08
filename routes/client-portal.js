const router = require('express').Router();
const pool   = require('../db/pool');
const { requireClient } = require('../middleware/auth');

const TYPE_LABELS = { call:'Video call / meeting', review:'Project review', workshop:'Working session', other:'Other' };

// GET /api/client/stats
router.get('/stats', requireClient, async (req, res, next) => {
  try {
    const clientId = req.user.id;
    const now = new Date();
    const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;

    // Get client billing info first
    const clientInfo = await pool.query(
      'SELECT rate_type, hourly_rate, fixed_price, fixed_payment_status FROM clients WHERE user_id=$1',
      [clientId]
    );
    const c = clientInfo.rows[0] || {};
    const isFixed = c.rate_type === 'fixed';

    let totalPaid = 0, totalUnpaid = 0, totalHours = 0, totalTasks = 0, hoursThisMonth = 0;

    if (isFixed) {
      // Fixed client — amounts come from clients table directly
      const price = parseFloat(c.fixed_price || 0);
      if (c.fixed_payment_status === 'paid') {
        totalPaid = price;
      } else {
        totalUnpaid = price;
      }
      // Still get hours from time_logs if any exist
      const hrs = await pool.query(
        'SELECT COALESCE(SUM(hours),0)::float AS h, COUNT(*)::int AS cnt FROM time_logs WHERE client_id=$1',
        [clientId]
      );
      const hrsMonth = await pool.query(
        'SELECT COALESCE(SUM(hours),0)::float AS h FROM time_logs WHERE client_id=$1 AND date >= $2',
        [clientId, firstOfMonth]
      );
      totalHours     = hrs.rows[0].h;
      totalTasks     = hrs.rows[0].cnt;
      hoursThisMonth = hrsMonth.rows[0].h;
    } else {
      // Hourly client — amounts come from time_logs
      const [total, monthly, tasks, paid, unpaid] = await Promise.all([
        pool.query('SELECT COALESCE(SUM(hours),0)::float AS h FROM time_logs WHERE client_id=$1', [clientId]),
        pool.query('SELECT COALESCE(SUM(hours),0)::float AS h FROM time_logs WHERE client_id=$1 AND date >= $2', [clientId, firstOfMonth]),
        pool.query('SELECT COUNT(*)::int AS cnt FROM time_logs WHERE client_id=$1', [clientId]),
        pool.query("SELECT COALESCE(SUM(amount),0)::float AS total FROM time_logs WHERE client_id=$1 AND payment_status='paid'", [clientId]),
        pool.query("SELECT COALESCE(SUM(amount),0)::float AS total FROM time_logs WHERE client_id=$1 AND (payment_status='unpaid' OR payment_status IS NULL)", [clientId]),
      ]);
      totalHours     = total.rows[0].h;
      hoursThisMonth = monthly.rows[0].h;
      totalTasks     = tasks.rows[0].cnt;
      totalPaid      = paid.rows[0].total;
      totalUnpaid    = unpaid.rows[0].total;
    }

    res.json({
      rateType:       c.rate_type || 'hourly',
      fixedPrice:     c.fixed_price || 0,
      fixedStatus:    c.fixed_payment_status || 'unpaid',
      totalHours,
      hoursThisMonth,
      totalTasks,
      totalPaid,
      totalUnpaid,
    });
  } catch (e) { next(e); }
});

// GET /api/client/timelogs
router.get('/timelogs', requireClient, async (req, res, next) => {
  try {
    const { limit = 200, offset = 0, from, to } = req.query;
    let where = ['client_id = $1'];
    let params = [req.user.id];
    let i = 2;
    if (from) { where.push(`date >= $${i++}`); params.push(from); }
    if (to)   { where.push(`date <= $${i++}`); params.push(to); }
    const { rows } = await pool.query(
      `SELECT * FROM time_logs WHERE ${where.join(' AND ')} ORDER BY date DESC LIMIT $${i++} OFFSET $${i++}`,
      [...params, limit, offset]
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// GET /api/client/bookings
router.get('/bookings', requireClient, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM bookings WHERE client_id=$1 ORDER BY date DESC, time DESC',
      [req.user.id]
    );
    res.json(rows.map(r => ({ ...r, type_label: TYPE_LABELS[r.type] || r.type })));
  } catch (e) { next(e); }
});

// POST /api/client/bookings
router.post('/bookings', requireClient, async (req, res, next) => {
  try {
    const { date, time, duration, type, message } = req.body;
    if (!date || !time || !type) return res.status(400).json({ error: 'date, time, type required' });
    const fl = await pool.query("SELECT id FROM users WHERE role='freelancer' LIMIT 1");
    if (!fl.rows.length) return res.status(404).json({ error: 'No freelancer found' });
    const { rows } = await pool.query(`
      INSERT INTO bookings (client_id, freelancer_id, date, time, duration, type, message, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'pending') RETURNING *
    `, [req.user.id, fl.rows[0].id, date, time, duration || 1, type, message || null]);
    res.status(201).json({ ...rows[0], type_label: TYPE_LABELS[rows[0].type] });
  } catch (e) { next(e); }
});

// DELETE /api/client/bookings/:id
router.delete('/bookings/:id', requireClient, async (req, res, next) => {
  try {
    await pool.query(
      "UPDATE bookings SET status='cancelled' WHERE id=$1 AND client_id=$2",
      [req.params.id, req.user.id]
    );
    res.json({ message: 'Cancelled' });
  } catch (e) { next(e); }
});

module.exports = router;
