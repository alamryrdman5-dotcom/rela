const express = require('express');
const router = express.Router();
const db = require('../db');

// GET all suppliers
router.get('/', (req, res) => {
  try {
    const suppliers = db.prepare('SELECT * FROM suppliers ORDER BY balance DESC, name ASC').all();
    res.json(suppliers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE supplier
router.post('/', (req, res) => {
  try {
    const { name, phone, company, address, initial_balance = 0 } = req.body;
    if (!name) return res.status(400).json({ error: 'اسم المورد مطلوب' });

    const stmt = db.prepare('INSERT INTO suppliers (name, phone, company, address, balance) VALUES (?, ?, ?, ?, ?)');
    const result = stmt.run(name, phone || '', company || '', address || '', parseFloat(initial_balance) || 0);
    const newSupplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(newSupplier);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Pay supplier (سداد للمورد)
router.post('/:id/pay', (req, res) => {
  try {
    const { amount } = req.body;
    const payAmount = parseFloat(amount);
    if (!payAmount || payAmount <= 0) {
      return res.status(400).json({ error: 'المبلغ يجب أن يكون أكبر من صفر' });
    }
    db.prepare('UPDATE suppliers SET balance = balance - ? WHERE id = ?').run(payAmount, req.params.id);
    const updated = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(req.params.id);
    res.json({ message: 'تم تسجيل سداد مستحقات المورد', supplier: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
