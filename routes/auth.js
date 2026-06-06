const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const pool    = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const { rows } = await pool.query(
      'SELECT id, name, email, password_hash, role, company FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid email or password' });

    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, company: user.company }
    });
  } catch (e) { next(e); }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, email, role, company FROM users WHERE id = $1',
      [req.user.id]
    );
    res.json(rows[0] || {});
  } catch (e) { next(e); }
});

// POST /api/auth/change-password
router.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const { current, newPassword } = req.body;
    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });

    const ok = await bcrypt.compare(current, rows[0].password_hash);
    if (!ok) return res.status(401).json({ error: 'Current password is wrong' });

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2', [hash, req.user.id]);
    res.json({ message: 'Password changed' });
  } catch (e) { next(e); }
});

module.exports = router;
