const express = require('express');
const router = express.Router();
const db = require('../db');

// GET all sales
router.get('/', (req, res) => {
  try {
    const { start_date, end_date, customer_id, payment_method } = req.query;
    let query = `
      SELECT s.*, c.name as customer_name,
        (SELECT COUNT(*) FROM sale_items si WHERE si.sale_id = s.id) as total_items,
        (SELECT SUM((si.unit_price - si.cost_price) * (si.quantity - si.returned_quantity)) FROM sale_items si WHERE si.sale_id = s.id) as estimated_profit
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (start_date) {
      query += ` AND DATE(s.created_at) >= ?`;
      params.push(start_date);
    }
    if (end_date) {
      query += ` AND DATE(s.created_at) <= ?`;
      params.push(end_date);
    }
    if (customer_id) {
      query += ` AND s.customer_id = ?`;
      params.push(customer_id);
    }
    if (payment_method) {
      query += ` AND s.payment_method = ?`;
      params.push(payment_method);
    }

    query += ` ORDER BY s.id DESC LIMIT 100`;

    const sales = db.prepare(query).all(...params);
    res.json(sales);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single sale with items
router.get('/:id', (req, res) => {
  try {
    const sale = db.prepare(`
      SELECT s.*, c.name as customer_name, c.phone as customer_phone, c.balance as customer_balance
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      WHERE s.id = ?
    `).get(req.params.id);

    if (!sale) return res.status(404).json({ error: 'الفاتورة غير موجودة' });

    const items = db.prepare(`
      SELECT si.*, p.name as product_name, p.barcode as product_barcode, p.unit
      FROM sale_items si
      JOIN products p ON si.product_id = p.id
      WHERE si.sale_id = ?
    `).all(req.params.id);

    res.json({ ...sale, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE sale (Atomic Transaction)
router.post('/', (req, res) => {
  const { customer_id, items, discount = 0, tax = 0, payment_method = 'cash', paid_amount, notes } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'السلة فارغة، يجب إضافة منتج واحد على الأقل' });
  }

  // Execute in a database transaction
  const executeSale = db.transaction(() => {
    let subtotal = 0;
    const validatedItems = [];

    // Verify stock and fetch prices
    for (const item of items) {
      const product = db.prepare('SELECT * FROM products WHERE id = ? AND is_active = 1').get(item.product_id);
      if (!product) {
        throw new Error(`المنتج برقم ${item.product_id} غير متوفر`);
      }
      const qty = parseFloat(item.quantity) || 1;
      if (product.stock_quantity < qty) {
        throw new Error(`الكمية المتوفرة من "${product.name}" غير كافية (المتوفر: ${product.stock_quantity})`);
      }

      const unit_price = item.unit_price !== undefined ? parseFloat(item.unit_price) : product.sell_price;
      const total_price = unit_price * qty;
      subtotal += total_price;

      validatedItems.push({
        product_id: product.id,
        quantity: qty,
        cost_price: product.cost_price,
        unit_price: unit_price,
        total_price: total_price
      });
    }

    const numDiscount = parseFloat(discount) || 0;
    const numTax = parseFloat(tax) || 0;
    const grand_total = Math.max(0, subtotal - numDiscount + numTax);
    
    // Determine paid amount
    let finalPaid = payment_method === 'credit' ? (parseFloat(paid_amount) || 0) : grand_total;
    if (paid_amount !== undefined && payment_method !== 'credit') {
      finalPaid = parseFloat(paid_amount);
    }

    // Generate invoice number
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const invoice_number = `INV-${dateStr}-${randomSuffix}`;

    // Insert sale
    const insertSale = db.prepare(`
      INSERT INTO sales (invoice_number, customer_id, subtotal, discount, tax, grand_total, paid_amount, payment_method, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const saleResult = insertSale.run(
      invoice_number,
      customer_id || null,
      subtotal,
      numDiscount,
      numTax,
      grand_total,
      finalPaid,
      payment_method,
      notes || ''
    );

    const saleId = saleResult.lastInsertRowid;

    // Insert items & decrement inventory
    const insertItem = db.prepare(`
      INSERT INTO sale_items (sale_id, product_id, quantity, cost_price, unit_price, total_price)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const updateStock = db.prepare(`
      UPDATE products 
      SET stock_quantity = stock_quantity - ? 
      WHERE id = ?
    `);

    for (const vItem of validatedItems) {
      insertItem.run(saleId, vItem.product_id, vItem.quantity, vItem.cost_price, vItem.unit_price, vItem.total_price);
      updateStock.run(vItem.quantity, vItem.product_id);
    }

    // Handle Customer balance for credit/debt
    const remainingDebt = grand_total - finalPaid;
    if (customer_id && remainingDebt > 0) {
      db.prepare('UPDATE customers SET balance = balance + ? WHERE id = ?').run(remainingDebt, customer_id);
    }

    return { saleId, invoice_number, grand_total, remainingDebt };
  });

  try {
    const result = executeSale();
    const completeSale = db.prepare(`
      SELECT s.*, c.name as customer_name 
      FROM sales s 
      LEFT JOIN customers c ON s.customer_id = c.id 
      WHERE s.id = ?
    `).get(result.saleId);

    const items = db.prepare(`
      SELECT si.*, p.name as product_name, p.barcode as product_barcode, p.unit
      FROM sale_items si
      JOIN products p ON si.product_id = p.id
      WHERE si.sale_id = ?
    `).all(result.saleId);

    res.status(201).json({ ...completeSale, items });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// RETURN / REFUND ITEM FROM SALE
router.post('/:id/return', (req, res) => {
  const { sale_item_id, return_quantity, return_amount } = req.body;

  const executeReturn = db.transaction(() => {
    const item = db.prepare('SELECT * FROM sale_items WHERE id = ? AND sale_id = ?').get(sale_item_id, req.params.id);
    if (!item) throw new Error('عنصر الفاتورة غير موجود');

    const qty = parseFloat(return_quantity) || 1;
    if (qty > (item.quantity - item.returned_quantity)) {
      throw new Error('الكمية المراد إرجاعها أكبر من الكمية المتبقية في الفاتورة');
    }

    // Update returned quantity
    db.prepare('UPDATE sale_items SET returned_quantity = returned_quantity + ? WHERE id = ?').run(qty, item.id);

    // Increase product stock back
    db.prepare('UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?').run(qty, item.product_id);

    // Mark sale status
    db.prepare("UPDATE sales SET status = 'partially_returned' WHERE id = ?").run(req.params.id);

    return { message: 'تم استرجاع المنتج للمخزون بنجاح' };
  });

  try {
    const result = executeReturn();
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
