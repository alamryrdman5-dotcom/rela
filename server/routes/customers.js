const express = require('express');
const router = express.Router();
const db = require('../db');

// GET all customers
router.get('/', (req, res) => {
  try {
    const customers = db.prepare('SELECT * FROM customers ORDER BY balance DESC, name ASC').all();
    res.json(customers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single customer with sales & payment history
router.get('/:id', (req, res) => {
  try {
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    if (!customer) return res.status(404).json({ error: 'العميل غير موجود' });

    const sales = db.prepare('SELECT * FROM sales WHERE customer_id = ? ORDER BY id DESC LIMIT 20').all(req.params.id);
    const payments = db.prepare('SELECT * FROM customer_payments WHERE customer_id = ? ORDER BY id DESC LIMIT 20').all(req.params.id);

    res.json({ ...customer, sales, payments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE customer
router.post('/', (req, res) => {
  try {
    const { name, phone, address, initial_balance = 0 } = req.body;
    if (!name) return res.status(400).json({ error: 'اسم العميل مطلوب' });

    const stmt = db.prepare('INSERT INTO customers (name, phone, address, balance) VALUES (?, ?, ?, ?)');
    const result = stmt.run(name, phone || '', address || '', parseFloat(initial_balance) || 0);
    const newCustomer = db.prepare('SELECT * FROM customers WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(newCustomer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// RECORD PAYMENT (سداد دين من العميل)
router.post('/:id/pay', (req, res) => {
  const { amount, notes } = req.body;
  const payAmount = parseFloat(amount);
  if (!payAmount || payAmount <= 0) {
    return res.status(400).json({ error: 'المبلغ المدفوع يجب أن يكون أكبر من صفر' });
  }

  const payTransaction = db.transaction(() => {
    db.prepare('INSERT INTO customer_payments (customer_id, amount, notes) VALUES (?, ?, ?)').run(
      req.params.id,
      payAmount,
      notes || 'سند قبض / سداد نقدي'
    );
    db.prepare('UPDATE customers SET balance = balance - ? WHERE id = ?').run(payAmount, req.params.id);
    return db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  });

  try {
    const updatedCustomer = payTransaction();
    res.json({ message: 'تم تسجيل سند القبض بنجاح وتحديث الرصيد', customer: updatedCustomer });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
