const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'store.db');
const db = new Database(dbPath);

// Enable WAL mode for high concurrency & foreign keys
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDatabase() {
  db.exec(`
    -- Store Settings
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- Categories
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Products
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      barcode TEXT UNIQUE,
      name TEXT NOT NULL,
      category_id INTEGER,
      cost_price REAL NOT NULL DEFAULT 0,
      sell_price REAL NOT NULL DEFAULT 0,
      stock_quantity REAL NOT NULL DEFAULT 0,
      min_stock_alert REAL NOT NULL DEFAULT 5,
      unit TEXT DEFAULT 'قطعة',
      image_url TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
    );

    -- Customers
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      address TEXT,
      balance REAL DEFAULT 0, -- Positive means customer owes money (debt)
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Suppliers
    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      company TEXT,
      address TEXT,
      balance REAL DEFAULT 0, -- Positive means store owes supplier
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Sales
    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT UNIQUE NOT NULL,
      customer_id INTEGER,
      subtotal REAL NOT NULL DEFAULT 0,
      discount REAL NOT NULL DEFAULT 0,
      tax REAL NOT NULL DEFAULT 0,
      grand_total REAL NOT NULL DEFAULT 0,
      paid_amount REAL NOT NULL DEFAULT 0,
      payment_method TEXT NOT NULL DEFAULT 'cash', -- cash, card, credit (آجل)
      notes TEXT,
      status TEXT DEFAULT 'completed', -- completed, returned, partially_returned
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
    );

    -- Sale Items
    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity REAL NOT NULL,
      cost_price REAL NOT NULL,
      unit_price REAL NOT NULL,
      total_price REAL NOT NULL,
      returned_quantity REAL DEFAULT 0,
      FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    -- Purchases
    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT UNIQUE NOT NULL,
      supplier_id INTEGER,
      total_amount REAL NOT NULL DEFAULT 0,
      paid_amount REAL NOT NULL DEFAULT 0,
      payment_method TEXT DEFAULT 'cash',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL
    );

    -- Purchase Items
    CREATE TABLE IF NOT EXISTS purchase_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity REAL NOT NULL,
      unit_cost REAL NOT NULL,
      total_cost REAL NOT NULL,
      FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    -- Expenses
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL, -- إيجار، رواتب، كهرباء، صيانة، نثريات
      amount REAL NOT NULL,
      notes TEXT,
      date DATE NOT NULL DEFAULT CURRENT_DATE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Customer Payments (سندات قبض)
    CREATE TABLE IF NOT EXISTS customer_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      notes TEXT,
      payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
    );

    -- Users / Staff
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'cashier', -- admin, manager, cashier
      password_hash TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Initialize Default Settings if not exist
  const getSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');

  insertSetting.run('store_name', 'محل النور التجاري');
  insertSetting.run('store_phone', '770000000');
  insertSetting.run('store_address', 'الشارع الرئيسي - صنعاء');
  insertSetting.run('currency_symbol', 'ر.ي');
  insertSetting.run('tax_rate', '0');
  insertSetting.run('invoice_footer', 'شكراً لتعاملكم معنا، البضاعة المباعة ترد وتستبدل خلال 3 أيام.');

  // Seed sample categories & products if table is empty
  const countProducts = db.prepare('SELECT COUNT(*) as count FROM products').get().count;
  if (countProducts === 0) {
    seedInitialData();
  }
}

function seedInitialData() {
  const insertCat = db.prepare('INSERT INTO categories (name, description) VALUES (?, ?)');
  const cat1 = insertCat.run('مواد غذائية', 'المأكولات والمعلبات والمشروبات').lastInsertRowid;
  const cat2 = insertCat.run('إلكترونيات وهواتف', 'ملحقات الهواتف والأجهزة الإلكترونية').lastInsertRowid;
  const cat3 = insertCat.run('أدوات منزلية', 'مستلزمات المنزل والمطبخ').lastInsertRowid;
  const cat4 = insertCat.run('عطور وعناية', 'العطور ومستحضرات النظافة').lastInsertRowid;

  const insertProd = db.prepare(`
    INSERT INTO products (barcode, name, category_id, cost_price, sell_price, stock_quantity, min_stock_alert, unit)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertProd.run('6281001', 'أرز الشعلان بسمتي 5 كجم', cat1, 4500, 5200, 35, 10, 'كيس');
  insertProd.run('6281002', 'زيت طبخ عافية 1.5 لتر', cat1, 1400, 1750, 48, 12, 'حبة');
  insertProd.run('6281003', 'حليب نيدو مجفف 900 جرام', cat1, 3100, 3600, 15, 8, 'علبة');
  insertProd.run('6281004', 'شاي الكبوس أحمر 100 خيط', cat1, 650, 850, 80, 20, 'علبة');
  insertProd.run('6281005', 'سكر أبيض فاخر 10 كجم', cat1, 6800, 7600, 4, 10, 'كيس'); // Low stock for alert demo

  insertProd.run('6921001', 'شاحن أنكر سريع Type-C 20W', cat2, 2800, 3800, 24, 5, 'قطعة');
  insertProd.run('6921002', 'سماعة بلوتوث لاسلكية P9', cat2, 3500, 4900, 18, 5, 'قطعة');
  insertProd.run('6921003', 'سلك شحن قماشي معتمد 1 متر', cat2, 600, 1100, 42, 10, 'حبة');
  insertProd.run('6921004', 'باور بانك روموس 20000mAh', cat2, 7000, 9200, 3, 5, 'قطعة'); // Low stock

  insertProd.run('7281001', 'طقم فناجين قهوة 6 قطع', cat3, 1800, 2600, 12, 4, 'طقم');
  insertProd.run('7281002', 'ترمس شاي ستانلس 1.9 لتر', cat3, 4200, 5500, 7, 3, 'حبة');

  insertProd.run('8281001', 'عطر العود الملكي 100 مل', cat4, 6500, 9000, 10, 3, 'قارورة');
  insertProd.run('8281002', 'معطر جو برائحة اللافندر', cat4, 800, 1200, 30, 8, 'عبوة');

  // Seed Customers
  const insertCust = db.prepare('INSERT INTO customers (name, phone, address, balance) VALUES (?, ?, ?, ?)');
  insertCust.run('محمد أحمد السقاف', '771234567', 'شارع بغداد', 8500);
  insertCust.run('خالد عبد الله العريقي', '773456789', 'حدة', 0);
  insertCust.run('فاطمة صالح', '777889900', 'شارع التحرير', 3200);

  // Seed Suppliers
  const insertSup = db.prepare('INSERT INTO suppliers (name, phone, company, address, balance) VALUES (?, ?, ?, ?, ?)');
  insertSup.run('شركة البركة للتجارة والاستيراد', '775551122', 'البركة الغذائية', 'شارع الستين', 45000);
  insertSup.run('مؤسسة الفجر للإلكترونيات', '776662233', 'الفجر تك', 'شارع صخر', 12000);

  // Seed Expenses
  const insertExp = db.prepare('INSERT INTO expenses (title, category, amount, notes, date) VALUES (?, ?, ?, ?, ?)');
  const today = new Date().toISOString().split('T')[0];
  insertExp.run('فاتورة كهرباء المحل', 'كهرباء', 4500, 'سداد كهرباء المحل التجاري', today);
  insertExp.run('أكياس تغليف ومطبوعات', 'نثريات', 1800, 'شراء أكياس بلاستيكية وفواتير', today);

  // Seed Admin user
  const insertUser = db.prepare('INSERT INTO users (username, full_name, role) VALUES (?, ?, ?)');
  insertUser.run('admin', 'مدير النظام', 'admin');
  insertUser.run('cashier1', 'أحمد الكاشير', 'cashier');
}

initDatabase();

module.exports = db;
