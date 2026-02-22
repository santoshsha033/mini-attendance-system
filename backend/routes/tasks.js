const router = require('express').Router();
const { body, param, query } = require('express-validator');
const { pool } = require('../db');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const logger = require('../config/logger');

router.use(authenticate);

// ── POST /api/tasks ──────────────────────────────────────────────
router.post(
  '/',
  [
    body('title').trim().notEmpty().withMessage('Title is required').isLength({ max: 255 }),
    body('description').optional().trim().isLength({ max: 2000 }),
    body('priority').optional().isIn(['low', 'medium', 'high']).withMessage('Invalid priority'),
    body('due_date').optional().isISO8601().withMessage('Invalid date format'),
  ],
  validate,
  async (req, res) => {
    const { title, description, priority = 'medium', due_date } = req.body;
    try {
      const { rows } = await pool.query(
        `INSERT INTO tasks (user_id, title, description, priority, due_date)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [req.user.id, title, description || null, priority, due_date || null]
      );
      logger.info('Task created', { taskId: rows[0].id, userId: req.user.id });
      res.status(201).json({ success: true, task: rows[0] });
    } catch (err) {
      logger.error('Create task error', { error: err.message });
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

// ── GET /api/tasks ───────────────────────────────────────────────
router.get(
  '/',
  [
    query('status').optional().isIn(['pending', 'in-progress', 'completed', 'cancelled']),
    query('priority').optional().isIn(['low', 'medium', 'high']),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  ],
  validate,
  async (req, res) => {
    const { status, priority, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const conditions = ['user_id = $1'];
    const params = [req.user.id];
    let i = 2;

    if (status)   { conditions.push(`status = $${i++}`);   params.push(status); }
    if (priority) { conditions.push(`priority = $${i++}`); params.push(priority); }

    const where = conditions.join(' AND ');

    try {
      const countResult = await pool.query(
        `SELECT COUNT(*) FROM tasks WHERE ${where}`, params
      );

      const { rows } = await pool.query(
        `SELECT * FROM tasks WHERE ${where}
         ORDER BY 
           CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
           due_date ASC NULLS LAST,
           created_at DESC
         LIMIT $${i} OFFSET $${i + 1}`,
        [...params, limit, offset]
      );

      res.json({
        success: true,
        total: parseInt(countResult.rows[0].count, 10),
        page, limit,
        tasks: rows,
      });
    } catch (err) {
      logger.error('List tasks error', { error: err.message });
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

// ── GET /api/tasks/:id ───────────────────────────────────────────
router.get(
  '/:id',
  [param('id').isUUID().withMessage('Invalid task ID')],
  validate,
  async (req, res) => {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM tasks WHERE id = $1 AND user_id = $2',
        [req.params.id, req.user.id]
      );
      if (!rows.length) return res.status(404).json({ success: false, message: 'Task not found' });
      res.json({ success: true, task: rows[0] });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

// ── PATCH /api/tasks/:id ─────────────────────────────────────────
router.patch(
  '/:id',
  [
    param('id').isUUID().withMessage('Invalid task ID'),
    body('title').optional().trim().notEmpty().isLength({ max: 255 }),
    body('description').optional().trim().isLength({ max: 2000 }),
    body('priority').optional().isIn(['low', 'medium', 'high']),
    body('status').optional().isIn(['pending', 'in-progress', 'completed', 'cancelled']),
    body('due_date').optional().isISO8601(),
  ],
  validate,
  async (req, res) => {
    const allowed = ['title', 'description', 'priority', 'status', 'due_date'];
    const updates = Object.keys(req.body).filter(k => allowed.includes(k));

    if (!updates.length) {
      return res.status(400).json({ success: false, message: 'No valid fields to update' });
    }

    const setClauses = updates.map((key, idx) => `${key} = $${idx + 1}`).join(', ');
    const values = updates.map(k => req.body[k]);

    try {
      const { rows } = await pool.query(
        `UPDATE tasks
         SET ${setClauses}
         WHERE id = $${updates.length + 1} AND user_id = $${updates.length + 2}
         RETURNING *`,
        [...values, req.params.id, req.user.id]
      );
      if (!rows.length) return res.status(404).json({ success: false, message: 'Task not found' });
      logger.info('Task updated', { taskId: rows[0].id });
      res.json({ success: true, task: rows[0] });
    } catch (err) {
      logger.error('Update task error', { error: err.message });
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

// ── DELETE /api/tasks/:id ────────────────────────────────────────
router.delete(
  '/:id',
  [param('id').isUUID().withMessage('Invalid task ID')],
  validate,
  async (req, res) => {
    try {
      const { rowCount } = await pool.query(
        'DELETE FROM tasks WHERE id = $1 AND user_id = $2',
        [req.params.id, req.user.id]
      );
      if (!rowCount) return res.status(404).json({ success: false, message: 'Task not found' });
      res.json({ success: true, message: 'Task deleted' });
    } catch (err) {
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

module.exports = router;
