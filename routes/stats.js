const router = require('express').Router();
const pool   = require('../db/pool');
const { requireFreelancer } = require('../middleware/auth');

// Public stats (for homepage)
router.get('/public', async (req, res, next) => {
  try {
    const [clients, projects] = await Promise.all([
      pool.query("SELECT COUNT(*)::int AS cnt FROM users WHERE role='client'"),
      pool.query('SELECT COUNT(*)::int AS cnt FROM portfolio_items WHERE is_published=TRUE')
    ]);
    res.json({ clients: clients.rows[0].cnt, projects: projects.rows[0].cnt });
  } catch (e) { next(e); }
});

// Freelancer dashboard stats
router.get('/freelancer', requireFreelancer, async (req, res, next) => {
  try {
    const now = new Date();
    const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;

    const [hours, tasks, clients, bookings] = await Promise.all([
      pool.query('SELECT COALESCE(SUM(hours),0)::numeric AS h FROM time_logs WHERE freelancer_id=$1 AND date >= $2', [req.user.id, firstOfMonth]),
      pool.query('SELECT COUNT(*)::int AS cnt FROM time_logs WHERE freelancer_id=$1 AND date >= $2', [req.user.id, firstOfMonth]),
      pool.query("SELECT COUNT(*)::int AS cnt FROM users WHERE role='client'"),
      pool.query("SELECT COUNT(*)::int AS cnt FROM bookings WHERE freelancer_id=$1 AND date >= NOW()::date AND status != 'cancelled'", [req.user.id])
    ]);

    res.json({
      hoursThisMonth: hours.rows[0].h,
      tasksThisMonth: tasks.rows[0].cnt,
      activeClients: clients.rows[0].cnt,
      upcomingBookings: bookings.rows[0].cnt
    });
  } catch (e) { next(e); }
});

module.exports = router;
