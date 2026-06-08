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
    const monthParam = req.query.month;
    let firstOfMonth, lastOfMonth;

    if (monthParam) {
      firstOfMonth = `${monthParam}-01`;
      const [y, m] = monthParam.split('-').map(Number);
      const last = new Date(y, m, 0);
      lastOfMonth = `${monthParam}-${String(last.getDate()).padStart(2,'0')}`;
    } else {
      const now = new Date();
      firstOfMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
      const last = new Date(now.getFullYear(), now.getMonth()+1, 0);
      lastOfMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(last.getDate()).padStart(2,'0')}`;
    }

    console.log('Stats query range:', firstOfMonth, 'to', lastOfMonth, 'freelancer_id:', req.user.id);

    const [hours, tasks, earned, unpaid, clients, bookings, monthClients, clientBreakdown] = await Promise.all([

      pool.query(`
        SELECT COALESCE(SUM(hours),0)::float AS h
        FROM time_logs
        WHERE freelancer_id=$1 AND date >= $2::date AND date <= $3::date
      `, [req.user.id, firstOfMonth, lastOfMonth]),

      pool.query(`
        SELECT COUNT(*)::int AS cnt
        FROM time_logs
        WHERE freelancer_id=$1 AND date >= $2::date AND date <= $3::date
      `, [req.user.id, firstOfMonth, lastOfMonth]),

      pool.query(`
        SELECT COALESCE(SUM(amount),0)::float AS total
        FROM time_logs
        WHERE freelancer_id=$1
          AND date >= $2::date AND date <= $3::date
          AND payment_status = 'paid'
      `, [req.user.id, firstOfMonth, lastOfMonth]),

      pool.query(`
        SELECT COALESCE(SUM(amount),0)::float AS total
        FROM time_logs
        WHERE freelancer_id=$1
          AND date >= $2::date AND date <= $3::date
          AND (payment_status = 'unpaid' OR payment_status IS NULL)
      `, [req.user.id, firstOfMonth, lastOfMonth]),

      pool.query(`SELECT COUNT(*)::int AS cnt FROM users WHERE role='client'`),

      pool.query(`
        SELECT COUNT(*)::int AS cnt FROM bookings
        WHERE freelancer_id=$1
          AND date >= NOW()::date
          AND status != 'cancelled'
      `, [req.user.id]),

      pool.query(`
        SELECT COUNT(DISTINCT client_id)::int AS cnt
        FROM time_logs
        WHERE freelancer_id=$1 AND date >= $2::date AND date <= $3::date
      `, [req.user.id, firstOfMonth, lastOfMonth]),

      pool.query(`
        SELECT
          u.name  AS client_name,
          u.company,
          c.rate_type,
          COALESCE(SUM(t.hours),0)::float  AS hours,
          COALESCE(SUM(CASE WHEN t.payment_status='paid'   THEN t.amount ELSE 0 END),0)::float AS paid,
          COALESCE(SUM(CASE WHEN t.payment_status='unpaid' OR t.payment_status IS NULL THEN t.amount ELSE 0 END),0)::float AS unpaid,
          COALESCE(SUM(t.amount),0)::float AS total
        FROM time_logs t
        JOIN users u ON u.id = t.client_id
        JOIN clients c ON c.user_id = t.client_id
        WHERE t.freelancer_id=$1
          AND t.date >= $2::date
          AND t.date <= $3::date
        GROUP BY u.name, u.company, c.rate_type
        ORDER BY total DESC
      `, [req.user.id, firstOfMonth, lastOfMonth]),
    ]);

    const totalEarned   = earned.rows[0].total;
    const totalUnpaid   = unpaid.rows[0].total;
    const totalExpected = (totalEarned + totalUnpaid).toFixed(2);

    console.log('Stats result:', { totalEarned, totalUnpaid, totalExpected, hoursThisMonth: hours.rows[0].h });

    res.json({
      month:            monthParam || new Date().toISOString().slice(0,7),
      hoursThisMonth:   hours.rows[0].h,
      tasksThisMonth:   tasks.rows[0].cnt,
      totalEarned,
      totalUnpaid,
      totalExpected,
      activeClients:    clients.rows[0].cnt,
      clientsThisMonth: monthClients.rows[0].cnt,
      upcomingBookings: bookings.rows[0].cnt,
      clientBreakdown:  clientBreakdown.rows
    });

  } catch (e) {
    console.error('Stats error:', e);
    next(e);
  }
});

module.exports = router;
