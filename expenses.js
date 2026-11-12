const express = require('express');
const router = express.Router();
const db = require('../db');

// GET all expenses
router.get('/', (req, res) => {
  try {
    const { start_date, end_date, category } = req.query;
    let query = `SELECT * FROM expenses WHERE 1=1`;
    const params = [];

    if (start_date) {
      query += ` AND date >= ?`;
      params.push(start_date);
    }
    if (end_date) {
      query += ` AND date <= ?`;
      params.push(end_date);
    }
    if (category) {
      query += ` AND category = ?`;
      params.push(category);
    }

    query += ` ORDER BY date DESC, id DESC LIMIT 200`;
    const expenses = db.prepare(query).all(...params);
    res.json(expenses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE expense
router.post('/', (req, res) => {
  try {
    const { title, category, amount, notes, date } = req.body;
    if (!title || !category || !amount) {
      return res.status(400).json({ error: 'العنوان، التصنيف، والمبلغ مطلوبة' });
    }

    const stmt = db.prepare(`
      INSERT INTO expenses (title, category, amount, notes, date)
      VALUES (?, ?, ?, ?, ?)
    `);

    const expDate = date || new Date().toISOString().split('T')[0];
    const result = stmt.run(title, category, parseFloat(amount), notes || '', expDate);
    const newExpense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(newExpense);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE expense
router.delete('/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
    res.json({ message: 'تم حذف المصروف بنجاح' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
