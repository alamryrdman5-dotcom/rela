const express = require('express');
const router = express.Router();
const db = require('../db');

// GET all purchases
router.get('/', (req, res) => {
  try {
    const purchases = db.prepare(`
      SELECT p.*, s.name as supplier_name, s.company as supplier_company,
        (SELECT COUNT(*) FROM purchase_items pi WHERE pi.purchase_id = p.id) as total_items
      FROM purchases p
      LEFT JOIN suppliers s ON p.supplier_id = s.id
      ORDER BY p.id DESC LIMIT 100
    `).all();
    res.json(purchases);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE purchase invoice (Increments inventory)
router.post('/', (req, res) => {
  const { supplier_id, items, paid_amount = 0, payment_method = 'cash', notes } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'يجب إضافة صنف واحد على الأقل لفاتورة الشراء' });
  }

  const executePurchase = db.transaction(() => {
    let total_amount = 0;
    for (const item of items) {
      total_amount += (parseFloat(item.unit_cost) || 0) * (parseFloat(item.quantity) || 1);
    }

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const invoice_number = `PUR-${dateStr}-${randomSuffix}`;

    const insertPurchase = db.prepare(`
      INSERT INTO purchases (invoice_number, supplier_id, total_amount, paid_amount, payment_method, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = insertPurchase.run(
      invoice_number,
      supplier_id || null,
      total_amount,
      parseFloat(paid_amount) || 0,
      payment_method,
      notes || ''
    );

    const purchaseId = result.lastInsertRowid;

    const insertItem = db.prepare(`
      INSERT INTO purchase_items (purchase_id, product_id, quantity, unit_cost, total_cost)
      VALUES (?, ?, ?, ?, ?)
    `);

    const updateProduct = db.prepare(`
      UPDATE products 
      SET stock_quantity = stock_quantity + ?,
          cost_price = ?
      WHERE id = ?
    `);

    for (const item of items) {
      const qty = parseFloat(item.quantity) || 1;
      const unit_cost = parseFloat(item.unit_cost) || 0;
      insertItem.run(purchaseId, item.product_id, qty, unit_cost, qty * unit_cost);
      updateProduct.run(qty, unit_cost, item.product_id);
    }

    // Adjust supplier balance if credit
    const remainingToSupplier = total_amount - (parseFloat(paid_amount) || 0);
    if (supplier_id && remainingToSupplier > 0) {
      db.prepare('UPDATE suppliers SET balance = balance + ? WHERE id = ?').run(remainingToSupplier, supplier_id);
    }

    return { purchaseId, invoice_number, total_amount };
  });

  try {
    const resData = executePurchase();
    res.status(201).json(resData);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
