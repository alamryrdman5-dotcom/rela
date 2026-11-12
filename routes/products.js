const express = require('express');
const router = express.Router();
const db = require('../db');

// GET all products with filtering & search
router.get('/', (req, res) => {
  try {
    const { search, category_id, low_stock } = req.query;
    let query = `
      SELECT p.*, c.name as category_name 
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      WHERE p.is_active = 1
    `;
    const params = [];

    if (search) {
      query += ` AND (p.name LIKE ? OR p.barcode LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }

    if (category_id) {
      query += ` AND p.category_id = ?`;
      params.push(category_id);
    }

    if (low_stock === 'true' || low_stock === '1') {
      query += ` AND p.stock_quantity <= p.min_stock_alert`;
    }

    query += ` ORDER BY p.id DESC`;

    const products = db.prepare(query).all(...params);
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET product by barcode
router.get('/barcode/:barcode', (req, res) => {
  try {
    const product = db.prepare(`
      SELECT p.*, c.name as category_name 
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      WHERE p.barcode = ? AND p.is_active = 1
    `).get(req.params.barcode);

    if (!product) {
      return res.status(404).json({ error: 'المنتج غير موجود' });
    }
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single product
router.get('/:id', (req, res) => {
  try {
    const product = db.prepare(`
      SELECT p.*, c.name as category_name 
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      WHERE p.id = ?
    `).get(req.params.id);

    if (!product) return res.status(404).json({ error: 'المنتج غير موجود' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE product
router.post('/', (req, res) => {
  try {
    const { barcode, name, category_id, cost_price, sell_price, stock_quantity, min_stock_alert, unit } = req.body;
    if (!name || sell_price === undefined) {
      return res.status(400).json({ error: 'اسم المنتج وسعر البيع مطلوبان' });
    }

    // Auto generate barcode if omitted
    const generatedBarcode = barcode && barcode.trim() !== '' ? barcode.trim() : 'P' + Date.now().toString().slice(-8);

    const stmt = db.prepare(`
      INSERT INTO products (barcode, name, category_id, cost_price, sell_price, stock_quantity, min_stock_alert, unit)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      generatedBarcode,
      name,
      category_id || null,
      parseFloat(cost_price) || 0,
      parseFloat(sell_price) || 0,
      parseFloat(stock_quantity) || 0,
      parseFloat(min_stock_alert) || 5,
      unit || 'قطعة'
    );

    const newProduct = db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(newProduct);
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed: products.barcode')) {
      return res.status(400).json({ error: 'رمز الباركود مسجل مسبقاً لمنتج آخر' });
    }
    res.status(500).json({ error: err.message });
  }
});

// UPDATE product
router.put('/:id', (req, res) => {
  try {
    const { barcode, name, category_id, cost_price, sell_price, stock_quantity, min_stock_alert, unit } = req.body;
    const stmt = db.prepare(`
      UPDATE products 
      SET barcode = ?, name = ?, category_id = ?, cost_price = ?, sell_price = ?, stock_quantity = ?, min_stock_alert = ?, unit = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    stmt.run(
      barcode,
      name,
      category_id || null,
      parseFloat(cost_price) || 0,
      parseFloat(sell_price) || 0,
      parseFloat(stock_quantity) || 0,
      parseFloat(min_stock_alert) || 5,
      unit || 'قطعة',
      req.params.id
    );

    const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE product (Soft delete)
router.delete('/:id', (req, res) => {
  try {
    db.prepare('UPDATE products SET is_active = 0 WHERE id = ?').run(req.params.id);
    res.json({ message: 'تم حذف المنتج بنجاح' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
