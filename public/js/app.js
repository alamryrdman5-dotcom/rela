// Application State
const state = {
  activeTab: 'pos',
  cart: [],
  products: [],
  filteredProducts: [],
  categories: [],
  customers: [],
  suppliers: [],
  settings: {},
  selectedCategoryId: null,
  paymentMethod: 'cash',
  salesChartInstance: null,
  deferredPrompt: null
};

// Register PWA Service Worker for Mobile App support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('Service Worker Registered!', reg.scope))
      .catch(err => console.log('Service Worker registration failed:', err));
  });
}

// Handle PWA Install Prompt
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  state.deferredPrompt = e;
  const installBtn = document.getElementById('pwa-install-btn');
  if (installBtn) installBtn.classList.remove('hidden');
});

function installPWA() {
  if (state.deferredPrompt) {
    state.deferredPrompt.prompt();
    state.deferredPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        showToast('تم تثبيت التطبيق بنجاح على جهازك!', 'success');
      }
      state.deferredPrompt = null;
    });
  }
}

// DOM Elements & Initialization
document.addEventListener('DOMContentLoaded', async () => {
  lucide.createIcons();
  startLiveClock();
  setupKeyboardShortcuts();

  await loadStoreSettings();
  await loadCategories();
  await loadCustomers();
  await loadPOSProducts();
  loadDashboardData();
  switchTab('pos');
});

// =================== LIVE CLOCK & HELPERS ===================
function startLiveClock() {
  const clockEl = document.getElementById('live-clock');
  const update = () => {
    const now = new Date();
    clockEl.textContent = now.toLocaleDateString('ar-YE', { weekday: 'short' }) + ' ' + now.toLocaleTimeString('ar-YE');
  };
  update();
  setInterval(update, 1000);
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  const colors = {
    success: 'bg-emerald-600 text-white',
    error: 'bg-rose-600 text-white',
    info: 'bg-slate-800 text-white'
  };
  toast.className = `${colors[type] || colors.info} px-4 py-3 rounded-xl shadow-lg text-xs font-bold flex items-center gap-2 toast-animate pointer-events-auto`;
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3500);
}

function formatCurrency(amount) {
  const symbol = state.settings.currency_symbol || 'ر.ي';
  return `${Number(amount || 0).toLocaleString('ar-YE')} ${symbol}`;
}

// =================== KEYBOARD SHORTCUTS ===================
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F9') {
      e.preventDefault();
      if (state.activeTab !== 'pos') switchTab('pos');
      checkoutSale();
    } else if (e.key === 'F2') {
      e.preventDefault();
      if (state.activeTab !== 'pos') switchTab('pos');
      const search = document.getElementById('pos-search-input');
      if (search) search.focus();
    } else if (e.key === 'Escape') {
      document.querySelectorAll('.fixed:not(.hidden)').forEach(modal => {
        if (modal.id !== 'toast-container') modal.classList.add('hidden');
      });
    }
  });
}

// =================== TAB NAVIGATION ===================
function switchTab(tabId) {
  state.activeTab = tabId;
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.remove('bg-brand-50', 'text-brand-700', 'font-bold');
  });

  const targetTab = document.getElementById(`tab-${tabId}`);
  const targetNav = document.getElementById(`nav-${tabId}`);
  if (targetTab) targetTab.classList.remove('hidden');
  if (targetNav) targetNav.classList.add('bg-brand-50', 'text-brand-700', 'font-bold');

  // Trigger data reload for specific tabs
  if (tabId === 'dashboard') loadDashboardData();
  else if (tabId === 'pos') loadPOSProducts();
  else if (tabId === 'products') loadProductsTable();
  else if (tabId === 'sales') loadSalesHistory();
  else if (tabId === 'purchases') loadPurchasesAndSuppliers();
  else if (tabId === 'customers') loadCustomersTable();
  else if (tabId === 'expenses') loadExpensesTable();
  else if (tabId === 'reports') loadFinancialReports();

  lucide.createIcons();
}

// =================== MODAL UTILITIES ===================
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
  lucide.createIcons();
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}

// =================== SETTINGS ===================
async function loadStoreSettings() {
  try {
    const res = await fetch('/api/settings');
    state.settings = await res.json();
    document.getElementById('header-store-name').textContent = state.settings.store_name || 'محل النور التجاري';
    document.querySelectorAll('.currency-label').forEach(el => {
      el.textContent = state.settings.currency_symbol || 'ر.ي';
    });

    // Populate Settings form
    document.getElementById('setting-store-name').value = state.settings.store_name || '';
    document.getElementById('setting-store-phone').value = state.settings.store_phone || '';
    document.getElementById('setting-currency').value = state.settings.currency_symbol || 'ر.ي';
    document.getElementById('setting-store-address').value = state.settings.store_address || '';
    document.getElementById('setting-invoice-footer').value = state.settings.invoice_footer || '';
  } catch (err) {
    console.error('Settings load error:', err);
  }
}

async function saveStoreSettings(e) {
  e.preventDefault();
  const updates = {
    store_name: document.getElementById('setting-store-name').value,
    store_phone: document.getElementById('setting-store-phone').value,
    currency_symbol: document.getElementById('setting-currency').value,
    store_address: document.getElementById('setting-store-address').value,
    invoice_footer: document.getElementById('setting-invoice-footer').value
  };

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (res.ok) {
      await loadStoreSettings();
      showToast('تم حفظ إعدادات المحل بنجاح', 'success');
    }
  } catch (err) {
    showToast('حدث خطأ أثناء حفظ الإعدادات', 'error');
  }
}

// =================== CATEGORIES & CUSTOMERS ===================
async function loadCategories() {
  try {
    const res = await fetch('/api/categories');
    state.categories = await res.json();
    renderPOSCategoryPills();

    // Populate category dropdowns in modals
    const modalSelect = document.getElementById('modal-product-cat-select');
    const filterSelect = document.getElementById('products-category-filter');
    if (modalSelect) {
      modalSelect.innerHTML = '<option value="">بدون تصنيف</option>' + 
        state.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    }
    if (filterSelect) {
      filterSelect.innerHTML = '<option value="">جميع التصنيفات</option>' + 
        state.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    }
  } catch (err) {
    console.error('Load categories error:', err);
  }
}

async function submitAddCategory(e) {
  e.preventDefault();
  const form = e.target;
  const formData = new FormData(form);
  try {
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(formData))
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast('تمت إضافة التصنيف بنجاح', 'success');
    form.reset();
    closeModal('modal-add-category');
    await loadCategories();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadCustomers() {
  try {
    const res = await fetch('/api/customers');
    state.customers = await res.json();
    const select = document.getElementById('pos-customer-select');
    if (select) {
      select.innerHTML = '<option value="">عميل نقدي عام (زبون المحل)</option>' +
        state.customers.map(c => `<option value="${c.id}">${c.name} ${c.balance > 0 ? `(عليه دين: ${c.balance})` : ''}</option>`).join('');
    }
  } catch (err) {
    console.error('Load customers error:', err);
  }
}

async function submitAddCustomer(e) {
  e.preventDefault();
  const form = e.target;
  const formData = new FormData(form);
  try {
    const res = await fetch('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(formData))
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast('تمت إضافة العميل بنجاح', 'success');
    form.reset();
    closeModal('modal-add-customer');
    await loadCustomers();
    if (state.activeTab === 'customers') loadCustomersTable();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// =================== 1. DASHBOARD ===================
async function loadDashboardData() {
  try {
    const res = await fetch('/api/reports/dashboard');
    const data = await res.json();

    document.getElementById('kpi-today-sales').textContent = Number(data.today_sales).toLocaleString('ar-YE');
    document.getElementById('kpi-today-orders').textContent = data.today_orders;
    document.getElementById('kpi-month-profit').textContent = Number(data.estimated_net_profit).toLocaleString('ar-YE');
    document.getElementById('kpi-low-stock').textContent = data.low_stock_count;
    document.getElementById('kpi-customer-debts').textContent = Number(data.total_customer_debts).toLocaleString('ar-YE');

    // Render Chart
    renderSalesChart(data.sales_chart || []);

    // Render Top Products
    const topListEl = document.getElementById('top-products-list');
    if (data.top_products && data.top_products.length > 0) {
      topListEl.innerHTML = data.top_products.map((p, idx) => `
        <div class="flex items-center justify-between text-xs p-2 rounded-xl bg-slate-50 border border-slate-100">
          <div class="flex items-center gap-2">
            <span class="w-5 h-5 rounded-full bg-brand-100 text-brand-800 flex items-center justify-center font-bold text-[10px]">${idx + 1}</span>
            <span class="font-bold text-slate-800">${p.name}</span>
          </div>
          <span class="font-semibold text-slate-500">${p.total_sold} حبة</span>
        </div>
      `).join('');
    } else {
      topListEl.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">لا توجد مبيعات مسجلة حتى الآن</p>';
    }

    // Render Low Stock Table
    const lowStockTable = document.getElementById('low-stock-table-body');
    if (data.low_stock_items && data.low_stock_items.length > 0) {
      lowStockTable.innerHTML = data.low_stock_items.map(item => `
        <tr class="hover:bg-amber-50/50">
          <td class="py-2.5 px-3 font-bold text-slate-800">${item.name}</td>
          <td class="py-2.5 px-3 text-slate-500">${item.barcode}</td>
          <td class="py-2.5 px-3">
            <span class="px-2 py-0.5 rounded-full text-[11px] font-black bg-rose-100 text-rose-700">
              ${item.stock_quantity} ${item.unit}
            </span>
          </td>
          <td class="py-2.5 px-3 text-slate-500">${item.min_stock_alert} ${item.unit}</td>
          <td class="py-2.5 px-3 text-center">
            <button onclick="switchTab('purchases'); openModal('modal-add-purchase')" class="text-[11px] font-bold text-brand-700 bg-brand-50 hover:bg-brand-100 px-2.5 py-1 rounded-lg">
              إعادة شراء
            </button>
          </td>
        </tr>
      `).join('');
    } else {
      lowStockTable.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-emerald-600 font-medium">المخزون ممتاز، لا توجد تنبيهات لنفاد الكميات</td></tr>';
    }
  } catch (err) {
    console.error('Dashboard load error:', err);
  }
}

function renderSalesChart(dataPoints) {
  const ctx = document.getElementById('salesChart');
  if (!ctx) return;

  if (state.salesChartInstance) {
    state.salesChartInstance.destroy();
  }

  const labels = dataPoints.map(dp => dp.sale_date);
  const values = dataPoints.map(dp => dp.daily_total);

  state.salesChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels.length ? labels : ['اليوم'],
      datasets: [{
        label: 'المبيعات اليومية',
        data: values.length ? values : [0],
        borderColor: '#16a34a',
        backgroundColor: 'rgba(22, 163, 74, 0.08)',
        fill: true,
        tension: 0.35,
        borderWidth: 2.5,
        pointBackgroundColor: '#16a34a',
        pointRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, grid: { color: '#f1f5f9' } },
        x: { grid: { display: false } }
      }
    }
  });
}

// =================== 2. POS SCREEN ===================
async function loadPOSProducts() {
  try {
    const res = await fetch('/api/products');
    state.products = await res.json();
    filterPOSProducts();
  } catch (err) {
    console.error('POS Products load error:', err);
  }
}

function renderPOSCategoryPills() {
  const container = document.getElementById('pos-categories-pills');
  if (!container) return;

  let html = `
    <button onclick="selectPOSCategory(null)" class="pos-cat-pill ${state.selectedCategoryId === null ? 'active bg-brand-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'} px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition">
      الكل
    </button>
  `;

  state.categories.forEach(c => {
    const isActive = state.selectedCategoryId === c.id;
    html += `
      <button onclick="selectPOSCategory(${c.id})" class="pos-cat-pill ${isActive ? 'active bg-brand-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'} px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition">
        ${c.name}
      </button>
    `;
  });

  container.innerHTML = html;
}

function selectPOSCategory(id) {
  state.selectedCategoryId = id;
  renderPOSCategoryPills();
  filterPOSProducts();
}

function filterPOSProducts() {
  const searchInput = document.getElementById('pos-search-input');
  const term = searchInput ? searchInput.value.trim().toLowerCase() : '';

  state.filteredProducts = state.products.filter(p => {
    const matchCategory = state.selectedCategoryId === null || p.category_id === state.selectedCategoryId;
    const matchSearch = term === '' || p.name.toLowerCase().includes(term) || (p.barcode && p.barcode.toLowerCase().includes(term));
    return matchCategory && matchSearch;
  });

  // Fast Barcode Scanner direct enter detection
  if (term !== '' && state.filteredProducts.length === 1 && state.filteredProducts[0].barcode && state.filteredProducts[0].barcode.toLowerCase() === term) {
    addToCart(state.filteredProducts[0]);
    searchInput.value = '';
    return;
  }

  renderPOSProductsGrid();
}

function renderPOSProductsGrid() {
  const grid = document.getElementById('pos-products-grid');
  if (!grid) return;

  if (state.filteredProducts.length === 0) {
    grid.innerHTML = '<div class="col-span-full py-12 text-center text-slate-400 text-xs font-medium">لا توجد منتجات مطابقة للبحث</div>';
    return;
  }

  grid.innerHTML = state.filteredProducts.map(p => {
    const isOut = p.stock_quantity <= 0;
    const isLow = p.stock_quantity <= p.min_stock_alert && !isOut;

    return `
      <div onclick="${isOut ? '' : `addToCartById(${p.id})`}" class="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md hover:border-brand-500 cursor-pointer transition flex flex-col justify-between select-none ${isOut ? 'opacity-60 cursor-not-allowed bg-slate-50' : ''}">
        <div>
          <div class="flex items-center justify-between gap-1 mb-1.5">
            <span class="text-[10px] font-mono text-slate-400 truncate">${p.barcode || ''}</span>
            <span class="text-[10px] px-2 py-0.5 rounded-full font-bold ${isOut ? 'bg-rose-100 text-rose-700' : isLow ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}">
              ${isOut ? 'نفدت الكمية' : `${p.stock_quantity} ${p.unit}`}
            </span>
          </div>
          <h4 class="font-bold text-xs text-slate-800 line-clamp-2 leading-relaxed">${p.name}</h4>
        </div>

        <div class="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
          <span class="text-xs font-black text-brand-700">
            ${Number(p.sell_price).toLocaleString('ar-YE')} <span class="text-[10px] font-normal currency-label">${state.settings.currency_symbol || 'ر.ي'}</span>
          </span>
          <button class="w-6 h-6 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center font-bold text-sm hover:bg-brand-600 hover:text-white transition">
            +
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function addToCartById(productId) {
  const product = state.products.find(p => p.id === productId);
  if (product) addToCart(product);
}

function addToCart(product) {
  const existing = state.cart.find(item => item.product_id === product.id);

  if (existing) {
    if (existing.quantity + 1 > product.stock_quantity) {
      showToast(`الكمية المتوفرة من ${product.name} هي ${product.stock_quantity} فقط`, 'error');
      return;
    }
    existing.quantity += 1;
  } else {
    if (product.stock_quantity < 1) {
      showToast(`عذراً، المنتج ${product.name} غير متوفر بالمخزون حالياً`, 'error');
      return;
    }
    state.cart.push({
      product_id: product.id,
      name: product.name,
      barcode: product.barcode,
      unit_price: product.sell_price,
      cost_price: product.cost_price,
      unit: product.unit,
      quantity: 1,
      max_stock: product.stock_quantity
    });
  }

  renderCart();
}

function updateCartQty(productId, delta) {
  const item = state.cart.find(i => i.product_id === productId);
  if (!item) return;

  const newQty = item.quantity + delta;
  if (newQty <= 0) {
    removeFromCart(productId);
    return;
  }
  if (newQty > item.max_stock) {
    showToast(`الكمية القصوى المتوفرة هي ${item.max_stock}`, 'error');
    return;
  }
  item.quantity = newQty;
  renderCart();
}

function removeFromCart(productId) {
  state.cart = state.cart.filter(i => i.product_id !== productId);
  renderCart();
}

function clearCart() {
  state.cart = [];
  document.getElementById('cart-discount').value = 0;
  renderCart();
}

function renderCart() {
  const container = document.getElementById('cart-items-container');
  const emptyState = document.getElementById('cart-empty-state');

  if (state.cart.length === 0) {
    container.innerHTML = `
      <div id="cart-empty-state" class="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
        <i data-lucide="shopping-cart" class="w-12 h-12 mb-2 stroke-[1.5]"></i>
        <p class="text-sm font-medium">السلة فارغة حالياً</p>
        <p class="text-xs mt-1">اختر المنتجات من القائمة أو امسح الباركود</p>
      </div>
    `;
    lucide.createIcons();
    calculateCartTotals();
    return;
  }

  container.innerHTML = state.cart.map(item => `
    <div class="py-2.5 flex items-center justify-between gap-2 text-xs">
      <div class="flex-1 min-w-0">
        <h5 class="font-bold text-slate-800 truncate">${item.name}</h5>
        <div class="text-[11px] text-slate-400">
          ${Number(item.unit_price).toLocaleString('ar-YE')} × ${item.quantity} = 
          <span class="font-bold text-slate-700">${Number(item.unit_price * item.quantity).toLocaleString('ar-YE')}</span>
        </div>
      </div>

      <!-- Quantity Stepper -->
      <div class="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
        <button onclick="updateCartQty(${item.product_id}, -1)" class="w-6 h-6 rounded-lg bg-white text-slate-700 flex items-center justify-center font-bold text-xs hover:bg-slate-200">
          -
        </button>
        <span class="w-7 text-center font-bold text-xs">${item.quantity}</span>
        <button onclick="updateCartQty(${item.product_id}, 1)" class="w-6 h-6 rounded-lg bg-white text-slate-700 flex items-center justify-center font-bold text-xs hover:bg-slate-200">
          +
        </button>
      </div>

      <!-- Delete Button -->
      <button onclick="removeFromCart(${item.product_id})" class="text-slate-300 hover:text-rose-600 p-1">
        <i data-lucide="x" class="w-4 h-4"></i>
      </button>
    </div>
  `).join('');

  lucide.createIcons();
  calculateCartTotals();
}

function calculateCartTotals() {
  const subtotal = state.cart.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
  const discountInput = document.getElementById('cart-discount');
  const discount = discountInput ? (parseFloat(discountInput.value) || 0) : 0;
  const grandTotal = Math.max(0, subtotal - discount);

  document.getElementById('cart-subtotal').textContent = Number(subtotal).toLocaleString('ar-YE');
  document.getElementById('cart-grand-total').textContent = Number(grandTotal).toLocaleString('ar-YE');
}

function setPaymentMethod(method) {
  state.paymentMethod = method;
  document.querySelectorAll('.pay-method-btn').forEach(btn => {
    btn.classList.remove('bg-brand-50', 'border-brand-500', 'text-brand-700', 'active');
    btn.classList.add('bg-white', 'border-slate-200', 'text-slate-600');
  });

  const activeBtn = document.getElementById(`btn-pay-${method}`);
  if (activeBtn) {
    activeBtn.classList.remove('bg-white', 'border-slate-200', 'text-slate-600');
    activeBtn.classList.add('bg-brand-50', 'border-brand-500', 'text-brand-700', 'active');
  }
}

async function checkoutSale() {
  if (state.cart.length === 0) {
    showToast('السلة فارغة، يرجى إضافة منتجات أولاً', 'error');
    return;
  }

  const customerSelect = document.getElementById('pos-customer-select');
  const customerId = customerSelect && customerSelect.value ? parseInt(customerSelect.value) : null;

  if (state.paymentMethod === 'credit' && !customerId) {
    showToast('للبيع بالآجل، يجب اختيار عميل محدد لتسجيل الدين في حسابه', 'error');
    return;
  }

  const discount = parseFloat(document.getElementById('cart-discount').value) || 0;
  const subtotal = state.cart.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
  const grandTotal = Math.max(0, subtotal - discount);

  const payload = {
    customer_id: customerId,
    discount: discount,
    payment_method: state.paymentMethod,
    paid_amount: state.paymentMethod === 'credit' ? 0 : grandTotal,
    items: state.cart.map(i => ({
      product_id: i.product_id,
      quantity: i.quantity,
      unit_price: i.unit_price
    }))
  };

  try {
    const btn = document.getElementById('btn-checkout');
    btn.disabled = true;
    btn.innerHTML = 'جاري تسجيل الفاتورة...';

    const res = await fetch('/api/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="check-circle-2" class="w-5 h-5"></i><span>إتمام البيع وطباعة الفاتورة [F9]</span>';
    lucide.createIcons();

    if (!res.ok) throw new Error(data.error);

    showToast(`تم إتمام الفاتورة ${data.invoice_number} بنجاح!`, 'success');
    
    // Open Receipt Preview Modal
    displayInvoiceReceipt(data);
    clearCart();
    await loadPOSProducts();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// =================== 3. INVOICE RECEIPT DISPLAY ===================
function displayInvoiceReceipt(sale) {
  document.getElementById('receipt-store-name').textContent = state.settings.store_name || 'محل النور التجاري';
  document.getElementById('receipt-store-phone').textContent = `هاتف: ${state.settings.store_phone || '770000000'}`;
  document.getElementById('receipt-store-address').textContent = state.settings.store_address || '';
  document.getElementById('receipt-inv-num').textContent = sale.invoice_number;
  document.getElementById('receipt-customer').textContent = sale.customer_name || 'زبون المحل';
  document.getElementById('receipt-date').textContent = new Date(sale.created_at || Date.now()).toLocaleString('ar-YE');
  
  const paymentLabels = { cash: 'نقداً', card: 'شبكة / بطاقة', credit: 'آجل' };
  document.getElementById('receipt-pay-method').textContent = paymentLabels[sale.payment_method] || 'نقداً';

  const tbody = document.getElementById('receipt-items-body');
  tbody.innerHTML = (sale.items || []).map(item => `
    <tr>
      <td class="py-1 font-bold">${item.product_name}</td>
      <td class="py-1 text-center">${item.quantity}</td>
      <td class="py-1 text-left">${Number(item.unit_price).toLocaleString('ar-YE')}</td>
      <td class="py-1 text-left font-bold">${Number(item.total_price).toLocaleString('ar-YE')}</td>
    </tr>
  `).join('');

  document.getElementById('receipt-subtotal').textContent = formatCurrency(sale.subtotal);
  document.getElementById('receipt-discount').textContent = formatCurrency(sale.discount);
  document.getElementById('receipt-grand-total').textContent = Number(sale.grand_total).toLocaleString('ar-YE');
  document.getElementById('receipt-footer-text').textContent = state.settings.invoice_footer || '';

  // Render Barcode
  JsBarcode('#receipt-barcode', sale.invoice_number, {
    format: 'CODE128',
    width: 1.5,
    height: 35,
    displayValue: false
  });

  openModal('modal-invoice-receipt');
}

// =================== 4. PRODUCTS & INVENTORY TABLE ===================
async function loadProductsTable() {
  try {
    const search = document.getElementById('products-search-input').value;
    const cat = document.getElementById('products-category-filter').value;
    const lowStock = document.getElementById('products-lowstock-filter').checked;

    let url = `/api/products?search=${encodeURIComponent(search)}&category_id=${cat}`;
    if (lowStock) url += '&low_stock=true';

    const res = await fetch(url);
    const products = await res.json();

    const tbody = document.getElementById('products-table-body');
    if (products.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center py-6 text-slate-400">لا توجد منتجات مسجلة</td></tr>';
      return;
    }

    tbody.innerHTML = products.map(p => {
      const profit = p.sell_price - p.cost_price;
      const isLow = p.stock_quantity <= p.min_stock_alert;

      return `
        <tr class="hover:bg-slate-50">
          <td class="py-3 px-4 font-mono text-slate-600">${p.barcode || '-'}</td>
          <td class="py-3 px-4 font-bold text-slate-900">${p.name}</td>
          <td class="py-3 px-4 text-slate-500">${p.category_name || 'بدون تصنيف'}</td>
          <td class="py-3 px-4 font-mono">${Number(p.cost_price).toLocaleString('ar-YE')}</td>
          <td class="py-3 px-4 font-mono font-bold text-brand-700">${Number(p.sell_price).toLocaleString('ar-YE')}</td>
          <td class="py-3 px-4 text-emerald-600 font-bold font-mono">+${Number(profit).toLocaleString('ar-YE')}</td>
          <td class="py-3 px-4">
            <span class="px-2.5 py-1 rounded-full text-xs font-black ${isLow ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'}">
              ${p.stock_quantity} ${p.unit}
            </span>
          </td>
          <td class="py-3 px-4 text-center">
            <button onclick="deleteProduct(${p.id})" class="text-rose-500 hover:text-rose-700 text-xs font-bold" title="حذف">
              حذف
            </button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Products table load error:', err);
  }
}

async function submitAddProduct(e) {
  e.preventDefault();
  const form = e.target;
  const formData = new FormData(form);
  try {
    const res = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(formData))
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast('تمت إضافة المنتج بنجاح', 'success');
    form.reset();
    closeModal('modal-add-product');
    await loadPOSProducts();
    if (state.activeTab === 'products') loadProductsTable();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteProduct(id) {
  if (!confirm('هل أنت متأكد من حذف هذا المنتج؟')) return;
  try {
    const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('تم حذف المنتج', 'success');
      loadProductsTable();
      loadPOSProducts();
    }
  } catch (err) {
    showToast('حدث خطأ أثناء الحذف', 'error');
  }
}

function filterLowStockOnly() {
  document.getElementById('products-lowstock-filter').checked = true;
  loadProductsTable();
}

// =================== 5. SALES HISTORY ===================
async function loadSalesHistory() {
  try {
    const res = await fetch('/api/sales');
    const sales = await res.json();

    const tbody = document.getElementById('sales-table-body');
    if (sales.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="text-center py-6 text-slate-400">لا توجد مبيعات سابقة</td></tr>';
      return;
    }

    const payLabels = { cash: 'نقداً', card: 'شبكة', credit: 'آجل' };

    tbody.innerHTML = sales.map(s => `
      <tr class="hover:bg-slate-50">
        <td class="py-3 px-4 font-bold font-mono text-slate-900">${s.invoice_number}</td>
        <td class="py-3 px-4 text-slate-500">${new Date(s.created_at).toLocaleString('ar-YE')}</td>
        <td class="py-3 px-4 font-medium text-slate-800">${s.customer_name || 'زبون المحل'}</td>
        <td class="py-3 px-4">
          <span class="px-2 py-0.5 rounded-lg text-xs font-bold ${s.payment_method === 'credit' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'}">
            ${payLabels[s.payment_method] || s.payment_method}
          </span>
        </td>
        <td class="py-3 px-4 font-bold font-mono">${Number(s.grand_total).toLocaleString('ar-YE')}</td>
        <td class="py-3 px-4 font-mono text-slate-600">${Number(s.paid_amount).toLocaleString('ar-YE')}</td>
        <td class="py-3 px-4 font-mono text-emerald-600 font-bold">+${Number(s.estimated_profit || 0).toLocaleString('ar-YE')}</td>
        <td class="py-3 px-4">
          <span class="text-xs ${s.status === 'completed' ? 'text-emerald-600' : 'text-amber-600'} font-bold">
            ${s.status === 'completed' ? 'مكتملة' : 'مرتجع جزئي'}
          </span>
        </td>
        <td class="py-3 px-4 text-center">
          <button onclick="viewSaleDetails(${s.id})" class="text-brand-600 hover:text-brand-800 text-xs font-bold">
            عرض الفاتورة
          </button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Sales history error:', err);
  }
}

async function viewSaleDetails(saleId) {
  try {
    const res = await fetch(`/api/sales/${saleId}`);
    const sale = await res.json();
    displayInvoiceReceipt(sale);
  } catch (err) {
    showToast('تعذر جلب تفاصيل الفاتورة', 'error');
  }
}

// =================== 6. CUSTOMERS & DEBTS ===================
async function loadCustomersTable() {
  try {
    const res = await fetch('/api/customers');
    const customers = await res.json();

    const tbody = document.getElementById('customers-table-body');
    if (customers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center py-6 text-slate-400">لا يوجد عملاء مسجلون</td></tr>';
      return;
    }

    tbody.innerHTML = customers.map(c => `
      <tr class="hover:bg-slate-50">
        <td class="py-3 px-4 font-bold text-slate-900">${c.name}</td>
        <td class="py-3 px-4 text-slate-600 font-mono">${c.phone || '-'}</td>
        <td class="py-3 px-4 text-slate-500">${c.address || '-'}</td>
        <td class="py-3 px-4">
          <span class="font-black text-sm ${c.balance > 0 ? 'text-rose-600' : 'text-slate-600'} font-mono">
            ${Number(c.balance).toLocaleString('ar-YE')} <span class="text-xs font-normal currency-label">${state.settings.currency_symbol || 'ر.ي'}</span>
          </span>
        </td>
        <td class="py-3 px-4 text-center">
          ${c.balance > 0 ? `
            <button onclick="openCustomerPayment(${c.id}, '${c.name}', ${c.balance})" class="bg-brand-50 hover:bg-brand-100 text-brand-700 px-3 py-1 rounded-xl text-xs font-bold transition">
              سند قبض / سداد دين
            </button>
          ` : '<span class="text-xs text-slate-400 font-medium">لا توجد ديون</span>'}
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Customers table error:', err);
  }
}

function openCustomerPayment(id, name, balance) {
  document.getElementById('payment-customer-id').value = id;
  document.getElementById('payment-customer-name').textContent = name;
  document.getElementById('payment-customer-balance').textContent = formatCurrency(balance);
  document.getElementById('payment-amount').value = balance;
  openModal('modal-customer-payment');
}

async function submitCustomerPayment(e) {
  e.preventDefault();
  const id = document.getElementById('payment-customer-id').value;
  const amount = document.getElementById('payment-amount').value;
  const notes = document.getElementById('payment-notes').value;

  try {
    const res = await fetch(`/api/customers/${id}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, notes })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast(data.message, 'success');
    closeModal('modal-customer-payment');
    loadCustomersTable();
    loadDashboardData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// =================== 7. PURCHASES & SUPPLIERS ===================
async function loadPurchasesAndSuppliers() {
  try {
    const [supRes, purRes] = await Promise.all([
      fetch('/api/suppliers'),
      fetch('/api/purchases')
    ]);
    const suppliers = await supRes.json();
    const purchases = await purRes.json();

    // Render suppliers list
    const supList = document.getElementById('suppliers-list');
    if (suppliers.length === 0) {
      supList.innerHTML = '<p class="text-xs text-slate-400 py-3 text-center">لا يوجد موردون مسجلون</p>';
    } else {
      supList.innerHTML = suppliers.map(s => `
        <div class="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
          <div class="flex justify-between items-center text-xs">
            <span class="font-bold text-slate-800">${s.name}</span>
            <span class="font-bold text-rose-600 font-mono">${Number(s.balance).toLocaleString('ar-YE')} <span class="currency-label">${state.settings.currency_symbol || 'ر.ي'}</span></span>
          </div>
          <p class="text-[11px] text-slate-500">${s.company ? s.company + ' | ' : ''}${s.phone || ''}</p>
        </div>
      `).join('');
    }

    // Populate suppliers dropdown in purchase modal
    const supSelect = document.getElementById('purchase-supplier-select');
    if (supSelect) {
      supSelect.innerHTML = '<option value="">مورد عام</option>' +
        suppliers.map(s => `<option value="${s.id}">${s.name} ${s.company ? `(${s.company})` : ''}</option>`).join('');
    }

    // Populate products dropdown in purchase modal
    const prodSelect = document.getElementById('purchase-product-select');
    if (prodSelect) {
      prodSelect.innerHTML = '<option value="">اختر المنتج المراد شراءه...</option>' +
        state.products.map(p => `<option value="${p.id}" data-cost="${p.cost_price}">${p.name} (المخزون الحالي: ${p.stock_quantity})</option>`).join('');
    }

    // Render purchases table
    const tbody = document.getElementById('purchases-table-body');
    if (purchases.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center py-6 text-slate-400">لا توجد فواتير شراء مسجلة</td></tr>';
      return;
    }

    tbody.innerHTML = purchases.map(p => `
      <tr class="hover:bg-slate-50">
        <td class="py-2.5 px-3 font-bold font-mono text-slate-800">${p.invoice_number}</td>
        <td class="py-2.5 px-3 text-slate-700">${p.supplier_name || 'مورد عام'}</td>
        <td class="py-2.5 px-3 text-slate-500">${new Date(p.created_at).toLocaleDateString('ar-YE')}</td>
        <td class="py-2.5 px-3 font-bold font-mono">${Number(p.total_amount).toLocaleString('ar-YE')}</td>
        <td class="py-2.5 px-3 font-mono text-emerald-600">${Number(p.paid_amount).toLocaleString('ar-YE')}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Purchases & Suppliers load error:', err);
  }
}

async function submitAddSupplier(e) {
  e.preventDefault();
  const form = e.target;
  const formData = new FormData(form);
  try {
    const res = await fetch('/api/suppliers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(formData))
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast('تمت إضافة المورد بنجاح', 'success');
    form.reset();
    closeModal('modal-add-supplier');
    loadPurchasesAndSuppliers();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function onPurchaseProductSelect() {
  const select = document.getElementById('purchase-product-select');
  const selectedOption = select.options[select.selectedIndex];
  if (selectedOption && selectedOption.dataset.cost) {
    document.getElementById('purchase-unit-cost').value = selectedOption.dataset.cost;
  }
}

async function submitAddPurchase(e) {
  e.preventDefault();
  const supplierId = document.getElementById('purchase-supplier-select').value;
  const productId = document.getElementById('purchase-product-select').value;
  const quantity = parseFloat(document.getElementById('purchase-quantity').value);
  const unitCost = parseFloat(document.getElementById('purchase-unit-cost').value);
  const paid = parseFloat(document.getElementById('purchase-paid').value) || 0;
  const paymentMethod = document.getElementById('purchase-payment-method').value;

  if (!productId || isNaN(quantity) || quantity <= 0) {
    showToast('يرجى تحديد المنتج والكمية بدقة', 'error');
    return;
  }

  const payload = {
    supplier_id: supplierId ? parseInt(supplierId) : null,
    payment_method: paymentMethod,
    paid_amount: paid,
    items: [
      { product_id: parseInt(productId), quantity: quantity, unit_cost: unitCost }
    ]
  };

  try {
    const res = await fetch('/api/purchases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast(`تم تسجيل فاتورة الشراء ${data.invoice_number} وإيداع الكمية في المخزون!`, 'success');
    document.getElementById('form-add-purchase').reset();
    closeModal('modal-add-purchase');
    await loadPurchasesAndSuppliers();
    await loadPOSProducts();
    await loadDashboardData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// =================== 8. EXPENSES ===================
async function loadExpensesTable() {
  try {
    const res = await fetch('/api/expenses');
    const expenses = await res.json();

    const tbody = document.getElementById('expenses-table-body');
    if (expenses.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-6 text-slate-400">لا توجد مصروفات مسجلة</td></tr>';
      return;
    }

    tbody.innerHTML = expenses.map(e => `
      <tr class="hover:bg-slate-50">
        <td class="py-3 px-4 font-bold text-slate-800">${e.title}</td>
        <td class="py-3 px-4">
          <span class="px-2 py-0.5 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700">
            ${e.category}
          </span>
        </td>
        <td class="py-3 px-4 font-black font-mono text-rose-600">${Number(e.amount).toLocaleString('ar-YE')}</td>
        <td class="py-3 px-4 text-slate-500">${e.date}</td>
        <td class="py-3 px-4 text-slate-400">${e.notes || '-'}</td>
        <td class="py-3 px-4 text-center">
          <button onclick="deleteExpense(${e.id})" class="text-rose-500 hover:text-rose-700 text-xs font-bold">
            حذف
          </button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Expenses load error:', err);
  }
}

async function submitAddExpense(e) {
  e.preventDefault();
  const form = e.target;
  const formData = new FormData(form);
  try {
    const res = await fetch('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(formData))
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showToast('تم تسجيل المصروف بنجاح', 'success');
    form.reset();
    closeModal('modal-add-expense');
    loadExpensesTable();
    loadDashboardData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteExpense(id) {
  if (!confirm('هل أنت متأكد من حذف هذا المصروف؟')) return;
  try {
    const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('تم حذف المصروف', 'success');
      loadExpensesTable();
      loadDashboardData();
    }
  } catch (err) {
    showToast('حدث خطأ أثناء الحذف', 'error');
  }
}

// =================== 9. FINANCIAL REPORTS (P&L) ===================
async function loadFinancialReports() {
  try {
    const startInput = document.getElementById('report-start-date');
    const endInput = document.getElementById('report-end-date');

    if (!startInput.value) {
      const today = new Date().toISOString().split('T')[0];
      startInput.value = today.slice(0, 7) + '-01';
      endInput.value = today;
    }

    const res = await fetch(`/api/reports/financials?start_date=${startInput.value}&end_date=${endInput.value}`);
    const data = await res.json();

    document.getElementById('report-total-sales').textContent = Number(data.total_sales).toLocaleString('ar-YE');
    document.getElementById('report-total-cogs').textContent = Number(data.cogs).toLocaleString('ar-YE');
    document.getElementById('report-total-expenses').textContent = Number(data.total_expenses).toLocaleString('ar-YE');
    document.getElementById('report-net-profit').textContent = Number(data.net_profit).toLocaleString('ar-YE');

    const tbody = document.getElementById('report-expenses-breakdown');
    if (!data.expenses_by_category || data.expenses_by_category.length === 0) {
      tbody.innerHTML = '<tr><td colspan="2" class="text-center py-4 text-slate-400">لا توجد مصروفات خلال هذه الفترة</td></tr>';
      return;
    }

    tbody.innerHTML = data.expenses_by_category.map(exp => `
      <tr class="hover:bg-slate-50">
        <td class="py-2.5 px-3 font-medium text-slate-800">${exp.category}</td>
        <td class="py-2.5 px-3 font-mono font-bold text-rose-600">${Number(exp.category_total).toLocaleString('ar-YE')} <span class="currency-label">${state.settings.currency_symbol || 'ر.ي'}</span></td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Reports load error:', err);
  }
}
