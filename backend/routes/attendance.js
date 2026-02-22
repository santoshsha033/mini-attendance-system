const router = require('express').Router();
const { body, query } = require('express-validator');
const { pool } = require('../db');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const logger = require('../config/logger');

// All routes require auth
router.use(authenticate);

// ── POST /api/attendance/checkin ─────────────────────────────────
// Mark attendance for today — one record per user per day (enforced by DB unique constraint)
router.post(
  '/checkin',
  [
    body('status').optional().isIn(['present', 'late', 'half-day']).withMessage('Invalid status'),
    body('notes').optional().trim().isLength({ max: 500 }),
  ],
  validate,
  async (req, res) => {
    const { status = 'present', notes } = req.body;
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD in UTC

    try {
      const { rows } = await pool.query(
        `INSERT INTO attendance (user_id, date, status, notes)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [req.user.id, today, status, notes || null]
      );
      logger.info('Check-in recorded', { userId: req.user.id, date: today });
      res.status(201).json({ success: true, attendance: rows[0] });
    } catch (err) {
      if (err.code === '23505') {
        // Unique violation — already checked in today
        return res.status(409).json({
          success: false,
          message: 'Already checked in for today',
        });
      }
      logger.error('Check-in error', { error: err.message });
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

// ── PATCH /api/attendance/checkout ──────────────────────────────
// Record checkout time for today's record
router.patch('/checkout', async (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  try {
    const { rows } = await pool.query(
      `UPDATE attendance
       SET checked_out_at = NOW()
       WHERE user_id = $1 AND date = $2 AND checked_out_at IS NULL
       RETURNING *`,
      [req.user.id, today]
    );
    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: 'No open check-in found for today',
      });
    }
    res.json({ success: true, attendance: rows[0] });
  } catch (err) {
    logger.error('Checkout error', { error: err.message });
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── GET /api/attendance ──────────────────────────────────────────
// List attendance records for the authenticated user (with optional date range)
router.get(
  '/',
  [
    query('from').optional().isISO8601().withMessage('from must be a valid date'),
    query('to').optional().isISO8601().withMessage('to must be a valid date'),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  ],
  validate,
  async (req, res) => {
    const { from, to, page = 1, limit = 30 } = req.query;
    const offset = (page - 1) * limit;

    const conditions = ['user_id = $1'];
    const params = [req.user.id];
    let i = 2;

    if (from) { conditions.push(`date >= $${i++}`); params.push(from); }
    if (to)   { conditions.push(`date <= $${i++}`); params.push(to); }

    const where = conditions.join(' AND ');

    try {
      const countResult = await pool.query(
        `SELECT COUNT(*) FROM attendance WHERE ${where}`,
        params
      );

      const { rows } = await pool.query(
        `SELECT * FROM attendance WHERE ${where}
         ORDER BY date DESC LIMIT $${i} OFFSET $${i + 1}`,
        [...params, limit, offset]
      );

      res.json({
        success: true,
        total: parseInt(countResult.rows[0].count, 10),
        page,
        limit,
        records: rows,
      });
    } catch (err) {
      logger.error('Attendance list error', { error: err.message });
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

// ── GET /api/attendance/today ────────────────────────────────────
router.get('/today', async (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  try {
    const { rows } = await pool.query(
      'SELECT * FROM attendance WHERE user_id = $1 AND date = $2',
      [req.user.id, today]
    );
    res.json({ success: true, record: rows[0] || null });
  } catch (err) {
    logger.error('Today attendance error', { error: err.message });
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
