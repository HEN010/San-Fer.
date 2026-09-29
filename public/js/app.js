// ==========================================================================
// SANFER EATS - CLIENT-SIDE APPLICATION ENGINE
// Frontend logic, multi-restaurant cart, WhatsApp builder, charts & Admin
// ==========================================================================

const API_BASE = '';

// Application State
const AppState = {
  currentUser: {
    identifier: localStorage.getItem('sf_client_id') || '',
    fullName: localStorage.getItem('sf_client_name') || '',
    phone: localStorage.getItem('sf_client_phone') || '',
    address: localStorage.getItem('sf_client_address') || ''
  },
  cart: JSON.parse(localStorage.getItem('sf_food_cart') || '[]'),
  serviceStatus: { isOpen: true, status: 'active', message: '' },
  zones: [],
  activeWA: { phone: '5219611234567', label: 'SanFer Eats' },
  adminPin: sessionStorage.getItem('sf_admin_pin') || '',
  restaurants: [],
  categories: [],
  currentCategory: 'Todos',
  cartZone: null,
  activeAdminTab: 'dashboard'
};

// ==========================================================================
// INITIALIZATION
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

async function initApp() {
  updateClientChipUI();
  updateCartBadgeUI();

  // Load initial settings and data
  await loadPlatformSettings();
  await loadDeliveryZones();
  await loadActiveWhatsApp();
  await loadFoodCategories();
  await loadRestaurants();
  await loadSuperCatalog();

  // Check URL hash for routing
  handleHashNavigation();
  window.addEventListener('hashchange', handleHashNavigation);

  // Periodically refresh service status
  setInterval(loadPlatformSettings, 60000);
}

// ==========================================================================
// NAVIGATION & ROUTING
// ==========================================================================
function navigateTo(viewName) {
  window.location.hash = viewName;
}

function handleHashNavigation() {
  const hash = window.location.hash.replace('#', '') || 'inicio';
  const validViews = ['inicio', 'comida', 'compras', 'entrega', 'perfil', 'admin'];
  const targetView = validViews.includes(hash) ? hash : 'inicio';

  // Toggle view sections
  document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
  const activeSec = document.getElementById(`view-${targetView}`);
  if (activeSec) activeSec.classList.add('active');

  // Toggle desktop links
  document.querySelectorAll('.desktop-nav .nav-link').forEach(link => {
    link.classList.toggle('active', link.dataset.nav === targetView);
  });

  // Toggle mobile bottom nav
  document.querySelectorAll('.bottom-nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.bottomNav === targetView);
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Tab-specific triggers
  if (targetView === 'perfil') {
    loadClientOrdersHistory();
  } else if (targetView === 'admin') {
    checkAdminAuth();
  }
}

// Toast notification helper
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  let icon = '✅';
  if (type === 'error') icon = '❌';
  if (type === 'warning') icon = '⚠️';
  toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3500);
}

// ==========================================================================
// 1. SETTINGS, STATUS & ZONES
// ==========================================================================
async function loadPlatformSettings() {
  try {
    const res = await fetch(`${API_BASE}/api/settings`);
    const data = await res.json();
    AppState.serviceStatus = data.serviceStatus;

    // Update Header Status Pill
    const pill = document.getElementById('service-status-pill');
    const pillText = document.getElementById('service-status-text');
    const closedBanner = document.getElementById('closed-service-banner');
    const closedTitle = document.getElementById('closed-banner-title');
    const closedDesc = document.getElementById('closed-banner-desc');

    if (data.serviceStatus.isOpen) {
      pill.className = 'status-pill open';
      pill.querySelector('.status-dot').className = 'status-dot green';
      pillText.textContent = 'Abierto';
      if (closedBanner) closedBanner.style.display = 'none';
    } else {
      pill.className = 'status-pill closed';
      pill.querySelector('.status-dot').className = 'status-dot red';
      pillText.textContent = 'Cerrado';
      if (closedBanner) {
        closedBanner.style.display = 'flex';
        closedTitle.textContent = 'SanFer Eats se encuentra cerrado por el momento';
        closedDesc.textContent = data.serviceStatus.message;
      }
    }

    // Update dynamic text settings if present
    if (data.settings) {
      if (data.settings.tagline) {
        const slogan = document.getElementById('header-slogan');
        if (slogan) slogan.textContent = data.settings.tagline;
      }
      if (data.settings.hero_description) {
        const heroDesc = document.getElementById('hero-desc-text');
        if (heroDesc) heroDesc.textContent = data.settings.hero_description;
      }
    }
  } catch (err) {
    console.error('Error loading settings:', err);
  }
}

async function loadActiveWhatsApp() {
  try {
    const res = await fetch(`${API_BASE}/api/whatsapp-active`);
    const data = await res.json();
    if (data.whatsapp) {
      AppState.activeWA = data.whatsapp;
    }
  } catch (err) {
    console.error('Error loading WhatsApp number:', err);
  }
}

function openWhatsAppDirect() {
  const phone = AppState.activeWA.phone.replace(/\D/g, '');
  const msg = encodeURIComponent(`Hola SanFer Eats, me gustaría consultar información sobre sus servicios.`);
  window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
}

async function loadDeliveryZones() {
  try {
    const res = await fetch(`${API_BASE}/api/delivery-zones`);
    const data = await res.json();
    AppState.zones = data.zones || [];

    // Render rates preview in Home
    const homeRatesContainer = document.getElementById('home-rates-container');
    if (homeRatesContainer) {
      homeRatesContainer.innerHTML = AppState.zones.map(z => `
        <div class="rate-badge-item">
          <span class="rate-badge-name">${z.name}</span>
          <span class="rate-badge-price">$${Number(z.fee).toFixed(0)} MXN</span>
        </div>
      `).join('');
    }

    // Render rates in Courier section
    const courierRatesContainer = document.getElementById('courier-rates-container');
    if (courierRatesContainer) {
      courierRatesContainer.innerHTML = AppState.zones.map(z => `
        <div class="courier-rate-card">
          <div class="courier-rate-icon">🛵</div>
          <div class="courier-rate-text">
            <h4>${z.name}</h4>
            <p>${z.description || 'Zona de entrega'}</p>
          </div>
          <div class="courier-rate-price">$${Number(z.fee).toFixed(0)}</div>
        </div>
      `).join('');
    }
  } catch (err) {
    console.error('Error loading delivery zones:', err);
  }
}

// Automatic delivery zone detection from address
let zoneDebounceTimer;
function handleAddressZoneDetection(context, address) {
  clearTimeout(zoneDebounceTimer);
  zoneDebounceTimer = setTimeout(async () => {
    if (!address || address.trim().length < 2) return;
    try {
      const res = await fetch(`${API_BASE}/api/calculate-fare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address })
      });
      const data = await res.json();

      if (context === 'cart') {
        AppState.cartZone = data.zone;
        const badge = document.getElementById('cart-zone-badge');
        const text = document.getElementById('cart-zone-text');
        badge.style.display = 'inline-flex';
        text.textContent = `Zona detectada: ${data.zone.name} (Tarifa: $${data.estimatedFee.toFixed(2)} MXN)`;
        updateCartSummary();
      } else if (context === 'shopping') {
        const badge = document.getElementById('shopping-zone-badge');
        const text = document.getElementById('shopping-zone-text');
        badge.style.display = 'inline-flex';
        text.textContent = `Zona detectada: ${data.zone.name} (Tarifa estimada: $${data.estimatedFee.toFixed(2)} MXN)`;
      } else if (context === 'courier') {
        const badge = document.getElementById('courier-zone-badge');
        const text = document.getElementById('courier-zone-text');
        badge.style.display = 'inline-flex';
        text.textContent = `Zona detectada: ${data.zone.name} (Tarifa de entrega: $${data.estimatedFee.toFixed(2)} MXN)`;
      }
    } catch (e) {
      console.error('Zone detection failed:', e);
    }
  }, 350);
}

// ==========================================================================
// 2. CLIENT IDENTIFICATION (Henry, HenryC, etc.)
// ==========================================================================
function updateClientChipUI() {
  const chipBtn = document.getElementById('client-chip-btn');
  const chipName = document.getElementById('client-chip-name');
  if (AppState.currentUser.identifier) {
    chipName.textContent = `Hola, ${AppState.currentUser.identifier}`;
  } else {
    chipName.textContent = 'Identifícate';
  }
}

function openClientModal() {
  document.getElementById('modal-client-identifier').value = AppState.currentUser.identifier || '';
  document.getElementById('modal-client-fullname').value = AppState.currentUser.fullName || '';
  document.getElementById('modal-client-phone').value = AppState.currentUser.phone || '';
  document.getElementById('modal-client-address').value = AppState.currentUser.address || '';
  document.getElementById('client-modal').classList.add('active');
}

function closeClientModal() {
  document.getElementById('client-modal').classList.remove('active');
}

let checkIdDebounce;
function checkIdentifierLive(identifier) {
  clearTimeout(checkIdDebounce);
  const feedback = document.getElementById('modal-identifier-feedback') || document.getElementById('profile-identifier-feedback');
  if (!feedback) return;

  if (!identifier || identifier.trim().length < 2) {
    feedback.textContent = 'Mínimo 2 caracteres';
    feedback.style.color = 'var(--text-muted)';
    return;
  }

  checkIdDebounce = setTimeout(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/clients/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier })
      });
      const data = await res.json();
      feedback.textContent = data.message;
      feedback.style.color = data.available ? 'var(--primary-green)' : '#0284c7';
    } catch (e) {
      console.error(e);
    }
  }, 300);
}

async function saveClientFromModal() {
  const identifier = document.getElementById('modal-client-identifier').value.trim();
  const fullName = document.getElementById('modal-client-fullname').value.trim();
  const phone = document.getElementById('modal-client-phone').value.trim();
  const address = document.getElementById('modal-client-address').value.trim();

  if (!identifier) {
    showToast('El identificador es obligatorio', 'error');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/clients/register-or-update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier,
        full_name: fullName,
        phone,
        default_address: address
      })
    });
    const data = await res.json();
    if (data.client) {
      AppState.currentUser = {
        identifier: data.client.identifier,
        fullName: data.client.full_name,
        phone: data.client.phone,
        address: data.client.default_address
      };
      localStorage.setItem('sf_client_id', AppState.currentUser.identifier);
      localStorage.setItem('sf_client_name', AppState.currentUser.fullName || '');
      localStorage.setItem('sf_client_phone', AppState.currentUser.phone || '');
      localStorage.setItem('sf_client_address', AppState.currentUser.address || '');

      updateClientChipUI();
      closeClientModal();
      showToast(`¡Identificador guardado como ${AppState.currentUser.identifier}!`);
    }
  } catch (err) {
    showToast('Error al registrar identificador', 'error');
  }
}

async function saveProfileIdentifier() {
  const id = document.getElementById('profile-input-identifier').value.trim();
  if (!id) return;
  document.getElementById('modal-client-identifier').value = id;
  await saveClientFromModal();
  loadClientOrdersHistory();
}

async function loadClientOrdersHistory() {
  const listEl = document.getElementById('client-orders-history-list');
  const profileId = document.getElementById('profile-input-identifier');
  if (profileId) profileId.value = AppState.currentUser.identifier || '';

  if (!AppState.currentUser.identifier) {
    listEl.innerHTML = `<p style="color: var(--text-muted); font-size: 14px;">Identifícate arriba para ver tu historial de pedidos en SanFer Eats.</p>`;
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/clients/${encodeURIComponent(AppState.currentUser.identifier)}/orders`);
    const data = await res.json();

    if (!data.orders || data.orders.length === 0) {
      listEl.innerHTML = `<p style="color: var(--text-muted); font-size: 14px;">No tienes solicitudes registradas aún con el identificador "${AppState.currentUser.identifier}".</p>`;
      return;
    }

    listEl.innerHTML = data.orders.map(o => {
      const statusLabels = {
        new: 'Nueva solicitud',
        reviewing: 'En revisión',
        confirmed: 'Confirmada',
        preparing: 'En preparación',
        on_the_way: 'En camino 🛵',
        delivered: 'Entregada ✅',
        cancelled: 'Cancelada'
      };
      const badgeClass = o.status;
      const dateStr = new Date(o.created_at).toLocaleString();

      return `
        <div class="cart-restaurant-group" style="margin-bottom: 12px;">
          <div class="cart-group-header">
            <span><strong>${o.order_number}</strong> (${o.service_type.toUpperCase()})</span>
            <span class="badge-status ${badgeClass}">${statusLabels[o.status] || o.status}</span>
          </div>
          <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 6px;">
            📅 ${dateStr} • 📍 ${o.delivery_address}
          </div>
          <div style="font-size: 13px; margin-bottom: 4px;">
            <strong>Total:</strong> $${o.total.toFixed(2)} MXN (${o.fee_status === 'confirmed' ? 'Tarifa confirmada' : 'Tarifa estimada'})
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Error fetching client orders:', err);
  }
}

// ==========================================================================
// 3. FOOD EXPLORER & RESTAURANTS
// ==========================================================================
async function loadFoodCategories() {
  try {
    const res = await fetch(`${API_BASE}/api/food/categories`);
    const data = await res.json();
    AppState.categories = data.categories || [];

    const scrollContainer = document.getElementById('food-categories-scroll');
    if (scrollContainer) {
      scrollContainer.innerHTML = `
        <button class="category-pill ${AppState.currentCategory === 'Todos' ? 'active' : ''}" onclick="filterCategory('Todos')">
          <span>🌟</span> Todos
        </button>
        ${AppState.categories.map(c => `
          <button class="category-pill ${AppState.currentCategory === c.name ? 'active' : ''}" onclick="filterCategory('${c.name}')">
            <span>${c.icon || '🍽️'}</span> ${c.name}
          </button>
        `).join('')}
      `;
    }
  } catch (e) {
    console.error(e);
  }
}

async function loadRestaurants(category = 'Todos', search = '') {
  try {
    let url = `${API_BASE}/api/food/restaurants?`;
    if (category && category !== 'Todos') url += `category=${encodeURIComponent(category)}&`;
    if (search) url += `search=${encodeURIComponent(search)}`;

    const res = await fetch(url);
    const data = await res.json();
    AppState.restaurants = data.restaurants || [];

    renderRestaurantsList(AppState.restaurants);

    // Render popular restaurants preview in home
    const homePopular = document.getElementById('home-popular-restaurants');
    if (homePopular) {
      homePopular.innerHTML = AppState.restaurants.slice(0, 3).map(r => renderRestaurantCardHtml(r)).join('');
    }
  } catch (e) {
    console.error(e);
  }
}

function filterCategory(catName) {
  AppState.currentCategory = catName;
  document.querySelectorAll('.category-pill').forEach(pill => {
    pill.classList.toggle('active', pill.textContent.includes(catName));
  });
  loadRestaurants(catName);
}

let foodSearchDebounce;
function handleFoodSearch(term) {
  clearTimeout(foodSearchDebounce);
  foodSearchDebounce = setTimeout(() => {
    loadRestaurants(AppState.currentCategory, term);
  }, 300);
}

function renderRestaurantsList(restaurants) {
  const container = document.getElementById('restaurants-container');
  const title = document.getElementById('restaurants-count-title');
  if (title) title.textContent = `Restaurantes disponibles (${restaurants.length})`;

  if (!restaurants || restaurants.length === 0) {
    container.innerHTML = `<div style="grid-column: 1 / -1; padding: 40px 0; text-align: center; color: var(--text-muted);">
      <p style="font-size: 16px;">No se encontraron restaurantes para esta búsqueda.</p>
    </div>`;
    return;
  }

  container.innerHTML = restaurants.map(r => renderRestaurantCardHtml(r)).join('');
}

function renderRestaurantCardHtml(r) {
  const isOpen = r.is_open === 1;
  return `
    <div class="restaurant-card" onclick="openRestaurantModal(${r.id})">
      <div class="restaurant-img-wrap">
        <img src="${r.image_url}" alt="${r.name}" class="restaurant-img" loading="lazy">
        <span class="restaurant-status-tag ${isOpen ? 'open' : 'closed'}">
          ${isOpen ? '● Disponible' : '● Cerrado'}
        </span>
        <span class="restaurant-time-badge">🕒 ${r.delivery_time}</span>
      </div>
      <div class="restaurant-info">
        <h3 class="restaurant-name">${r.name}</h3>
        <div class="restaurant-category">${r.category_name}</div>
        <div class="restaurant-meta">
          <div class="restaurant-rating">★ ${r.rating}</div>
          <span class="restaurant-view-menu-btn">Ver menú →</span>
        </div>
      </div>
    </div>
  `;
}

// Restaurant Details & Menu Modal
async function openRestaurantModal(restaurantId) {
  try {
    const res = await fetch(`${API_BASE}/api/food/restaurants/${restaurantId}`);
    const data = await res.json();
    const r = data.restaurant;
    const dishes = data.dishes || [];

    document.getElementById('rest-modal-img').src = r.image_url;
    document.getElementById('rest-modal-name').textContent = r.name;
    document.getElementById('rest-modal-cat').textContent = r.category_name;
    document.getElementById('rest-modal-rating').textContent = `★ ${r.rating}`;
    document.getElementById('rest-modal-desc').textContent = r.description;

    const dishesContainer = document.getElementById('rest-modal-dishes');
    if (dishes.length === 0) {
      dishesContainer.innerHTML = `<p style="color: var(--text-muted); padding: 20px 0;">No hay platillos disponibles en este momento.</p>`;
    } else {
      dishesContainer.innerHTML = dishes.map(d => {
        const isAvail = d.is_available === 1;
        return `
          <div class="dish-card">
            <div class="dish-info">
              <h4 class="dish-name">${d.name}</h4>
              <p class="dish-desc">${d.description || ''}</p>
              <div class="dish-price">$${Number(d.price).toFixed(2)} MXN</div>
            </div>
            ${d.image_url ? `
              <div class="dish-img-wrap">
                <img src="${d.image_url}" alt="${d.name}" class="dish-img" loading="lazy">
              </div>
            ` : ''}
            <div class="dish-action">
              ${isAvail ? `
                <button class="add-dish-btn" onclick="addToCart(${r.id}, '${escapeHtml(r.name)}', ${d.id}, '${escapeHtml(d.name)}', ${d.price}, '${d.image_url || ''}')">
                  + Agregar
                </button>
              ` : `
                <span class="dish-unavailable-tag">Agotado</span>
              `}
            </div>
          </div>
        `;
      }).join('');
    }

    document.getElementById('restaurant-modal').classList.add('active');
  } catch (err) {
    console.error('Error opening restaurant modal:', err);
  }
}

function closeRestaurantModal() {
  document.getElementById('restaurant-modal').classList.remove('active');
}

function escapeHtml(str = '') {
  return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

// ==========================================================================
// 4. MULTI-RESTAURANT CART LOGIC
// ==========================================================================
function addToCart(restaurantId, restaurantName, dishId, dishName, price, imageUrl) {
  // Check if item already in cart
  const existing = AppState.cart.find(it => it.dishId === dishId);
  if (existing) {
    existing.quantity += 1;
  } else {
    AppState.cart.push({
      dishId,
      restaurantId,
      restaurantName,
      name: dishName,
      price: Number(price),
      quantity: 1,
      imageUrl
    });
  }

  saveCart();
  updateCartBadgeUI();
  showToast(`¡${dishName} agregado al carrito!`);
}

function updateCartItemQty(dishId, delta) {
  const item = AppState.cart.find(it => it.dishId === dishId);
  if (!item) return;

  item.quantity += delta;
  if (item.quantity <= 0) {
    AppState.cart = AppState.cart.filter(it => it.dishId !== dishId);
  }

  saveCart();
  updateCartBadgeUI();
  renderCartDrawer();
}

function saveCart() {
  localStorage.setItem('sf_food_cart', JSON.stringify(AppState.cart));
}

function updateCartBadgeUI() {
  const totalCount = AppState.cart.reduce((sum, it) => sum + it.quantity, 0);
  const totalSubtotal = AppState.cart.reduce((sum, it) => sum + (it.price * it.quantity), 0);

  const floatingBtn = document.getElementById('floating-cart-btn');
  const countEl = document.getElementById('floating-cart-count');
  const totalEl = document.getElementById('floating-cart-total');

  if (totalCount > 0) {
    floatingBtn.classList.add('visible');
    countEl.textContent = totalCount;
    totalEl.textContent = `$${totalSubtotal.toFixed(2)}`;
  } else {
    floatingBtn.classList.remove('visible');
  }
}

function openCartModal() {
  renderCartDrawer();
  document.getElementById('cart-modal').classList.add('active');
}

function closeCartModal() {
  document.getElementById('cart-modal').classList.remove('active');
}

function renderCartDrawer() {
  const container = document.getElementById('cart-items-container');
  if (AppState.cart.length === 0) {
    container.innerHTML = `<div style="text-align: center; padding: 40px 0; color: var(--text-muted);">
      <div style="font-size: 40px; margin-bottom: 8px;">🛒</div>
      <p>Tu carrito está vacío.</p>
      <button class="btn-primary" style="margin-top: 14px;" onclick="closeCartModal(); navigateTo('comida');">
        Explorar Comida
      </button>
    </div>`;
    updateCartSummary();
    return;
  }

  // GROUP ITEMS BY RESTAURANT (Strict Requirement #8)
  const grouped = {};
  for (const item of AppState.cart) {
    if (!grouped[item.restaurantName]) {
      grouped[item.restaurantName] = [];
    }
    grouped[item.restaurantName].push(item);
  }

  let html = '';
  for (const [restName, items] of Object.entries(grouped)) {
    const restSubtotal = items.reduce((s, it) => s + (it.price * it.quantity), 0);
    html += `
      <div class="cart-restaurant-group">
        <div class="cart-group-header">
          <span>🏪 ${restName}</span>
          <span style="font-size: 12px; color: var(--text-muted);">${items.length} producto(s)</span>
        </div>
        ${items.map(it => `
          <div class="cart-item-row">
            <div class="cart-item-title">${it.name}</div>
            <div class="cart-item-stepper">
              <button class="stepper-btn" onclick="updateCartItemQty(${it.dishId}, -1)">−</button>
              <span style="font-weight: 700; font-size: 13px; min-width: 16px; text-align: center;">${it.quantity}</span>
              <button class="stepper-btn" onclick="updateCartItemQty(${it.dishId}, 1)">+</button>
            </div>
            <div class="cart-item-subtotal">$${(it.price * it.quantity).toFixed(2)}</div>
          </div>
        `).join('')}
        <div class="cart-restaurant-subtotal-row">
          <span>Subtotal ${restName}:</span>
          <span>$${restSubtotal.toFixed(2)} MXN</span>
        </div>
      </div>
    `;
  }

  container.innerHTML = html;

  // Auto populate address if client has one
  const addrInput = document.getElementById('cart-delivery-address');
  if (addrInput && !addrInput.value && AppState.currentUser.address) {
    addrInput.value = AppState.currentUser.address;
    handleAddressZoneDetection('cart', AppState.currentUser.address);
  }

  updateCartSummary();
}

function updateCartSummary() {
  const subtotal = AppState.cart.reduce((sum, it) => sum + (it.price * it.quantity), 0);
  const fare = AppState.cartZone ? Number(AppState.cartZone.fee) : 20.00;
  const total = subtotal + fare;

  const subtotalEl = document.getElementById('cart-summary-subtotal');
  const fareEl = document.getElementById('cart-summary-fare');
  const totalEl = document.getElementById('cart-summary-total');

  if (subtotalEl) subtotalEl.textContent = `$${subtotal.toFixed(2)} MXN`;
  if (fareEl) fareEl.textContent = `$${fare.toFixed(2)} MXN ${AppState.cartZone ? `(${AppState.cartZone.name})` : ''}`;
  if (totalEl) totalEl.textContent = `$${total.toFixed(2)} MXN`;
}

async function submitFoodCartOrder() {
  // Service check
  if (!AppState.serviceStatus.isOpen) {
    showToast(AppState.serviceStatus.message, 'warning');
    return;
  }

  if (AppState.cart.length === 0) {
    showToast('El carrito está vacío', 'warning');
    return;
  }

  // Ensure client is identified
  if (!AppState.currentUser.identifier) {
    openClientModal();
    showToast('Ingresa tu identificador para continuar', 'warning');
    return;
  }

  const address = document.getElementById('cart-delivery-address').value.trim();
  const notes = document.getElementById('cart-order-notes').value.trim();

  if (!address) {
    showToast('Por favor escribe tu dirección de entrega', 'warning');
    document.getElementById('cart-delivery-address').focus();
    return;
  }

  // Group items format for backend
  const restMap = {};
  for (const item of AppState.cart) {
    if (!restMap[item.restaurantId]) {
      restMap[item.restaurantId] = {
        restaurant_id: item.restaurantId,
        restaurant_name: item.restaurantName,
        items: []
      };
    }
    restMap[item.restaurantId].items.push({
      dish_id: item.dishId,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      subtotal: item.price * item.quantity
    });
  }

  const groupedPayload = Object.values(restMap);

  try {
    const res = await fetch(`${API_BASE}/api/orders/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_identifier: AppState.currentUser.identifier,
        client_name: AppState.currentUser.fullName || AppState.currentUser.identifier,
        client_phone: AppState.currentUser.phone || '',
        service_type: 'food',
        items: groupedPayload,
        notes,
        delivery_address: address,
        delivery_zone_id: AppState.cartZone ? AppState.cartZone.id : null
      })
    });

    const data = await res.json();
    if (data.success) {
      // Clear Cart
      AppState.cart = [];
      saveCart();
      updateCartBadgeUI();
      closeCartModal();

      // Show Success Modal
      showOrderSuccess(data.orderNumber, data.waLink);

      // Open WhatsApp automatically
      window.open(data.waLink, '_blank');
    } else {
      showToast(data.message || 'Error al procesar pedido', 'error');
    }
  } catch (err) {
    console.error('Error submitting order:', err);
    showToast('Error de conexión al generar pedido', 'error');
  }
}

// ==========================================================================
// 5. COMPRAS / SÚPER
// ==========================================================================
async function loadSuperCatalog() {
  try {
    const res = await fetch(`${API_BASE}/api/super/catalog`);
    const data = await res.json();

    const container = document.getElementById('super-suggested-items-container');
    if (container && data.categories) {
      container.innerHTML = data.categories.map(c => {
        return (c.suggested_items || []).map(item => `
          <button class="suggested-item-tag" onclick="appendSuperItem('${escapeHtml(item)}')">
            + ${item}
          </button>
        `).join('');
      }).join('');
    }
  } catch (e) {
    console.error('Error loading super catalog:', e);
  }
}

function appendSuperItem(itemName) {
  const textarea = document.getElementById('shopping-items-text');
  if (textarea.value.trim() === '') {
    textarea.value = `1x ${itemName}`;
  } else {
    textarea.value += `\n1x ${itemName}`;
  }
  showToast(`"${itemName}" agregado a la lista`);
}

async function submitShoppingOrder() {
  if (!AppState.serviceStatus.isOpen) {
    showToast(AppState.serviceStatus.message, 'warning');
    return;
  }

  const itemsText = document.getElementById('shopping-items-text').value.trim();
  const storeName = document.getElementById('shopping-store-select').value;
  const notes = document.getElementById('shopping-notes').value.trim();
  const clientName = document.getElementById('shopping-client-name').value.trim();
  const clientPhone = document.getElementById('shopping-client-phone').value.trim();
  const address = document.getElementById('shopping-delivery-address').value.trim();

  if (!itemsText) {
    showToast('Escribe los artículos que necesitas', 'warning');
    return;
  }
  if (!address) {
    showToast('Ingresa la dirección de entrega', 'warning');
    return;
  }

  const identifier = AppState.currentUser.identifier || clientName || 'ClienteSanFer';

  const itemsPayload = [{
    store_name: storeName,
    items_text: itemsText
  }];

  try {
    const res = await fetch(`${API_BASE}/api/orders/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_identifier: identifier,
        client_name: clientName,
        client_phone: clientPhone,
        service_type: 'shopping',
        items: itemsPayload,
        notes,
        delivery_address: address
      })
    });

    const data = await res.json();
    if (data.success) {
      document.getElementById('shopping-items-text').value = '';
      showOrderSuccess(data.orderNumber, data.waLink);
      window.open(data.waLink, '_blank');
    }
  } catch (err) {
    showToast('Error al enviar solicitud', 'error');
  }
}

// ==========================================================================
// 6. ENTREGA (COURIER)
// ==========================================================================
async function submitCourierOrder() {
  if (!AppState.serviceStatus.isOpen) {
    showToast(AppState.serviceStatus.message, 'warning');
    return;
  }

  const pickup = document.getElementById('courier-pickup').value.trim();
  const delivery = document.getElementById('courier-delivery').value.trim();
  const desc = document.getElementById('courier-desc').value.trim();
  const recipientName = document.getElementById('courier-recipient-name').value.trim();
  const recipientPhone = document.getElementById('courier-recipient-phone').value.trim();
  const notes = document.getElementById('courier-notes').value.trim();

  if (!pickup || !delivery || !desc) {
    showToast('Por favor completa los lugares de recogida, entrega y descripción', 'warning');
    return;
  }

  const identifier = AppState.currentUser.identifier || recipientName || 'ClienteSanFer';

  const itemsPayload = [{
    service: 'Entrega y Paquetería Local',
    description: desc,
    pickup_address: pickup,
    delivery_address: delivery,
    recipient_name: recipientName,
    recipient_phone: recipientPhone
  }];

  try {
    const res = await fetch(`${API_BASE}/api/orders/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_identifier: identifier,
        client_name: recipientName,
        client_phone: recipientPhone,
        service_type: 'courier',
        items: itemsPayload,
        notes,
        pickup_address: pickup,
        delivery_address: delivery
      })
    });

    const data = await res.json();
    if (data.success) {
      document.getElementById('courier-desc').value = '';
      showOrderSuccess(data.orderNumber, data.waLink);
      window.open(data.waLink, '_blank');
    }
  } catch (err) {
    showToast('Error al procesar solicitud de entrega', 'error');
  }
}

// Success Modal
function showOrderSuccess(orderNumber, waLink) {
  document.getElementById('success-order-num').textContent = orderNumber;
  document.getElementById('success-wa-link').href = waLink;
  document.getElementById('order-success-modal').classList.add('active');
}

function closeSuccessModal() {
  document.getElementById('order-success-modal').classList.remove('active');
}

// ==========================================================================
// 7. ADMIN PANEL ENGINE
// ==========================================================================
function checkAdminAuth() {
  const loginScreen = document.getElementById('admin-login-screen');
  const contentArea = document.getElementById('admin-content-area');

  if (AppState.adminPin) {
    loginScreen.style.display = 'none';
    contentArea.style.display = 'block';
    loadAdminDashboardData();
  } else {
    loginScreen.style.display = 'block';
    contentArea.style.display = 'none';
  }
}

async function submitAdminLogin() {
  const pin = document.getElementById('admin-pin-input').value.trim();
  if (!pin) {
    showToast('Ingresa el PIN de seguridad', 'warning');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin })
    });
    const data = await res.json();

    if (data.success) {
      AppState.adminPin = pin;
      sessionStorage.setItem('sf_admin_pin', pin);
      document.getElementById('admin-login-screen').style.display = 'none';
      document.getElementById('admin-content-area').style.display = 'block';
      showToast('Bienvenido al Panel de Administración');
      loadAdminDashboardData();
    } else {
      showToast('PIN incorrecto', 'error');
    }
  } catch (err) {
    showToast('Error al validar PIN', 'error');
  }
}

function adminLogout() {
  AppState.adminPin = '';
  sessionStorage.removeItem('sf_admin_pin');
  checkAdminAuth();
  showToast('Sesión de administrador cerrada');
}

function switchAdminTab(tabName) {
  AppState.activeAdminTab = tabName;
  document.querySelectorAll('.admin-nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.adminTab === tabName);
  });
  document.querySelectorAll('.admin-tab-content').forEach(content => {
    content.style.display = content.id === `admin-tab-${tabName}` ? 'block' : 'none';
  });

  // Tab Loaders
  if (tabName === 'dashboard') loadAdminDashboardData();
  if (tabName === 'pedidos') loadAdminOrders();
  if (tabName === 'restaurantes') loadAdminRestaurants();
  if (tabName === 'platillos') loadAdminDishes();
  if (tabName === 'zonas') loadAdminZones();
  if (tabName === 'whatsapp') loadAdminWhatsApp();
  if (tabName === 'horarios') loadAdminScheduleView();
  if (tabName === 'clientes') loadAdminClients();
  if (tabName === 'mantenimiento') loadAdminStorageView();
  if (tabName === 'ajustes') loadAdminGeneralSettings();
}

// Admin Helper Header
function getAdminHeaders() {
  return {
    'Content-Type': 'application/json',
    'X-Admin-Pin': AppState.adminPin
  };
}

// ----------------------------------------------------
// TAB 1: DASHBOARD & 4 CANVAS CHARTS
// ----------------------------------------------------
async function loadAdminDashboardData() {
  const period = document.getElementById('admin-dashboard-period')?.value || 'month';
  try {
    const res = await fetch(`${API_BASE}/api/admin/dashboard?period=${period}`, {
      headers: getAdminHeaders()
    });
    if (res.status === 401) { adminLogout(); return; }
    const data = await res.json();

    // KPIs
    document.getElementById('kpi-total-revenue').textContent = `$${Number(data.kpis.total_revenue || 0).toFixed(2)}`;
    document.getElementById('kpi-total-orders').textContent = data.kpis.total_orders || 0;
    document.getElementById('kpi-completed-orders').textContent = data.kpis.completed_orders || 0;
    document.getElementById('kpi-active-clients').textContent = data.kpis.active_clients || 0;

    // Draw Chart 1: Order Evolution
    drawEvolutionChart(data.charts.evolution || []);

    // Draw Chart 2: Top Dishes
    drawTopDishesChart(data.charts.topDishes || []);

    // Draw Chart 3: Top Restaurants
    drawTopRestaurantsChart(data.charts.topRestaurants || []);

    // Draw Chart 4: Client Activity
    drawClientActivityChart(data.charts.clientActivity || []);
  } catch (err) {
    console.error('Error loading admin dashboard:', err);
  }
}

// Native Canvas Chart Renderers
function drawEvolutionChart(dataPoints) {
  const canvas = document.getElementById('chart-evolution');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  if (!dataPoints || dataPoints.length === 0) {
    ctx.fillStyle = '#64748b';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Sin datos registrados para este periodo', w / 2, h / 2);
    return;
  }

  const padding = 35;
  const maxVal = Math.max(...dataPoints.map(d => d.order_count), 5);
  const stepX = (w - padding * 2) / Math.max(dataPoints.length - 1, 1);

  // Background Grid
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= 4; i++) {
    const y = padding + (h - padding * 2) * (i / 4);
    ctx.moveTo(padding, y);
    ctx.lineTo(w - padding, y);
  }
  ctx.stroke();

  // Draw Area Gradient
  const grad = ctx.createLinearGradient(0, padding, 0, h - padding);
  grad.addColorStop(0, 'rgba(22, 163, 74, 0.35)');
  grad.addColorStop(1, 'rgba(22, 163, 74, 0.0)');

  ctx.beginPath();
  dataPoints.forEach((d, idx) => {
    const x = padding + idx * stepX;
    const y = h - padding - (d.order_count / maxVal) * (h - padding * 2);
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.lineTo(padding + (dataPoints.length - 1) * stepX, h - padding);
  ctx.lineTo(padding, h - padding);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Draw Line
  ctx.beginPath();
  ctx.strokeStyle = '#15803d';
  ctx.lineWidth = 3;
  dataPoints.forEach((d, idx) => {
    const x = padding + idx * stepX;
    const y = h - padding - (d.order_count / maxVal) * (h - padding * 2);
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Points & Labels
  dataPoints.forEach((d, idx) => {
    const x = padding + idx * stepX;
    const y = h - padding - (d.order_count / maxVal) * (h - padding * 2);
    ctx.fillStyle = '#15803d';
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();

    // Label text
    ctx.fillStyle = '#0f172a';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${d.order_count}`, x, y - 8);
  });
}

function drawTopDishesChart(dishes) {
  const canvas = document.getElementById('chart-dishes');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  if (!dishes || dishes.length === 0) {
    ctx.fillStyle = '#64748b';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Sin platillos registrados en este periodo', w / 2, h / 2);
    return;
  }

  const maxVal = Math.max(...dishes.map(d => d.count), 1);
  const barH = 22;
  const gap = 10;
  const startY = 15;

  dishes.slice(0, 5).forEach((d, i) => {
    const y = startY + i * (barH + gap);
    const barW = (d.count / maxVal) * (w - 180);

    // Label
    ctx.fillStyle = '#1e293b';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    const truncated = d.name.length > 18 ? d.name.substring(0, 18) + '...' : d.name;
    ctx.fillText(truncated, 10, y + 15);

    // Bar
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.roundRect(140, y, Math.max(barW, 8), barH, 4);
    ctx.fill();

    // Value
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText(`${d.count} ord.`, 140 + barW + 8, y + 15);
  });
}

function drawTopRestaurantsChart(restaurants) {
  const canvas = document.getElementById('chart-restaurants');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  if (!restaurants || restaurants.length === 0) {
    ctx.fillStyle = '#64748b';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Sin actividad de restaurantes en el periodo', w / 2, h / 2);
    return;
  }

  const maxVal = Math.max(...restaurants.map(r => r.count), 1);
  const barH = 22;
  const gap = 10;
  const startY = 15;

  restaurants.slice(0, 5).forEach((r, i) => {
    const y = startY + i * (barH + gap);
    const barW = (r.count / maxVal) * (w - 180);

    ctx.fillStyle = '#1e293b';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    const truncated = r.name.length > 18 ? r.name.substring(0, 18) + '...' : r.name;
    ctx.fillText(truncated, 10, y + 15);

    ctx.fillStyle = '#0284c7';
    ctx.beginPath();
    ctx.roundRect(140, y, Math.max(barW, 8), barH, 4);
    ctx.fill();

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText(`${r.count} ped.`, 140 + barW + 8, y + 15);
  });
}

function drawClientActivityChart(clients) {
  const canvas = document.getElementById('chart-clients');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  if (!clients || clients.length === 0) {
    ctx.fillStyle = '#64748b';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Sin actividad de clientes en el periodo', w / 2, h / 2);
    return;
  }

  const maxVal = Math.max(...clients.map(c => c.orders_count), 1);
  const barH = 22;
  const gap = 10;
  const startY = 15;

  clients.slice(0, 5).forEach((c, i) => {
    const y = startY + i * (barH + gap);
    const barW = (c.orders_count / maxVal) * (w - 180);

    ctx.fillStyle = '#1e293b';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(c.identifier, 10, y + 15);

    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.roundRect(140, y, Math.max(barW, 8), barH, 4);
    ctx.fill();

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText(`${c.orders_count} pedidos ($${c.total_spent})`, 140 + barW + 8, y + 15);
  });
}

// ----------------------------------------------------
// TAB 2: ORDERS MANAGEMENT & FEE ADJUSTMENT
// ----------------------------------------------------
let currentAdminOrdersList = [];
async function loadAdminOrders() {
  const status = document.getElementById('admin-order-filter-status')?.value || 'all';
  const service = document.getElementById('admin-order-filter-service')?.value || 'all';

  try {
    const res = await fetch(`${API_BASE}/api/admin/orders?status=${status}&service=${service}`, {
      headers: getAdminHeaders()
    });
    if (res.status === 401) { adminLogout(); return; }
    const data = await res.json();
    currentAdminOrdersList = data.orders || [];

    const tbody = document.getElementById('admin-orders-table-body');
    if (currentAdminOrdersList.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 24px; color: var(--text-muted);">No hay pedidos con estos filtros.</td></tr>`;
      return;
    }

    const statusMap = {
      new: 'Nueva',
      reviewing: 'En revisión',
      confirmed: 'Confirmada',
      preparing: 'En preparación',
      on_the_way: 'En camino',
      delivered: 'Entregada',
      cancelled: 'Cancelada'
    };

    tbody.innerHTML = currentAdminOrdersList.map(o => {
      const dateStr = new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const feeText = o.fee_status === 'confirmed'
        ? `<strong style="color: var(--primary-green);">$${Number(o.confirmed_delivery_fee).toFixed(2)}</strong> (Confirmada)`
        : `<span>$${Number(o.estimated_delivery_fee).toFixed(2)}</span> (Estimada)`;

      return `
        <tr>
          <td><strong>${o.order_number}</strong></td>
          <td>${dateStr}</td>
          <td>
            <strong>${o.client_identifier}</strong>
            <div style="font-size: 11px; color: var(--text-muted);">${o.client_name || ''}</div>
          </td>
          <td><span class="badge-tag blue">${o.service_type}</span></td>
          <td>
            <div>${o.detected_zone_name || 'Centro'}</div>
            <div style="font-size: 11px; color: var(--text-muted); max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${o.delivery_address}</div>
          </td>
          <td>${feeText}</td>
          <td><strong>$${Number(o.total).toFixed(2)}</strong></td>
          <td><span class="badge-status ${o.status}">${statusMap[o.status] || o.status}</span></td>
          <td>
            <button class="btn-secondary" style="padding: 4px 8px; font-size: 12px;" onclick="openAdminOrderModal(${o.id})">
              Gestionar
            </button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Error loading admin orders:', err);
  }
}

function openAdminOrderModal(orderId) {
  const order = currentAdminOrdersList.find(o => o.id === orderId);
  if (!order) return;

  const modalTitle = document.getElementById('admin-modal-order-title');
  const modalBody = document.getElementById('admin-order-details-body');
  modalTitle.textContent = `Pedido ${order.order_number} (${order.service_type.toUpperCase()})`;

  let itemsHtml = '';
  if (order.service_type === 'food' && Array.isArray(order.items)) {
    itemsHtml = order.items.map(group => `
      <div style="margin-bottom: 8px;">
        <strong>🏪 ${group.restaurant_name}</strong>
        <ul style="margin-left: 20px; font-size: 13px;">
          ${(group.items || []).map(it => `<li>${it.quantity}x ${it.name} - $${Number(it.subtotal || it.price * it.quantity).toFixed(2)}</li>`).join('')}
        </ul>
      </div>
    `).join('');
  } else if (order.service_type === 'shopping' && Array.isArray(order.items)) {
    itemsHtml = `<div style="font-size: 13px; white-space: pre-line;">${order.items[0]?.items_text || ''}</div>`;
  } else if (order.service_type === 'courier' && Array.isArray(order.items)) {
    const it = order.items[0] || {};
    itemsHtml = `
      <div style="font-size: 13px;">
        <div><strong>Recoger:</strong> ${it.pickup_address}</div>
        <div><strong>Entrega:</strong> ${it.delivery_address}</div>
        <div><strong>Descripción:</strong> ${it.description}</div>
      </div>
    `;
  }

  modalBody.innerHTML = `
    <div style="background-color: var(--bg-subtle); padding: 12px; border-radius: var(--radius-md); margin-bottom: 14px;">
      <div><strong>Cliente:</strong> ${order.client_identifier} (${order.client_name || ''}) • 📞 ${order.client_phone || 'Sin teléfono'}</div>
      <div><strong>Dirección de entrega:</strong> ${order.delivery_address}</div>
      ${order.notes ? `<div style="color: var(--primary-orange);"><strong>Observaciones:</strong> ${order.notes}</div>` : ''}
    </div>

    <div style="margin-bottom: 14px;">
      <h4 style="font-size: 14px; font-weight: 800; margin-bottom: 6px;">Contenido de la solicitud:</h4>
      ${itemsHtml}
    </div>

    <!-- ADJUST AND CONFIRM DELIVERY FARE (SPECIFICATION #15) -->
    <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: var(--radius-md); padding: 14px; margin-bottom: 16px;">
      <h4 style="font-size: 14px; font-weight: 800; color: #15803d; margin-bottom: 6px;">
        🛵 Tarifa de Entrega (Estimada vs Confirmada)
      </h4>
      <div style="display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap;">
        <div>
          <label style="font-size: 12px; color: var(--text-muted); display: block;">Tarifa sugerida por el sistema:</label>
          <span style="font-weight: 700;">$${Number(order.estimated_delivery_fee).toFixed(2)} MXN</span>
        </div>
        <div style="flex: 1; min-width: 140px;">
          <label style="font-size: 12px; font-weight: 700; display: block;">Tarifa confirmada:</label>
          <input type="number" id="admin-confirm-fee-input" class="form-input" value="${order.confirmed_delivery_fee || order.estimated_delivery_fee}" style="padding: 6px 10px; font-size: 14px;">
        </div>
        <button class="btn-primary" style="padding: 8px 14px;" onclick="confirmOrderFee(${order.id})">
          Confirmar Tarifa
        </button>
      </div>
      ${order.fee_status === 'confirmed' ? `
        <div style="font-size: 11px; color: #166534; margin-top: 6px;">
          ✓ Confirmada por ${order.fee_confirmed_by || 'Admin'} el ${new Date(order.fee_confirmed_at).toLocaleString()}
        </div>
      ` : ''}
    </div>

    <!-- STATUS CHANGER -->
    <div class="form-group">
      <label class="form-label">Cambiar Estado del Pedido:</label>
      <div style="display: flex; gap: 10px;">
        <select id="admin-change-status-select" class="form-select" style="flex: 1;">
          <option value="new" ${order.status === 'new' ? 'selected' : ''}>Nueva solicitud</option>
          <option value="reviewing" ${order.status === 'reviewing' ? 'selected' : ''}>En revisión</option>
          <option value="confirmed" ${order.status === 'confirmed' ? 'selected' : ''}>Confirmada</option>
          <option value="preparing" ${order.status === 'preparing' ? 'selected' : ''}>En preparación / compra</option>
          <option value="on_the_way" ${order.status === 'on_the_way' ? 'selected' : ''}>En camino 🛵</option>
          <option value="delivered" ${order.status === 'delivered' ? 'selected' : ''}>Entregada ✅</option>
          <option value="cancelled" ${order.status === 'cancelled' ? 'selected' : ''}>Cancelada</option>
        </select>
        <button class="btn-primary" onclick="updateOrderStatus(${order.id})">
          Actualizar
        </button>
      </div>
    </div>
  `;

  document.getElementById('admin-order-modal').classList.add('active');
}

function closeAdminOrderModal() {
  document.getElementById('admin-order-modal').classList.remove('active');
}

async function confirmOrderFee(orderId) {
  const newFee = Number(document.getElementById('admin-confirm-fee-input').value);
  if (isNaN(newFee) || newFee < 0) {
    showToast('Ingresa una tarifa válida', 'error');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/admin/orders/${orderId}/confirm-fee`, {
      method: 'POST',
      headers: getAdminHeaders(),
      body: JSON.stringify({
        confirmed_fee: newFee,
        admin_name: 'Administrador SanFer'
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Tarifa confirmada en $${newFee.toFixed(2)} MXN`);
      closeAdminOrderModal();
      loadAdminOrders();
    }
  } catch (err) {
    showToast('Error al confirmar tarifa', 'error');
  }
}

async function updateOrderStatus(orderId) {
  const newStatus = document.getElementById('admin-change-status-select').value;
  try {
    const res = await fetch(`${API_BASE}/api/admin/orders/${orderId}/status`, {
      method: 'POST',
      headers: getAdminHeaders(),
      body: JSON.stringify({
        new_status: newStatus,
        notes: `Estado actualizado a ${newStatus}`,
        changed_by: 'Administrador'
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Estado actualizado con éxito');
      closeAdminOrderModal();
      loadAdminOrders();
    }
  } catch (e) {
    showToast('Error al actualizar estado', 'error');
  }
}

// ----------------------------------------------------
// TAB 3: RESTAURANTES CRUD & PHOTO UPLOAD
// ----------------------------------------------------
async function loadAdminRestaurants() {
  try {
    const res = await fetch(`${API_BASE}/api/admin/restaurants`, { headers: getAdminHeaders() });
    const data = await res.json();
    const container = document.getElementById('admin-restaurants-grid');

    container.innerHTML = (data.restaurants || []).map(r => `
      <div class="restaurant-card" style="cursor: default;">
        <div class="restaurant-img-wrap">
          <img src="${r.image_url}" alt="${r.name}" class="restaurant-img">
          <span class="restaurant-status-tag ${r.is_open ? 'open' : 'closed'}">
            ${r.is_open ? 'Disponible' : 'Cerrado'}
          </span>
        </div>
        <div class="restaurant-info">
          <h3 class="restaurant-name">${r.name}</h3>
          <div class="restaurant-category">${r.category_name}</div>
          <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px;">
            ${r.address || ''} • 📞 ${r.phone || ''}
          </div>
          <div style="display: flex; gap: 6px; margin-top: auto;">
            <button class="btn-secondary" style="flex: 1; padding: 6px 10px; font-size: 12px;" onclick="editRestaurantModal(${r.id})">
              Editar
            </button>
            <button class="btn-danger" style="padding: 6px 10px; font-size: 12px;" onclick="deleteRestaurant(${r.id})">
              Eliminar
            </button>
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Error loading admin restaurants:', err);
  }
}

function openRestaurantFormModal(existing = null) {
  const title = document.getElementById('generic-form-title');
  const fields = document.getElementById('generic-form-fields');
  const saveBtn = document.getElementById('generic-form-save-btn');

  title.textContent = existing ? 'Editar Restaurante' : 'Nuevo Restaurante';

  fields.innerHTML = `
    <div class="form-group">
      <label class="form-label">Nombre del Restaurante *</label>
      <input type="text" id="gf-name" class="form-input" value="${existing ? existing.name : ''}">
    </div>
    <div class="form-group">
      <label class="form-label">Especialidad / Categoría *</label>
      <input type="text" id="gf-cat" class="form-input" value="${existing ? existing.category_name : 'Tacos • Comida mexicana'}">
    </div>
    <div class="form-group">
      <label class="form-label">Fotografía del Restaurante (URL o Cargar archivo)</label>
      <input type="text" id="gf-img" class="form-input" value="${existing ? existing.image_url : ''}" placeholder="https://... o sube una imagen">
      <div style="margin-top: 6px;">
        <input type="file" id="gf-file" accept="image/*" onchange="handleImageUpload(this, 'gf-img')">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Tiempo estimado de entrega</label>
      <input type="text" id="gf-time" class="form-input" value="${existing ? existing.delivery_time : '25 - 40 min'}">
    </div>
    <div class="form-group">
      <label class="form-label">Teléfono de contacto</label>
      <input type="text" id="gf-phone" class="form-input" value="${existing ? existing.phone : ''}">
    </div>
    <div class="form-group">
      <label class="form-label">Dirección física</label>
      <input type="text" id="gf-addr" class="form-input" value="${existing ? existing.address : ''}">
    </div>
    <div class="form-group">
      <label class="form-label">Estado de disponibilidad:</label>
      <select id="gf-open" class="form-select">
        <option value="1" ${existing && existing.is_open ? 'selected' : ''}>Disponible para recibir pedidos</option>
        <option value="0" ${existing && !existing.is_open ? 'selected' : ''}>Cerrado temporalmente</option>
      </select>
    </div>
  `;

  saveBtn.onclick = async () => {
    const payload = {
      name: document.getElementById('gf-name').value.trim(),
      category_name: document.getElementById('gf-cat').value.trim(),
      image_url: document.getElementById('gf-img').value.trim(),
      delivery_time: document.getElementById('gf-time').value.trim(),
      phone: document.getElementById('gf-phone').value.trim(),
      address: document.getElementById('gf-addr').value.trim(),
      is_open: document.getElementById('gf-open').value === '1',
      is_active: 1
    };

    if (!payload.name) { showToast('El nombre es obligatorio', 'warning'); return; }

    const url = existing ? `${API_BASE}/api/admin/restaurants/${existing.id}` : `${API_BASE}/api/admin/restaurants`;
    const method = existing ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: getAdminHeaders(),
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        showToast('Restaurante guardado con éxito');
        closeGenericFormModal();
        loadAdminRestaurants();
        loadRestaurants(); // Update public
      }
    } catch (e) {
      showToast('Error al guardar restaurante', 'error');
    }
  };

  document.getElementById('admin-generic-form-modal').classList.add('active');
}

async function editRestaurantModal(id) {
  const res = await fetch(`${API_BASE}/api/food/restaurants/${id}`);
  const data = await res.json();
  if (data.restaurant) openRestaurantFormModal(data.restaurant);
}

async function deleteRestaurant(id) {
  if (!confirm('¿Estás seguro de eliminar este restaurante?')) return;
  try {
    const res = await fetch(`${API_BASE}/api/admin/restaurants/${id}`, {
      method: 'DELETE',
      headers: getAdminHeaders()
    });
    if ((await res.json()).success) {
      showToast('Restaurante eliminado');
      loadAdminRestaurants();
      loadRestaurants();
    }
  } catch (e) {
    showToast('Error al eliminar', 'error');
  }
}

// ----------------------------------------------------
// TAB 4: PLATILLOS CRUD & PRECIOS
// ----------------------------------------------------
let allDishesCache = [];
async function loadAdminDishes() {
  const filterRest = document.getElementById('admin-dish-filter-rest')?.value || '';
  try {
    const res = await fetch(`${API_BASE}/api/admin/dishes${filterRest ? `?restaurant_id=${filterRest}` : ''}`, {
      headers: getAdminHeaders()
    });
    const data = await res.json();
    allDishesCache = data.dishes || [];

    // Populate restaurant selector if empty
    const filterSelect = document.getElementById('admin-dish-filter-rest');
    if (filterSelect && filterSelect.options.length <= 1) {
      const restRes = await fetch(`${API_BASE}/api/admin/restaurants`, { headers: getAdminHeaders() });
      const restData = await restRes.json();
      (restData.restaurants || []).forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.id;
        opt.textContent = r.name;
        filterSelect.appendChild(opt);
      });
    }

    const tbody = document.getElementById('admin-dishes-table-body');
    if (allDishesCache.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 20px;">No hay platillos registrados.</td></tr>`;
      return;
    }

    tbody.innerHTML = allDishesCache.map(d => `
      <tr>
        <td>
          <img src="${d.image_url || '/assets/logo.svg'}" style="width: 44px; height: 44px; border-radius: 6px; object-fit: cover;">
        </td>
        <td>
          <strong>${d.name}</strong>
          <div style="font-size: 11px; color: var(--text-muted);">${d.description || ''}</div>
        </td>
        <td>${d.restaurant_name || ''}</td>
        <td><strong style="color: var(--primary-green);">$${Number(d.price).toFixed(2)}</strong></td>
        <td>
          <span class="badge-status ${d.is_available ? 'delivered' : 'cancelled'}">
            ${d.is_available ? 'Disponible' : 'No disponible'}
          </span>
        </td>
        <td>
          <button class="btn-secondary" style="padding: 4px 8px; font-size: 12px;" onclick="editDishModal(${d.id})">Editar</button>
          <button class="btn-danger" style="padding: 4px 8px; font-size: 12px;" onclick="deleteDish(${d.id})">Eliminar</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error loading dishes:', err);
  }
}

async function openDishFormModal(existing = null) {
  const title = document.getElementById('generic-form-title');
  const fields = document.getElementById('generic-form-fields');
  const saveBtn = document.getElementById('generic-form-save-btn');

  // Load restaurants list
  const restRes = await fetch(`${API_BASE}/api/admin/restaurants`, { headers: getAdminHeaders() });
  const restData = await restRes.json();
  const rests = restData.restaurants || [];

  title.textContent = existing ? 'Editar Platillo' : 'Nuevo Platillo';

  fields.innerHTML = `
    <div class="form-group">
      <label class="form-label">Restaurante Asociado *</label>
      <select id="gf-dish-rest" class="form-select">
        ${rests.map(r => `<option value="${r.id}" ${existing && existing.restaurant_id === r.id ? 'selected' : ''}>${r.name}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Nombre del Platillo *</label>
      <input type="text" id="gf-dish-name" class="form-input" value="${existing ? existing.name : ''}">
    </div>
    <div class="form-group">
      <label class="form-label">Descripción</label>
      <input type="text" id="gf-dish-desc" class="form-input" value="${existing ? existing.description : ''}">
    </div>
    <div class="form-group">
      <label class="form-label">Precio ($ MXN) *</label>
      <input type="number" id="gf-dish-price" class="form-input" step="0.5" value="${existing ? existing.price : '75.00'}">
    </div>
    <div class="form-group">
      <label class="form-label">Fotografía del Platillo</label>
      <input type="text" id="gf-dish-img" class="form-input" value="${existing ? existing.image_url : ''}">
      <div style="margin-top: 6px;">
        <input type="file" accept="image/*" onchange="handleImageUpload(this, 'gf-dish-img')">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Disponibilidad:</label>
      <select id="gf-dish-avail" class="form-select">
        <option value="1" ${existing && existing.is_available ? 'selected' : ''}>Disponible</option>
        <option value="0" ${existing && !existing.is_available ? 'selected' : ''}>No disponible (Agotado)</option>
      </select>
    </div>
  `;

  saveBtn.onclick = async () => {
    const payload = {
      restaurant_id: Number(document.getElementById('gf-dish-rest').value),
      name: document.getElementById('gf-dish-name').value.trim(),
      description: document.getElementById('gf-dish-desc').value.trim(),
      price: Number(document.getElementById('gf-dish-price').value),
      image_url: document.getElementById('gf-dish-img').value.trim(),
      is_available: document.getElementById('gf-dish-avail').value === '1'
    };

    if (!payload.name || isNaN(payload.price)) {
      showToast('Verifica el nombre y precio', 'warning');
      return;
    }

    const url = existing ? `${API_BASE}/api/admin/dishes/${existing.id}` : `${API_BASE}/api/admin/dishes`;
    const method = existing ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: getAdminHeaders(),
        body: JSON.stringify(payload)
      });
      if ((await res.json()).success) {
        showToast('Platillo guardado con éxito');
        closeGenericFormModal();
        loadAdminDishes();
      }
    } catch (e) {
      showToast('Error al guardar platillo', 'error');
    }
  };

  document.getElementById('admin-generic-form-modal').classList.add('active');
}

function editDishModal(id) {
  const d = allDishesCache.find(x => x.id === id);
  if (d) openDishFormModal(d);
}

async function deleteDish(id) {
  if (!confirm('¿Eliminar este platillo?')) return;
  try {
    const res = await fetch(`${API_BASE}/api/admin/dishes/${id}`, {
      method: 'DELETE',
      headers: getAdminHeaders()
    });
    if ((await res.json()).success) {
      showToast('Platillo eliminado');
      loadAdminDishes();
    }
  } catch (e) {
    showToast('Error al eliminar', 'error');
  }
}

// ----------------------------------------------------
// TAB 5: ZONAS Y TARIFAS CRUD
// ----------------------------------------------------
let allZonesCache = [];
async function loadAdminZones() {
  try {
    const res = await fetch(`${API_BASE}/api/admin/zones`, { headers: getAdminHeaders() });
    const data = await res.json();
    allZonesCache = data.zones || [];

    const tbody = document.getElementById('admin-zones-table-body');
    tbody.innerHTML = allZonesCache.map(z => `
      <tr>
        <td><strong>${z.name}</strong></td>
        <td><strong style="color: var(--primary-green);">$${Number(z.fee).toFixed(2)} MXN</strong></td>
        <td>${z.description || ''}</td>
        <td><code style="font-size: 11px;">${z.keywords || ''}</code></td>
        <td><span class="badge-status ${z.is_active ? 'delivered' : 'cancelled'}">${z.is_active ? 'Activa' : 'Inactiva'}</span></td>
        <td>
          <button class="btn-secondary" style="padding: 4px 8px; font-size: 12px;" onclick="editZoneModal(${z.id})">Editar</button>
          <button class="btn-danger" style="padding: 4px 8px; font-size: 12px;" onclick="deleteZone(${z.id})">Eliminar</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error loading zones:', err);
  }
}

function openZoneFormModal(existing = null) {
  const title = document.getElementById('generic-form-title');
  const fields = document.getElementById('generic-form-fields');
  const saveBtn = document.getElementById('generic-form-save-btn');

  title.textContent = existing ? 'Editar Zona' : 'Nueva Zona de Entrega';

  fields.innerHTML = `
    <div class="form-group">
      <label class="form-label">Nombre de la Zona *</label>
      <input type="text" id="gf-zone-name" class="form-input" value="${existing ? existing.name : ''}" placeholder="Ej. Centro, Orillas, Ejido...">
    </div>
    <div class="form-group">
      <label class="form-label">Tarifa Base ($ MXN) *</label>
      <input type="number" id="gf-zone-fee" class="form-input" value="${existing ? existing.fee : '25.00'}">
    </div>
    <div class="form-group">
      <label class="form-label">Descripción</label>
      <input type="text" id="gf-zone-desc" class="form-input" value="${existing ? existing.description : ''}">
    </div>
    <div class="form-group">
      <label class="form-label">Palabras clave para detección automática (separadas por comas)</label>
      <textarea id="gf-zone-kw" class="form-textarea" rows="3" placeholder="centro,parque,iglesia,mercado...">${existing ? existing.keywords : ''}</textarea>
    </div>
  `;

  saveBtn.onclick = async () => {
    const payload = {
      name: document.getElementById('gf-zone-name').value.trim(),
      fee: Number(document.getElementById('gf-zone-fee').value),
      description: document.getElementById('gf-zone-desc').value.trim(),
      keywords: document.getElementById('gf-zone-kw').value.trim(),
      is_active: 1
    };

    if (!payload.name || isNaN(payload.fee)) return;

    const url = existing ? `${API_BASE}/api/admin/zones/${existing.id}` : `${API_BASE}/api/admin/zones`;
    const method = existing ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: getAdminHeaders(),
        body: JSON.stringify(payload)
      });
      if ((await res.json()).success) {
        showToast('Zona guardada');
        closeGenericFormModal();
        loadAdminZones();
        loadDeliveryZones();
      }
    } catch (e) {
      showToast('Error al guardar zona', 'error');
    }
  };

  document.getElementById('admin-generic-form-modal').classList.add('active');
}

function editZoneModal(id) {
  const z = allZonesCache.find(x => x.id === id);
  if (z) openZoneFormModal(z);
}

async function deleteZone(id) {
  if (!confirm('¿Eliminar esta zona?')) return;
  await fetch(`${API_BASE}/api/admin/zones/${id}`, { method: 'DELETE', headers: getAdminHeaders() });
  showToast('Zona eliminada');
  loadAdminZones();
  loadDeliveryZones();
}

// ----------------------------------------------------
// TAB 6: WHATSAPP ADMINISTRABLE CRUD
// ----------------------------------------------------
let allWhatsAppCache = [];
async function loadAdminWhatsApp() {
  try {
    const res = await fetch(`${API_BASE}/api/admin/whatsapp`, { headers: getAdminHeaders() });
    const data = await res.json();
    allWhatsAppCache = data.numbers || [];

    const tbody = document.getElementById('admin-whatsapp-table-body');
    tbody.innerHTML = allWhatsAppCache.map(w => `
      <tr>
        <td><strong>${w.label}</strong></td>
        <td><code>${w.phone}</code></td>
        <td>Prioridad ${w.priority}</td>
        <td><span class="badge-status ${w.is_active ? 'delivered' : 'cancelled'}">${w.is_active ? 'Activo' : 'Inactivo'}</span></td>
        <td>${w.notes || ''}</td>
        <td>
          <button class="btn-secondary" style="padding: 4px 8px; font-size: 12px;" onclick="editWhatsAppModal(${w.id})">Editar</button>
          <button class="btn-danger" style="padding: 4px 8px; font-size: 12px;" onclick="deleteWhatsApp(${w.id})">Eliminar</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error loading WhatsApp numbers:', err);
  }
}

function openWhatsAppFormModal(existing = null) {
  const title = document.getElementById('generic-form-title');
  const fields = document.getElementById('generic-form-fields');
  const saveBtn = document.getElementById('generic-form-save-btn');

  title.textContent = existing ? 'Editar Línea de WhatsApp' : 'Nueva Línea de WhatsApp';

  fields.innerHTML = `
    <div class="form-group">
      <label class="form-label">Etiqueta (Ej. Administrador, Repartidor 1...) *</label>
      <input type="text" id="gf-wa-label" class="form-input" value="${existing ? existing.label : ''}">
    </div>
    <div class="form-group">
      <label class="form-label">Número con código de país (Ej. 5219611234567) *</label>
      <input type="text" id="gf-wa-phone" class="form-input" value="${existing ? existing.phone : '521961'}">
    </div>
    <div class="form-group">
      <label class="form-label">Prioridad (1 = Mayor prioridad)</label>
      <input type="number" id="gf-wa-priority" class="form-input" value="${existing ? existing.priority : 1}">
    </div>
    <div class="form-group">
      <label class="form-label">Estado:</label>
      <select id="gf-wa-active" class="form-select">
        <option value="1" ${existing && existing.is_active ? 'selected' : ''}>Activo</option>
        <option value="0" ${existing && !existing.is_active ? 'selected' : ''}>Inactivo</option>
      </select>
    </div>
  `;

  saveBtn.onclick = async () => {
    const payload = {
      label: document.getElementById('gf-wa-label').value.trim(),
      phone: document.getElementById('gf-wa-phone').value.trim(),
      priority: Number(document.getElementById('gf-wa-priority').value),
      is_active: document.getElementById('gf-wa-active').value === '1'
    };

    if (!payload.label || !payload.phone) return;

    const url = existing ? `${API_BASE}/api/admin/whatsapp/${existing.id}` : `${API_BASE}/api/admin/whatsapp`;
    const method = existing ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: getAdminHeaders(),
        body: JSON.stringify(payload)
      });
      if ((await res.json()).success) {
        showToast('Línea guardada');
        closeGenericFormModal();
        loadAdminWhatsApp();
        loadActiveWhatsApp();
      }
    } catch (e) {
      showToast('Error al guardar línea', 'error');
    }
  };

  document.getElementById('admin-generic-form-modal').classList.add('active');
}

function editWhatsAppModal(id) {
  const w = allWhatsAppCache.find(x => x.id === id);
  if (w) openWhatsAppFormModal(w);
}

async function deleteWhatsApp(id) {
  if (!confirm('¿Eliminar este número?')) return;
  await fetch(`${API_BASE}/api/admin/whatsapp/${id}`, { method: 'DELETE', headers: getAdminHeaders() });
  showToast('Número eliminado');
  loadAdminWhatsApp();
  loadActiveWhatsApp();
}

// ----------------------------------------------------
// TAB 7: ESTADO DEL SERVICIO Y HORARIOS
// ----------------------------------------------------
async function setFastServiceStatus(newStatus) {
  try {
    const res = await fetch(`${API_BASE}/api/admin/service-status`, {
      method: 'POST',
      headers: getAdminHeaders(),
      body: JSON.stringify({ service_status: newStatus })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Estado del servicio actualizado a: ${newStatus}`);
      loadPlatformSettings();
    }
  } catch (e) {
    showToast('Error al cambiar estado', 'error');
  }
}

async function loadAdminScheduleView() {
  const res = await fetch(`${API_BASE}/api/settings`);
  const data = await res.json();
  const schedule = JSON.parse(data.settings?.schedule_config || '{}');

  document.getElementById('admin-service-message-input').value = data.settings?.service_status_message || '';

  const form = document.getElementById('admin-schedule-form');
  const dayNames = {
    monday: 'Lunes',
    tuesday: 'Martes',
    wednesday: 'Miércoles',
    thursday: 'Jueves',
    friday: 'Viernes',
    saturday: 'Sábado',
    sunday: 'Domingo'
  };

  let html = '';
  for (const [dayKey, label] of Object.entries(dayNames)) {
    const cfg = schedule[dayKey] || { enabled: true, open: '11:00', close: '22:00' };
    html += `
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border-color); gap: 10px; flex-wrap: wrap;">
        <label style="min-width: 90px; font-weight: 700; font-size: 14px;">${label}:</label>
        <div style="display: flex; align-items: center; gap: 8px;">
          <input type="checkbox" id="sched-enable-${dayKey}" ${cfg.enabled ? 'checked' : ''}>
          <span style="font-size: 13px;">Abierto</span>
        </div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <input type="time" id="sched-open-${dayKey}" class="form-input" style="padding: 4px 8px; width: 110px;" value="${cfg.open}">
          <span>a</span>
          <input type="time" id="sched-close-${dayKey}" class="form-input" style="padding: 4px 8px; width: 110px;" value="${cfg.close}">
        </div>
      </div>
    `;
  }
  form.innerHTML = html;
}

async function saveAdminScheduleSettings() {
  const dayKeys = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const newSched = {};

  for (const day of dayKeys) {
    newSched[day] = {
      enabled: document.getElementById(`sched-enable-${day}`).checked,
      open: document.getElementById(`sched-open-${day}`).value,
      close: document.getElementById(`sched-close-${day}`).value
    };
  }

  const customMsg = document.getElementById('admin-service-message-input').value.trim();

  try {
    const res = await fetch(`${API_BASE}/api/admin/service-status`, {
      method: 'POST',
      headers: getAdminHeaders(),
      body: JSON.stringify({
        schedule_config: newSched,
        service_status_message: customMsg
      })
    });
    if ((await res.json()).success) {
      showToast('Horarios guardados con éxito');
      loadPlatformSettings();
    }
  } catch (e) {
    showToast('Error al guardar horarios', 'error');
  }
}

// ----------------------------------------------------
// TAB 8: CLIENTES
// ----------------------------------------------------
async function loadAdminClients() {
  try {
    const res = await fetch(`${API_BASE}/api/admin/clients`, { headers: getAdminHeaders() });
    const data = await res.json();
    const tbody = document.getElementById('admin-clients-table-body');

    tbody.innerHTML = (data.clients || []).map(c => `
      <tr>
        <td><strong>${c.identifier}</strong></td>
        <td>${c.full_name || 'Sin nombre'}</td>
        <td>${c.phone || 'Sin teléfono'}</td>
        <td>${c.default_address || ''}</td>
        <td><strong>${c.total_orders}</strong></td>
        <td><strong style="color: var(--primary-green);">$${Number(c.total_spent).toFixed(2)}</strong></td>
        <td>${new Date(c.last_active_at).toLocaleDateString()}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error loading clients:', err);
  }
}

// ----------------------------------------------------
// TAB 9: MANTENIMIENTO, ALMACENAMIENTO & PROTOCOLO 6 PASOS
// ----------------------------------------------------
async function loadAdminStorageView() {
  try {
    const res = await fetch(`${API_BASE}/api/admin/storage/status`, { headers: getAdminHeaders() });
    const data = await res.json();

    document.getElementById('storage-db-size').textContent = `${(data.dbSize / 1024).toFixed(1)} KB`;
    document.getElementById('storage-uploads-size').textContent = `${(data.uploadsSize / 1024).toFixed(1)} KB`;
    document.getElementById('storage-active-orders').textContent = data.activeOrdersCount;
    document.getElementById('storage-archived-orders').textContent = data.archivedOrdersCount;

    // Populate archive year selector
    const yearSelect = document.getElementById('archive-year-select');
    if (yearSelect) {
      yearSelect.innerHTML = (data.orderYears || [new Date().getFullYear().toString()]).map(y => `
        <option value="${y}">Pedidos del año ${y}</option>
      `).join('');
    }

    // Load Audit Logs
    const logRes = await fetch(`${API_BASE}/api/admin/audit-logs`, { headers: getAdminHeaders() });
    const logData = await logRes.json();
    const tbody = document.getElementById('admin-audit-logs-body');

    tbody.innerHTML = (logData.logs || []).map(l => `
      <tr>
        <td>${new Date(l.created_at).toLocaleString()}</td>
        <td><span class="badge-tag blue">${l.action_type}</span></td>
        <td>${l.description}</td>
        <td><strong>${l.affected_count}</strong></td>
        <td>${l.performed_by}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error loading storage view:', err);
  }
}

// 6-Step Safe Cleanup Workflow (Specification #37)
let pendingCleanupAction = null;
async function startCleanupProcess(action) {
  const year = document.getElementById('archive-year-select')?.value || new Date().getFullYear().toString();
  pendingCleanupAction = { action, year };

  try {
    const res = await fetch(`${API_BASE}/api/admin/storage/cleanup-preview`, {
      method: 'POST',
      headers: getAdminHeaders(),
      body: JSON.stringify({ action, year })
    });
    const preview = await res.json();

    const titleEl = document.getElementById('cleanup-modal-title');
    const diagEl = document.getElementById('cleanup-diagnostics-text');
    const warnEl = document.getElementById('cleanup-warning-text');
    const confirmInput = document.getElementById('cleanup-confirm-input');

    confirmInput.value = '';

    if (action === 'archive') {
      titleEl.textContent = `Archivado Histórico de Pedidos (${year})`;
      diagEl.textContent = `Se detectaron ${preview.affectedOrders} pedidos correspondientes al año ${year} con valor total de $${Number(preview.affectedRevenue).toFixed(2)} MXN.`;
      warnEl.textContent = preview.warningMessage;
    } else if (action === 'delete_archived') {
      titleEl.textContent = `Eliminación Segura de Pedidos Archivados (${year})`;
      diagEl.textContent = `Se detectaron ${preview.affectedOrders} pedidos archivados en la base de datos para el año ${year}.`;
      warnEl.textContent = preview.warningMessage;
    } else if (action === 'clean_orphans') {
      titleEl.textContent = `Limpieza de Imágenes Huérfanas`;
      diagEl.textContent = `Se encontraron ${preview.orphanCount} imágenes que ya no se usan en restaurantes ni platillos (${(preview.orphanBytes / 1024).toFixed(1)} KB).`;
      warnEl.textContent = preview.warningMessage;
    }

    document.getElementById('admin-cleanup-modal').classList.add('active');
  } catch (err) {
    showToast('Error al inicializar diagnóstico', 'error');
  }
}

function closeCleanupModal() {
  document.getElementById('admin-cleanup-modal').classList.remove('active');
  pendingCleanupAction = null;
}

async function executeCleanupStep() {
  if (!pendingCleanupAction) return;

  const confirmText = document.getElementById('cleanup-confirm-input').value.trim();
  if (confirmText !== 'CONFIRMAR') {
    showToast('Debes escribir "CONFIRMAR" para proceder', 'error');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/admin/storage/cleanup-execute`, {
      method: 'POST',
      headers: getAdminHeaders(),
      body: JSON.stringify({
        action: pendingCleanupAction.action,
        year: pendingCleanupAction.year,
        confirmToken: confirmText
      })
    });
    const result = await res.json();

    if (result.success) {
      showToast(result.message);
      closeCleanupModal();
      loadAdminStorageView();
    } else {
      showToast(result.error || 'Operación cancelada', 'error');
    }
  } catch (err) {
    showToast('Error al ejecutar la operación', 'error');
  }
}

// ----------------------------------------------------
// TAB 10: AJUSTES GENERALES
// ----------------------------------------------------
async function loadAdminGeneralSettings() {
  const res = await fetch(`${API_BASE}/api/settings`);
  const data = await res.json();
  const s = data.settings || {};

  document.getElementById('setting-platform-name').value = s.platform_name || 'SanFer Eats';
  document.getElementById('setting-tagline').value = s.tagline || 'Tu ciudad, en un solo lugar';
  document.getElementById('setting-hero-desc').value = s.hero_description || '';
  document.getElementById('setting-admin-pin').value = s.admin_pin || '1234';
}

async function saveGeneralSettings() {
  const payload = {
    platform_name: document.getElementById('setting-platform-name').value.trim(),
    tagline: document.getElementById('setting-tagline').value.trim(),
    hero_description: document.getElementById('setting-hero-desc').value.trim(),
    admin_pin: document.getElementById('setting-admin-pin').value.trim()
  };

  try {
    const res = await fetch(`${API_BASE}/api/admin/settings`, {
      method: 'POST',
      headers: getAdminHeaders(),
      body: JSON.stringify(payload)
    });
    if ((await res.json()).success) {
      showToast('Ajustes guardados');
      if (payload.admin_pin) {
        AppState.adminPin = payload.admin_pin;
        sessionStorage.setItem('sf_admin_pin', payload.admin_pin);
      }
      loadPlatformSettings();
    }
  } catch (e) {
    showToast('Error al guardar ajustes', 'error');
  }
}

// ----------------------------------------------------
// IMAGE UPLOAD HELPER (Camera or File Picker)
// ----------------------------------------------------
function handleImageUpload(inputEl, targetInputId) {
  const file = inputEl.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    const dataUrl = e.target.result;
    try {
      showToast('Subiendo fotografía...');
      const res = await fetch(`${API_BASE}/api/admin/upload-image`, {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify({ dataUrl })
      });
      const data = await res.json();
      if (data.success && data.imageUrl) {
        document.getElementById(targetInputId).value = data.imageUrl;
        showToast('¡Imagen guardada en el servidor!');
      } else {
        showToast(data.error || 'Error al subir imagen', 'error');
      }
    } catch (err) {
      showToast('Error en la carga de archivo', 'error');
    }
  };
  reader.readAsDataURL(file);
}

function closeGenericFormModal() {
  document.getElementById('admin-generic-form-modal').classList.remove('active');
}
