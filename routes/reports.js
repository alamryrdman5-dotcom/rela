const express = require('express');
const router = express.Router();
const db = require('../db');

// GET Dashboard KPI Summary
router.get('/dashboard', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const monthStart = today.slice(0, 7) + '-01';

    // Today's Sales
    const todaySales = db.prepare(`
      SELECT 
        COALESCE(SUM(grand_total), 0) as total_revenue,
        COUNT(*) as orders_count
      FROM sales 
      WHERE DATE(created_at) = ?
    `).get(today);

    // Month's Sales & COGS
    const monthSalesData = db.prepare(`
      SELECT 
        COALESCE(SUM(s.grand_total), 0) as month_revenue,
        COALESCE(SUM((si.quantity - si.returned_quantity) * si.cost_price), 0) as month_cogs
      FROM sales s
      JOIN sale_items si ON si.sale_id = s.id
      WHERE DATE(s.created_at) >= ?
    `).get(monthStart);

    // Month's Expenses
    const monthExpenses = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total_expenses
      FROM expenses
      WHERE date >= ?
    `).get(monthStart);

    const monthRevenue = monthSalesData.month_revenue;
    const monthCOGS = monthSalesData.month_cogs;
    const monthExp = monthExpenses.total_expenses;
    const estimatedNetProfit = monthRevenue - monthCOGS - monthExp;

    // Total Products & Low Stock Alert
    const productStats = db.prepare(`
      SELECT 
        COUNT(*) as total_products,
        SUM(CASE WHEN stock_quantity <= min_stock_alert THEN 1 ELSE 0 END) as low_stock_count
      FROM products 
      WHERE is_active = 1
    `).get();

    // Customer Debts (Receivables)
    const customerDebts = db.prepare(`
      SELECT COALESCE(SUM(balance), 0) as total_debt 
      FROM customers 
      WHERE balance > 0
    `).get();

    // Supplier Debts (Payables)
    const supplierDebts = db.prepare(`
      SELECT COALESCE(SUM(balance), 0) as total_payable 
      FROM suppliers 
      WHERE balance > 0
    `).get();

    // Last 7 days sales for chart
    const last7DaysSales = db.prepare(`
      SELECT 
        DATE(created_at) as sale_date,
        COALESCE(SUM(grand_total), 0) as daily_total
      FROM sales
      WHERE DATE(created_at) >= DATE('now', '-6 days')
      GROUP BY DATE(created_at)
      ORDER BY sale_date ASC
    `).all();

    // Top 5 selling products
    const topProducts = db.prepare(`
      SELECT 
        p.id, p.name, p.barcode,
        SUM(si.quantity - si.returned_quantity) as total_sold,
        SUM((si.quantity - si.returned_quantity) * si.unit_price) as total_revenue
      FROM sale_items si
      JOIN products p ON si.product_id = p.id
      GROUP BY p.id
      ORDER BY total_sold DESC
      LIMIT 5
    `).all();

    // Low stock items list
    const lowStockItems = db.prepare(`
      SELECT id, name, barcode, stock_quantity, min_stock_alert, unit
      FROM products
      WHERE is_active = 1 AND stock_quantity <= min_stock_alert
      ORDER BY stock_quantity ASC
      LIMIT 6
    `).all();

    res.json({
      today_sales: todaySales.total_revenue,
      today_orders: todaySales.orders_count,
      month_sales: monthRevenue,
      month_expenses: monthExp,
      estimated_net_profit: estimatedNetProfit,
      total_products: productStats.total_products,
      low_stock_count: productStats.low_stock_count || 0,
      total_customer_debts: customerDebts.total_debt,
      total_supplier_debts: supplierDebts.total_payable,
      sales_chart: last7DaysSales,
      top_products: topProducts,
      low_stock_items: lowStockItems
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET Detailed Financial Statement for custom range
router.get('/financials', (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const start = start_date || new Date().toISOString().slice(0, 7) + '-01';
    const end = end_date || new Date().toISOString().split('T')[0];

    const salesData = db.prepare(`
      SELECT 
        COALESCE(SUM(s.grand_total), 0) as total_sales,
        COALESCE(SUM((si.quantity - si.returned_quantity) * si.cost_price), 0) as total_cogs
      FROM sales s
      JOIN sale_items si ON si.sale_id = s.id
      WHERE DATE(s.created_at) >= ? AND DATE(s.created_at) <= ?
    `).get(start, end);

    const expensesData = db.prepare(`
      SELECT 
        category,
        SUM(amount) as category_total
      FROM expenses
      WHERE date >= ? AND date <= ?
      GROUP BY category
    `).all(start, end);

    const totalExpenses = expensesData.reduce((acc, curr) => acc + curr.category_total, 0);
    const grossProfit = salesData.total_sales - salesData.total_cogs;
    const netProfit = grossProfit - totalExpenses;

    res.json({
      period: { start, end },
      total_sales: salesData.total_sales,
      cogs: salesData.total_cogs,
      gross_profit: grossProfit,
      total_expenses: totalExpenses,
      net_profit: netProfit,
      expenses_by_category: expensesData
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
