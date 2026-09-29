// server.js - Full Backend Server for SanFer Eats using native Node.js & node:sqlite
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { db } = require('./database');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const DATA_DIR = path.join(__dirname, 'data');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// MIME types dictionary for static file serving
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf'
};

// Helper to send JSON responses
function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Pin'
  });
  res.end(JSON.stringify(data));
}

// Helper to parse JSON request body
function parseJSONBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 15 * 1024 * 1024) { // 15MB limit
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        if (!body || body.trim() === '') {
          resolve({});
        } else {
          resolve(JSON.parse(body));
        }
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

// Helper to determine real-time service status based on settings and schedule
function checkServiceStatus() {
  const statusSetting = db.prepare("SELECT value FROM settings WHERE key = 'service_status'").get()?.value || 'active';
  const customMessage = db.prepare("SELECT value FROM settings WHERE key = 'service_status_message'").get()?.value || '';
  const scheduleJson = db.prepare("SELECT value FROM settings WHERE key = 'schedule_config'").get()?.value;

  if (statusSetting === 'inactive' || statusSetting === 'temporary_close') {
    return {
      isOpen: false,
      status: statusSetting,
      message: customMessage || 'SanFer Eats se encuentra cerrado por el momento.',
      nextOpening: null
    };
  }

  if (statusSetting === 'active') {
    return {
      isOpen: true,
      status: 'active',
      message: 'Servicio disponible para pedidos inmediatos.',
      nextOpening: null
    };
  }

  // Scheduled mode: check day and hour
  try {
    const schedule = JSON.parse(scheduleJson || '{}');
    const now = new Date();
    // Days in Spanish/English mapping
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const currentDay = days[now.getDay()];
    const dayConfig = schedule[currentDay];

    if (!dayConfig || !dayConfig.enabled) {
      return {
        isOpen: false,
        status: 'scheduled',
        message: 'Hoy es día de descanso en SanFer Eats.',
        nextOpening: 'Mañana en horario habitual'
      };
    }

    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const [openH, openM] = dayConfig.open.split(':').map(Number);
    const [closeH, closeM] = dayConfig.close.split(':').map(Number);
    const openMinutes = openH * 60 + openM;
    const closeMinutes = closeH * 60 + closeM;

    if (currentMinutes >= openMinutes && currentMinutes <= closeMinutes) {
      return {
        isOpen: true,
        status: 'scheduled',
        message: `Servicio abierto hasta las ${dayConfig.close}`,
        nextOpening: null
      };
    } else {
      return {
        isOpen: false,
        status: 'scheduled',
        message: `Cerrado en este momento. Horario de hoy: ${dayConfig.open} a ${dayConfig.close}`,
        nextOpening: `Abre a las ${dayConfig.open}`
      };
    }
  } catch (e) {
    return {
      isOpen: true,
      status: 'active',
      message: 'Servicio activo',
      nextOpening: null
    };
  }
}

// Automatic delivery zone detection from address keywords
function detectDeliveryZone(address = '') {
  const normAddress = address.toLowerCase();
  const zones = db.prepare('SELECT * FROM delivery_zones WHERE is_active = 1 ORDER BY display_order ASC').all();

  let matchedZone = null;
  for (const zone of zones) {
    if (zone.keywords) {
      const keywords = zone.keywords.split(',').map(k => k.trim().toLowerCase()).filter(k => k.length > 0);
      for (const kw of keywords) {
        if (normAddress.includes(kw)) {
          matchedZone = zone;
          break;
        }
      }
    }
    if (matchedZone) break;
  }

  // Fallback to the first active zone or default
  if (!matchedZone && zones.length > 0) {
    matchedZone = zones[0];
  }

  return matchedZone || { id: 1, name: 'Centro', fee: 20.00, description: 'Tarifa base centro' };
}

// Generate next order number
function getNextOrderNumber() {
  const row = db.prepare('SELECT COUNT(*) as total FROM orders').get();
  const nextNum = (row?.total || 0) + 1001;
  return `#SF-${nextNum}`;
}

// Dynamic WhatsApp message builder according to specifications
function buildWhatsAppOrderMessage(orderData) {
  const {
    order_number,
    client_identifier,
    client_name,
    client_phone,
    service_type,
    items,
    notes,
    pickup_address,
    delivery_address,
    zone_name,
    estimated_delivery_fee,
    subtotal,
    total
  } = orderData;

  let msg = `🛵 *SOLICITUD DE PEDIDO - SANFER EATS*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📋 *Pedido:* ${order_number}\n`;
  msg += `👤 *Cliente:* ${client_identifier} (${client_name || 'Sin nombre'})\n`;
  if (client_phone) msg += `📞 *Teléfono:* ${client_phone}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

  if (service_type === 'food') {
    msg += `🍽️ *SERVICIO:* Comida Restaurantes\n\n`;
    // Grouped by restaurant
    if (Array.isArray(items)) {
      items.forEach((group, index) => {
        msg += `🏪 *${group.restaurant_name || 'Restaurante'}*\n`;
        if (Array.isArray(group.items)) {
          group.items.forEach(it => {
            msg += `  • ${it.quantity}x ${it.name} - $${(it.subtotal || it.price * it.quantity).toFixed(2)}\n`;
          });
        }
        msg += `\n`;
      });
    }
  } else if (service_type === 'shopping') {
    msg += `🛒 *SERVICIO:* Compras y Súper\n\n`;
    if (Array.isArray(items)) {
      items.forEach(storeGroup => {
        if (storeGroup.store_name) msg += `🏪 *Establecimiento sugerido:* ${storeGroup.store_name}\n`;
        msg += `📝 *Lista de productos:* \n${storeGroup.items_text || ''}\n\n`;
      });
    }
  } else if (service_type === 'courier') {
    msg += `📦 *SERVICIO:* Entrega y Paquetería Local\n\n`;
    if (Array.isArray(items) && items[0]) {
      const it = items[0];
      msg += `📍 *Recoger en:* ${pickup_address || it.pickup_address || 'No especificado'}\n`;
      msg += `📦 *Descripción:* ${it.description || 'Paquete o mandado'}\n`;
      if (it.recipient_name) msg += `🙋‍♂️ *Destinatario:* ${it.recipient_name} (${it.recipient_phone || ''})\n`;
    }
    msg += `\n`;
  }

  if (notes && notes.trim() !== '') {
    msg += `💬 *Observaciones:* ${notes}\n\n`;
  }

  msg += `📍 *Dirección de entrega:* ${delivery_address}\n`;
  msg += `🗺️ *Zona detectada:* ${zone_name || 'Centro'}\n\n`;

  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  if (subtotal > 0) {
    msg += `💵 *Subtotal productos:* $${subtotal.toFixed(2)} MXN\n`;
  }
  msg += `🛵 *Tarifa de entrega estimada:* $${estimated_delivery_fee.toFixed(2)} MXN\n`;
  msg += `💰 *TOTAL ESTIMADO:* $${total.toFixed(2)} MXN\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
  msg += `⚠️ *Nota importante:* Esta es una solicitud para revisión y confirmación por el equipo de SanFer Eats. Te confirmaremos disponibilidad y tarifa final a la brevedad.`;

  return msg;
}

// Request Handler
const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname;
  const method = req.method;

  // CORS Headers
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Pin'
    });
    res.end();
    return;
  }

  try {
    // ----------------------------------------------------
    // API ROUTES
    // ----------------------------------------------------

    // 1. Service status & general settings
    if (pathname === '/api/settings' && method === 'GET') {
      const settingsRows = db.prepare('SELECT key, value FROM settings').all();
      const settingsObj = {};
      for (const row of settingsRows) {
        settingsObj[row.key] = row.value;
      }
      const serviceStatus = checkServiceStatus();
      return sendJSON(res, 200, {
        settings: settingsObj,
        serviceStatus
      });
    }

    // 2. Active WhatsApp Number
    if (pathname === '/api/whatsapp-active' && method === 'GET') {
      const activeNumber = db.prepare('SELECT * FROM whatsapp_numbers WHERE is_active = 1 ORDER BY priority ASC LIMIT 1').get();
      return sendJSON(res, 200, {
        whatsapp: activeNumber || { phone: '5219611234567', label: 'SanFer Eats' }
      });
    }

    // 3. Delivery Zones
    if (pathname === '/api/delivery-zones' && method === 'GET') {
      const zones = db.prepare('SELECT * FROM delivery_zones WHERE is_active = 1 ORDER BY display_order ASC').all();
      return sendJSON(res, 200, { zones });
    }

    // 4. Calculate Delivery Fare
    if (pathname === '/api/calculate-fare' && method === 'POST') {
      const body = await parseJSONBody(req);
      const address = body.address || '';
      const zone = detectDeliveryZone(address);
      return sendJSON(res, 200, {
        zone,
        estimatedFee: zone.fee,
        zoneName: zone.name
      });
    }

    // 5. Food Categories
    if (pathname === '/api/food/categories' && method === 'GET') {
      const categories = db.prepare(`
        SELECT c.*, COUNT(r.id) as restaurant_count
        FROM food_categories c
        LEFT JOIN restaurants r ON r.category_name LIKE '%' || c.name || '%' AND r.is_active = 1
        WHERE c.is_active = 1
        GROUP BY c.id
        ORDER BY c.display_order ASC
      `).all();
      return sendJSON(res, 200, { categories });
    }

    // 6. Food Restaurants
    if (pathname === '/api/food/restaurants' && method === 'GET') {
      const category = urlObj.searchParams.get('category');
      const search = urlObj.searchParams.get('search');

      let query = 'SELECT * FROM restaurants WHERE is_active = 1';
      const params = [];

      if (category && category !== 'Todos') {
        query += ' AND category_name LIKE ?';
        params.push(`%${category}%`);
      }

      if (search && search.trim() !== '') {
        query += ' AND (name LIKE ? OR description LIKE ? OR category_name LIKE ?)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      query += ' ORDER BY rating DESC, name ASC';
      const restaurants = db.prepare(query).all(...params);

      // Fetch dishes for each restaurant
      const getDishes = db.prepare('SELECT * FROM dishes WHERE restaurant_id = ? AND is_available = 1 ORDER BY is_featured DESC, name ASC');
      const formatted = restaurants.map(r => ({
        ...r,
        dishes: getDishes.all(r.id)
      }));

      return sendJSON(res, 200, { restaurants: formatted });
    }

    // 7. Single Restaurant details
    if (pathname.startsWith('/api/food/restaurants/') && method === 'GET') {
      const id = pathname.split('/').pop();
      const restaurant = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(id);
      if (!restaurant) {
        return sendJSON(res, 404, { error: 'Restaurante no encontrado' });
      }
      const dishes = db.prepare('SELECT * FROM dishes WHERE restaurant_id = ? ORDER BY is_featured DESC, name ASC').all(id);
      return sendJSON(res, 200, { restaurant, dishes });
    }

    // 8. Super/Grocery Categories and Stores
    if (pathname === '/api/super/catalog' && method === 'GET') {
      const categories = db.prepare('SELECT * FROM super_categories WHERE is_active = 1 ORDER BY display_order ASC').all();
      const stores = db.prepare('SELECT * FROM super_stores WHERE is_active = 1 ORDER BY id ASC').all();
      const parsedCats = categories.map(c => ({
        ...c,
        suggested_items: JSON.parse(c.suggested_items_json || '[]')
      }));
      return sendJSON(res, 200, { categories: parsedCats, stores });
    }

    // 9. Client check identifier
    if (pathname === '/api/clients/check' && method === 'POST') {
      const body = await parseJSONBody(req);
      const identifier = (body.identifier || '').trim();

      if (!identifier || identifier.length < 2) {
        return sendJSON(res, 400, { valid: false, message: 'El identificador debe tener al menos 2 caracteres.' });
      }

      // Check if client exists
      const existing = db.prepare('SELECT * FROM clients WHERE LOWER(identifier) = LOWER(?)').get(identifier);
      if (existing) {
        return sendJSON(res, 200, {
          available: false,
          isExistingClient: true,
          client: existing,
          message: `¡Bienvenido de vuelta, ${existing.full_name || existing.identifier}!`
        });
      }

      return sendJSON(res, 200, {
        available: true,
        isExistingClient: false,
        message: '¡Identificador disponible!'
      });
    }

    // 10. Register or Update Client
    if (pathname === '/api/clients/register-or-update' && method === 'POST') {
      const body = await parseJSONBody(req);
      const { identifier, full_name, phone, default_address } = body;
      const now = new Date().toISOString();

      if (!identifier || identifier.trim().length < 2) {
        return sendJSON(res, 400, { error: 'Identificador requerido' });
      }

      const cleanId = identifier.trim();
      let client = db.prepare('SELECT * FROM clients WHERE LOWER(identifier) = LOWER(?)').get(cleanId);

      if (client) {
        // Update client info
        db.prepare(`
          UPDATE clients
          SET full_name = COALESCE(?, full_name),
              phone = COALESCE(?, phone),
              default_address = COALESCE(?, default_address),
              last_active_at = ?
          WHERE id = ?
        `).run(full_name || null, phone || null, default_address || null, now, client.id);
        client = db.prepare('SELECT * FROM clients WHERE id = ?').get(client.id);
      } else {
        const result = db.prepare(`
          INSERT INTO clients (identifier, full_name, phone, default_address, created_at, last_active_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(cleanId, full_name || cleanId, phone || '', default_address || '', now, now);
        client = db.prepare('SELECT * FROM clients WHERE id = ?').get(result.lastInsertRowid);
      }

      return sendJSON(res, 200, { client });
    }

    // 11. Create Order (Food, Shopping, Courier)
    if (pathname === '/api/orders/create' && method === 'POST') {
      // Check service status first
      const currentService = checkServiceStatus();
      if (!currentService.isOpen) {
        return sendJSON(res, 400, {
          error: 'Servicio cerrado',
          message: currentService.message
        });
      }

      const body = await parseJSONBody(req);
      const {
        client_identifier,
        client_name,
        client_phone,
        service_type, // 'food', 'shopping', 'courier'
        items,
        notes,
        pickup_address,
        delivery_address,
        delivery_zone_id
      } = body;

      if (!client_identifier || !delivery_address) {
        return sendJSON(res, 400, { error: 'Faltan campos obligatorios (identificador y dirección de entrega)' });
      }

      const now = new Date().toISOString();

      // Ensure client exists
      let client = db.prepare('SELECT * FROM clients WHERE LOWER(identifier) = LOWER(?)').get(client_identifier.trim());
      if (!client) {
        const resClient = db.prepare(`
          INSERT INTO clients (identifier, full_name, phone, default_address, created_at, last_active_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(client_identifier.trim(), client_name || client_identifier.trim(), client_phone || '', delivery_address, now, now);
        client = db.prepare('SELECT * FROM clients WHERE id = ?').get(resClient.lastInsertRowid);
      } else {
        db.prepare('UPDATE clients SET last_active_at = ?, default_address = ? WHERE id = ?').run(now, delivery_address, client.id);
      }

      // Detect zone and calculate fee
      let zone;
      if (delivery_zone_id) {
        zone = db.prepare('SELECT * FROM delivery_zones WHERE id = ?').get(delivery_zone_id);
      }
      if (!zone) {
        zone = detectDeliveryZone(delivery_address);
      }

      const estimatedFee = Number(zone.fee || 20.00);

      // Calculate subtotal
      let subtotal = 0;
      if (service_type === 'food' && Array.isArray(items)) {
        for (const group of items) {
          if (Array.isArray(group.items)) {
            for (const it of group.items) {
              const qty = Number(it.quantity) || 1;
              const price = Number(it.price) || 0;
              it.subtotal = qty * price;
              subtotal += it.subtotal;
            }
          }
        }
      } else if (service_type === 'shopping' && body.estimated_subtotal) {
        subtotal = Number(body.estimated_subtotal) || 0;
      }

      const total = subtotal + estimatedFee;
      const orderNumber = getNextOrderNumber();

      // Get active WhatsApp Number
      const activeWA = db.prepare('SELECT * FROM whatsapp_numbers WHERE is_active = 1 ORDER BY priority ASC LIMIT 1').get();
      const waPhone = activeWA ? activeWA.phone : '5219611234567';

      // Insert Order
      const insertOrder = db.prepare(`
        INSERT INTO orders (
          order_number, client_id, client_identifier, client_name, client_phone,
          service_type, items_json, notes, pickup_address, delivery_address,
          delivery_zone_id, detected_zone_name, estimated_delivery_fee, confirmed_delivery_fee,
          fee_status, subtotal, total, status, whatsapp_number_used, is_archived,
          archived_year, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const orderResult = insertOrder.run(
        orderNumber,
        client.id,
        client.identifier,
        client_name || client.full_name,
        client_phone || client.phone,
        service_type,
        JSON.stringify(items || []),
        notes || '',
        pickup_address || '',
        delivery_address,
        zone.id,
        zone.name,
        estimatedFee,
        null,
        'estimated',
        subtotal,
        total,
        'new',
        waPhone,
        0,
        new Date().getFullYear(),
        now,
        now
      );

      const orderId = orderResult.lastInsertRowid;

      // Insert History Record
      db.prepare(`
        INSERT INTO order_status_history (order_id, old_status, new_status, notes, changed_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(Number(orderId), 'none', 'new', 'Solicitud creada por el cliente', 'Cliente', now);

      // Build dynamic WhatsApp text
      const orderPayload = {
        order_number: orderNumber,
        client_identifier: client.identifier,
        client_name: client_name || client.full_name,
        client_phone: client_phone || client.phone,
        service_type,
        items,
        notes,
        pickup_address,
        delivery_address,
        zone_name: zone.name,
        estimated_delivery_fee: estimatedFee,
        subtotal,
        total
      };

      const waMessage = buildWhatsAppOrderMessage(orderPayload);
      const cleanPhone = waPhone.replace(/\D/g, '');
      const waLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(waMessage)}`;

      return sendJSON(res, 201, {
        success: true,
        orderNumber,
        orderId,
        waPhone,
        waMessage,
        waLink,
        order: {
          ...orderPayload,
          id: orderId,
          status: 'new'
        }
      });
    }

    // 12. Client orders history
    if (pathname.startsWith('/api/clients/') && pathname.endsWith('/orders') && method === 'GET') {
      const parts = pathname.split('/');
      const identifier = parts[3];
      const orders = db.prepare(`
        SELECT * FROM orders
        WHERE LOWER(client_identifier) = LOWER(?) AND is_archived = 0
        ORDER BY created_at DESC
        LIMIT 20
      `).all(identifier);

      const formatted = orders.map(o => ({
        ...o,
        items: JSON.parse(o.items_json || '[]')
      }));

      return sendJSON(res, 200, { orders: formatted });
    }

    // 13. Order tracking by order number
    if (pathname.startsWith('/api/orders/') && pathname.endsWith('/track') && method === 'GET') {
      const parts = pathname.split('/');
      const orderNumber = decodeURIComponent(parts[3]);
      const order = db.prepare('SELECT * FROM orders WHERE order_number = ?').get(orderNumber);

      if (!order) {
        return sendJSON(res, 404, { error: 'Pedido no encontrado' });
      }

      const history = db.prepare('SELECT * FROM order_status_history WHERE order_id = ? ORDER BY created_at ASC').all(order.id);
      return sendJSON(res, 200, {
        order: {
          ...order,
          items: JSON.parse(order.items_json || '[]')
        },
        history
      });
    }

    // ----------------------------------------------------
    // ADMIN ROUTES (Protected via PIN / Header)
    // ----------------------------------------------------

    // Admin PIN check helper
    function verifyAdmin(request) {
      const pinHeader = request.headers['x-admin-pin'];
      const realPin = db.prepare("SELECT value FROM settings WHERE key = 'admin_pin'").get()?.value || '1234';
      return pinHeader === realPin;
    }

    // Admin Auth verification
    if (pathname === '/api/admin/login' && method === 'POST') {
      const body = await parseJSONBody(req);
      const pin = body.pin;
      const realPin = db.prepare("SELECT value FROM settings WHERE key = 'admin_pin'").get()?.value || '1234';

      if (pin === realPin) {
        return sendJSON(res, 200, { success: true, message: 'Autenticado' });
      } else {
        return sendJSON(res, 401, { success: false, error: 'PIN incorrecto' });
      }
    }

    // Admin Dashboard & Statistics
    if (pathname === '/api/admin/dashboard' && method === 'GET') {
      if (!verifyAdmin(req)) return sendJSON(res, 401, { error: 'No autorizado' });

      const period = urlObj.searchParams.get('period') || 'month'; // 'today', 'week', 'month', 'three_months', 'year', 'all'
      const startDate = urlObj.searchParams.get('startDate');
      const endDate = urlObj.searchParams.get('endDate');

      const now = new Date();
      let dateFilter = '';
      const params = [];

      if (period === 'today') {
        const todayStr = now.toISOString().split('T')[0];
        dateFilter = "DATE(o.created_at) = DATE(?)";
        params.push(todayStr);
      } else if (period === 'week') {
        const oneWeekAgo = new Date(now.getTime() - 7 * 86400000).toISOString();
        dateFilter = "o.created_at >= ?";
        params.push(oneWeekAgo);
      } else if (period === 'month') {
        const oneMonthAgo = new Date(now.getTime() - 30 * 86400000).toISOString();
        dateFilter = "o.created_at >= ?";
        params.push(oneMonthAgo);
      } else if (period === 'three_months') {
        const threeMonthsAgo = new Date(now.getTime() - 90 * 86400000).toISOString();
        dateFilter = "o.created_at >= ?";
        params.push(threeMonthsAgo);
      } else if (period === 'year') {
        const currentYear = now.getFullYear().toString();
        dateFilter = "strftime('%Y', o.created_at) = ?";
        params.push(currentYear);
      } else if (period === 'custom' && startDate && endDate) {
        dateFilter = "DATE(o.created_at) BETWEEN DATE(?) AND DATE(?)";
        params.push(startDate, endDate);
      }

      const whereClause = dateFilter ? `WHERE ${dateFilter}` : '';

      // KPIs
      const kpis = db.prepare(`
        SELECT
          COUNT(*) as total_orders,
          SUM(CASE WHEN o.status = 'delivered' THEN 1 ELSE 0 END) as completed_orders,
          SUM(CASE WHEN o.status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_orders,
          SUM(CASE WHEN o.status != 'cancelled' THEN o.total ELSE 0 END) as total_revenue,
          COUNT(DISTINCT o.client_id) as active_clients
        FROM orders o
        ${whereClause}
      `).get(...params);

      // Chart 1: Evolution of orders (by day / date)
      const evolution = db.prepare(`
        SELECT
          SUBSTR(o.created_at, 1, 10) as order_date,
          COUNT(*) as order_count,
          SUM(o.total) as revenue
        FROM orders o
        ${whereClause}
        GROUP BY order_date
        ORDER BY order_date ASC
        LIMIT 30
      `).all(...params);

      // Chart 2 & 3: Top dishes & Top restaurants
      // Extract from active orders
      const allOrders = db.prepare(`SELECT o.service_type, o.items_json FROM orders o ${whereClause}`).all(...params);
      const dishCountMap = {};
      const restCountMap = {};

      for (const ord of allOrders) {
        try {
          const items = JSON.parse(ord.items_json || '[]');
          if (ord.service_type === 'food') {
            for (const group of items) {
              const rName = group.restaurant_name || 'Restaurante';
              restCountMap[rName] = (restCountMap[rName] || 0) + 1;

              if (Array.isArray(group.items)) {
                for (const it of group.items) {
                  const dName = it.name || 'Platillo';
                  dishCountMap[dName] = (dishCountMap[dName] || 0) + (Number(it.quantity) || 1);
                }
              }
            }
          }
        } catch (e) {}
      }

      const topDishes = Object.entries(dishCountMap)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 7);

      const topRestaurants = Object.entries(restCountMap)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 7);

      // Chart 4: Client Activity / Recurrence
      const clientActivity = db.prepare(`
        SELECT
          c.identifier,
          c.full_name,
          COUNT(o.id) as orders_count,
          SUM(o.total) as total_spent,
          MAX(o.created_at) as last_order
        FROM clients c
        JOIN orders o ON o.client_id = c.id
        ${whereClause}
        GROUP BY c.id
        ORDER BY orders_count DESC, total_spent DESC
        LIMIT 8
      `).all(...params);

      return sendJSON(res, 200, {
        kpis: {
          total_orders: kpis?.total_orders || 0,
          completed_orders: kpis?.completed_orders || 0,
          cancelled_orders: kpis?.cancelled_orders || 0,
          total_revenue: kpis?.total_revenue || 0,
          active_clients: kpis?.active_clients || 0
        },
        charts: {
          evolution,
          topDishes,
          topRestaurants,
          clientActivity
        }
      });
    }

    // Admin Orders List & Filter
    if (pathname === '/api/admin/orders' && method === 'GET') {
      if (!verifyAdmin(req)) return sendJSON(res, 401, { error: 'No autorizado' });

      const status = urlObj.searchParams.get('status');
      const service = urlObj.searchParams.get('service');
      const search = urlObj.searchParams.get('search');
      const showArchived = urlObj.searchParams.get('archived') === '1';

      let query = 'SELECT * FROM orders WHERE is_archived = ?';
      const params = [showArchived ? 1 : 0];

      if (status && status !== 'all') {
        query += ' AND status = ?';
        params.push(status);
      }

      if (service && service !== 'all') {
        query += ' AND service_type = ?';
        params.push(service);
      }

      if (search && search.trim() !== '') {
        query += ' AND (order_number LIKE ? OR client_identifier LIKE ? OR client_name LIKE ? OR delivery_address LIKE ?)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
      }

      query += ' ORDER BY created_at DESC';
      const orders = db.prepare(query).all(...params);

      const formatted = orders.map(o => ({
        ...o,
        items: JSON.parse(o.items_json || '[]')
      }));

      return sendJSON(res, 200, { orders: formatted });
    }

    // Admin Update Order Status
    if (pathname.startsWith('/api/admin/orders/') && pathname.endsWith('/status') && method === 'POST') {
      if (!verifyAdmin(req)) return sendJSON(res, 401, { error: 'No autorizado' });

      const parts = pathname.split('/');
      const orderId = parts[4];
      const body = await parseJSONBody(req);
      const { new_status, notes, changed_by } = body;

      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
      if (!order) return sendJSON(res, 404, { error: 'Pedido no encontrado' });

      const now = new Date().toISOString();
      db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').run(new_status, now, orderId);

      // Record in history
      db.prepare(`
        INSERT INTO order_status_history (order_id, old_status, new_status, notes, changed_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(Number(orderId), order.status, new_status, notes || '', changed_by || 'Administrador', now);

      return sendJSON(res, 200, { success: true, new_status });
    }

    // Admin Confirm or Adjust Delivery Fee
    if (pathname.startsWith('/api/admin/orders/') && pathname.endsWith('/confirm-fee') && method === 'POST') {
      if (!verifyAdmin(req)) return sendJSON(res, 401, { error: 'No autorizado' });

      const parts = pathname.split('/');
      const orderId = parts[4];
      const body = await parseJSONBody(req);
      const { confirmed_fee, notes, admin_name } = body;

      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
      if (!order) return sendJSON(res, 404, { error: 'Pedido no encontrado' });

      const newFee = Number(confirmed_fee);
      const newTotal = order.subtotal + newFee;
      const now = new Date().toISOString();

      db.prepare(`
        UPDATE orders
        SET confirmed_delivery_fee = ?,
            fee_status = 'confirmed',
            fee_confirmed_at = ?,
            fee_confirmed_by = ?,
            total = ?,
            updated_at = ?
        WHERE id = ?
      `).run(newFee, now, admin_name || 'Administrador', newTotal, now, orderId);

      // Record in history
      db.prepare(`
        INSERT INTO order_status_history (order_id, old_status, new_status, notes, changed_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        Number(orderId),
        order.status,
        order.status,
        `Tarifa confirmada/ajustada de $${order.estimated_delivery_fee} a $${newFee}. ${notes || ''}`,
        admin_name || 'Administrador',
        now
      );

      return sendJSON(res, 200, {
        success: true,
        confirmed_fee: newFee,
        total: newTotal
      });
    }

    // Admin CRUD: Restaurants
    if (pathname === '/api/admin/restaurants' && method === 'GET') {
      if (!verifyAdmin(req)) return sendJSON(res, 401, { error: 'No autorizado' });
      const restaurants = db.prepare('SELECT * FROM restaurants ORDER BY id DESC').all();
      return sendJSON(res, 200, { restaurants });
    }

    if (pathname === '/api/admin/restaurants' && method === 'POST') {
      if (!verifyAdmin(req)) return sendJSON(res, 401, { error: 'No autorizado' });
      const body = await parseJSONBody(req);
      const now = new Date().toISOString();

      const resInsert = db.prepare(`
        INSERT INTO restaurants (name, category_name, image_url, description, rating, delivery_time, phone, address, is_active, is_open, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        body.name,
        body.category_name || 'Comida',
        body.image_url || 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600',
        body.description || '',
        Number(body.rating) || 4.8,
        body.delivery_time || '25 - 40 min',
        body.phone || '',
        body.address || '',
        body.is_active !== undefined ? (body.is_active ? 1 : 0) : 1,
        body.is_open !== undefined ? (body.is_open ? 1 : 0) : 1,
        now
      );

      return sendJSON(res, 201, { success: true, id: resInsert.lastInsertRowid });
    }

    if (pathname.startsWith('/api/admin/restaurants/') && method === 'PUT') {
      if (!verifyAdmin(req)) return sendJSON(res, 401, { error: 'No autorizado' });
      const id = pathname.split('/').pop();
      const body = await parseJSONBody(req);

      db.prepare(`
        UPDATE restaurants
        SET name = ?, category_name = ?, image_url = ?, description = ?,
            rating = ?, delivery_time = ?, phone = ?, address = ?,
            is_active = ?, is_open = ?
        WHERE id = ?
      `).run(
        body.name,
        body.category_name,
        body.image_url,
        body.description,
        Number(body.rating),
        body.delivery_time,
        body.phone,
        body.address,
        body.is_active ? 1 : 0,
        body.is_open ? 1 : 0,
        id
      );

      return sendJSON(res, 200, { success: true });
    }

    if (pathname.startsWith('/api/admin/restaurants/') && method === 'DELETE') {
      if (!verifyAdmin(req)) return sendJSON(res, 401, { error: 'No autorizado' });
      const id = pathname.split('/').pop();

      // Soft archive protection check: if orders reference this restaurant in their JSON
      db.prepare('DELETE FROM restaurants WHERE id = ?').run(id);
      return sendJSON(res, 200, { success: true });
    }

    // Admin CRUD: Dishes
    if (pathname === '/api/admin/dishes' && method === 'GET') {
      if (!verifyAdmin(req)) return sendJSON(res, 401, { error: 'No autorizado' });
      const restaurant_id = urlObj.searchParams.get('restaurant_id');

      let query = `
        SELECT d.*, r.name as restaurant_name
        FROM dishes d
        JOIN restaurants r ON r.id = d.restaurant_id
      `;
      const params = [];

      if (restaurant_id) {
        query += ' WHERE d.restaurant_id = ?';
        params.push(restaurant_id);
      }
      query += ' ORDER BY d.id DESC';

      const dishes = db.prepare(query).all(...params);
      return sendJSON(res, 200, { dishes });
    }

    if (pathname === '/api/admin/dishes' && method === 'POST') {
      if (!verifyAdmin(req)) return sendJSON(res, 401, { error: 'No autorizado' });
      const body = await parseJSONBody(req);
      const now = new Date().toISOString();

      const resInsert = db.prepare(`
        INSERT INTO dishes (restaurant_id, category_id, name, description, price, image_url, is_available, is_featured, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        body.restaurant_id,
        body.category_id || null,
        body.name,
        body.description || '',
        Number(body.price) || 0,
        body.image_url || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400',
        body.is_available !== undefined ? (body.is_available ? 1 : 0) : 1,
        body.is_featured ? 1 : 0,
        now
      );

      return sendJSON(res, 201, { success: true, id: resInsert.lastInsertRowid });
    }

    if (pathname.startsWith('/api/admin/dishes/') && method === 'PUT') {
      if (!verifyAdmin(req)) return sendJSON(res, 401, { error: 'No autorizado' });
      const id = pathname.split('/').pop();
      const body = await parseJSONBody(req);

      db.prepare(`
        UPDATE dishes
        SET name = ?, description = ?, price = ?, image_url = ?,
            is_available = ?, is_featured = ?, restaurant_id = ?
        WHERE id = ?
      `).run(
        body.name,
        body.description,
        Number(body.price),
        body.image_url,
        body.is_available ? 1 : 0,
        body.is_featured ? 1 : 0,
        body.restaurant_id,
        id
      );

      return sendJSON(res, 200, { success: true });
    }

    if (pathname.startsWith('/api/admin/dishes/') && method === 'DELETE') {
      if (!verifyAdmin(req)) return sendJSON(res, 401, { error: 'No autorizado' });
      const id = pathname.split('/').pop();
      db.prepare('DELETE FROM dishes WHERE id = ?').run(id);
      return sendJSON(res, 200, { success: true });
    }

    // Admin Delivery Zones
    if (pathname === '/api/admin/zones' && method === 'GET') {
      if (!verifyAdmin(req)) return sendJSON(res, 401, { error: 'No autorizado' });
      const zones = db.prepare('SELECT * FROM delivery_zones ORDER BY display_order ASC, id ASC').all();
      return sendJSON(res, 200, { zones });
    }

    if (pathname === '/api/admin/zones' && method === 'POST') {
      if (!verifyAdmin(req)) return sendJSON(res, 401, { error: 'No autorizado' });
      const body = await parseJSONBody(req);

      const resInsert = db.prepare(`
        INSERT INTO delivery_zones (name, fee, description, keywords, is_active, display_order)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        body.name,
        Number(body.fee) || 20.00,
        body.description || '',
        body.keywords || '',
        body.is_active ? 1 : 0,
        Number(body.display_order) || 0
      );

      return sendJSON(res, 201, { success: true, id: resInsert.lastInsertRowid });
    }

    if (pathname.startsWith('/api/admin/zones/') && method === 'PUT') {
      if (!verifyAdmin(req)) return sendJSON(res, 401, { error: 'No autorizado' });
      const id = pathname.split('/').pop();
      const body = await parseJSONBody(req);

      db.prepare(`
        UPDATE delivery_zones
        SET name = ?, fee = ?, description = ?, keywords = ?, is_active = ?, display_order = ?
        WHERE id = ?
      `).run(
        body.name,
        Number(body.fee),
        body.description,
        body.keywords,
        body.is_active ? 1 : 0,
        Number(body.display_order),
        id
      );

      return sendJSON(res, 200, { success: true });
    }

    if (pathname.startsWith('/api/admin/zones/') && method === 'DELETE') {
      if (!verifyAdmin(req)) return sendJSON(res, 401, { error: 'No autorizado' });
      const id = pathname.split('/').pop();
      db.prepare('DELETE FROM delivery_zones WHERE id = ?').run(id);
      return sendJSON(res, 200, { success: true });
    }

    // Admin WhatsApp Numbers
    if (pathname === '/api/admin/whatsapp' && method === 'GET') {
      if (!verifyAdmin(req)) return sendJSON(res, 401, { error: 'No autorizado' });
      const numbers = db.prepare('SELECT * FROM whatsapp_numbers ORDER BY priority ASC, id ASC').all();
      return sendJSON(res, 200, { numbers });
    }

    if (pathname === '/api/admin/whatsapp' && method === 'POST') {
      if (!verifyAdmin(req)) return sendJSON(res, 401, { error: 'No autorizado' });
      const body = await parseJSONBody(req);
      const now = new Date().toISOString();

      const resInsert = db.prepare(`
        INSERT INTO whatsapp_numbers (label, phone, is_active, priority, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        body.label,
        body.phone,
        body.is_active ? 1 : 0,
        Number(body.priority) || 1,
        body.notes || '',
        now
      );

      return sendJSON(res, 201, { success: true, id: resInsert.lastInsertRowid });
    }

    if (pathname.startsWith('/api/admin/whatsapp/') && method === 'PUT') {
      if (!verifyAdmin(req)) return sendJSON(res, 401, { error: 'No autorizado' });
      const id = pathname.split('/').pop();
      const body = await parseJSONBody(req);

      db.prepare(`
        UPDATE whatsapp_numbers
        SET label = ?, phone = ?, is_active = ?, priority = ?, notes = ?
        WHERE id = ?
      `).run(
        body.label,
        body.phone,
        body.is_active ? 1 : 0,
        Number(body.priority),
        body.notes,
        id
      );

      return sendJSON(res, 200, { success: true });
    }

    if (pathname.startsWith('/api/admin/whatsapp/') && method === 'DELETE') {
      if (!verifyAdmin(req)) return sendJSON(res, 401, { error: 'No autorizado' });
      const id = pathname.split('/').pop();
      db.prepare('DELETE FROM whatsapp_numbers WHERE id = ?').run(id);
      return sendJSON(res, 200, { success: true });
    }

    // Admin Service Status & Schedule
    if (pathname === '/api/admin/service-status' && method === 'POST') {
      if (!verifyAdmin(req)) return sendJSON(res, 401, { error: 'No autorizado' });
      const body = await parseJSONBody(req);
      const now = new Date().toISOString();

      if (body.service_status !== undefined) {
        db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('service_status', ?, ?)").run(body.service_status, now);
      }
      if (body.service_status_message !== undefined) {
        db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('service_status_message', ?, ?)").run(body.service_status_message, now);
      }
      if (body.schedule_config !== undefined) {
        const schedStr = typeof body.schedule_config === 'string' ? body.schedule_config : JSON.stringify(body.schedule_config);
        db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('schedule_config', ?, ?)").run(schedStr, now);
      }

      return sendJSON(res, 200, { success: true, serviceStatus: checkServiceStatus() });
    }

    // Admin General Settings Update
    if (pathname === '/api/admin/settings' && method === 'POST') {
      if (!verifyAdmin(req)) return sendJSON(res, 401, { error: 'No autorizado' });
      const body = await parseJSONBody(req);
      const now = new Date().toISOString();

      const insertSetting = db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)");
      for (const [k, v] of Object.entries(body)) {
        insertSetting.run(k, String(v), now);
      }

      return sendJSON(res, 200, { success: true });
    }

    // Admin Clients list
    if (pathname === '/api/admin/clients' && method === 'GET') {
      if (!verifyAdmin(req)) return sendJSON(res, 401, { error: 'No autorizado' });

      const clients = db.prepare(`
        SELECT
          c.*,
          COUNT(o.id) as total_orders,
          COALESCE(SUM(o.total), 0) as total_spent,
          MAX(o.created_at) as last_order_date
        FROM clients c
        LEFT JOIN orders o ON o.client_id = c.id
        GROUP BY c.id
        ORDER BY total_orders DESC, c.id DESC
      `).all();

      return sendJSON(res, 200, { clients });
    }

    // Admin Storage & Maintenance
    if (pathname === '/api/admin/storage/status' && method === 'GET') {
      if (!verifyAdmin(req)) return sendJSON(res, 401, { error: 'No autorizado' });

      // DB size
      const dbPath = path.join(DATA_DIR, 'sanfer_eats.db');
      let dbSize = 0;
      if (fs.existsSync(dbPath)) {
        dbSize = fs.statSync(dbPath).size;
      }

      // Uploads folder size & image list
      let uploadsSize = 0;
      const uploadedFiles = [];
      if (fs.existsSync(UPLOADS_DIR)) {
        const files = fs.readdirSync(UPLOADS_DIR);
        for (const file of files) {
          const filePath = path.join(UPLOADS_DIR, file);
          const stat = fs.statSync(filePath);
          if (stat.isFile()) {
            uploadsSize += stat.size;
            uploadedFiles.push({
              name: file,
              path: `/uploads/${file}`,
              size: stat.size,
              createdAt: stat.birthtime
            });
          }
        }
      }

      // Check which images in uploads are currently referenced in DB
      const restImages = db.prepare("SELECT image_url FROM restaurants WHERE image_url LIKE '%/uploads/%'").all().map(r => r.image_url);
      const dishImages = db.prepare("SELECT image_url FROM dishes WHERE image_url LIKE '%/uploads/%'").all().map(d => d.image_url);
      const referencedSet = new Set([...restImages, ...dishImages]);

      const orphanFiles = uploadedFiles.filter(f => !referencedSet.has(f.path));

      // Orders counts
      const activeOrdersCount = db.prepare('SELECT COUNT(*) as c FROM orders WHERE is_archived = 0').get()?.c || 0;
      const archivedOrdersCount = db.prepare('SELECT COUNT(*) as c FROM orders WHERE is_archived = 1').get()?.c || 0;
      const summariesCount = db.prepare('SELECT COUNT(*) as c FROM historical_summaries').get()?.c || 0;

      // Available years in orders
      const orderYears = db.prepare("SELECT DISTINCT strftime('%Y', created_at) as year FROM orders ORDER BY year DESC").all().map(y => y.year);

      return sendJSON(res, 200, {
        dbSize,
        uploadsSize,
        totalStorage: dbSize + uploadsSize,
        activeOrdersCount,
        archivedOrdersCount,
        summariesCount,
        uploadedFilesCount: uploadedFiles.length,
        orphanFilesCount: orphanFiles.length,
        orphanFiles,
        orderYears
      });
    }

    // Step 1 & 2: Cleanup Preview (Safety requirement #37)
    if (pathname === '/api/admin/storage/cleanup-preview' && method === 'POST') {
      if (!verifyAdmin(req)) return sendJSON(res, 401, { error: 'No autorizado' });
      const body = await parseJSONBody(req);
      const { year, action } = body; // action: 'archive', 'delete_archived', 'clean_orphans'

      if (action === 'archive') {
        const count = db.prepare("SELECT COUNT(*) as c FROM orders WHERE strftime('%Y', created_at) = ? AND is_archived = 0").get(year)?.c || 0;
        const totalRev = db.prepare("SELECT SUM(total) as r FROM orders WHERE strftime('%Y', created_at) = ? AND is_archived = 0").get(year)?.r || 0;
        return sendJSON(res, 200, {
          action: 'archive',
          year,
          affectedOrders: count,
          affectedRevenue: totalRev,
          warningMessage: `Se archivarán ${count} pedidos del año ${year}. Se generará un resumen histórico protegido y los pedidos saldrán de la vista operativa diaria sin perder sus estadísticas.`
        });
      }

      if (action === 'delete_archived') {
        const count = db.prepare("SELECT COUNT(*) as c FROM orders WHERE strftime('%Y', created_at) = ? AND is_archived = 1").get(year)?.c || 0;
        return sendJSON(res, 200, {
          action: 'delete_archived',
          year,
          affectedOrders: count,
          warningMessage: `PELIGRO: Se eliminarán permanentemente ${count} pedidos del archivo del año ${year}. Las métricas históricas resumidas NO se perderán porque están protegidas en resúmenes estadísticos.`
        });
      }

      if (action === 'clean_orphans') {
        const restImages = db.prepare("SELECT image_url FROM restaurants WHERE image_url LIKE '%/uploads/%'").all().map(r => r.image_url);
        const dishImages = db.prepare("SELECT image_url FROM dishes WHERE image_url LIKE '%/uploads/%'").all().map(d => d.image_url);
        const referencedSet = new Set([...restImages, ...dishImages]);

        let orphanCount = 0;
        let orphanBytes = 0;
        if (fs.existsSync(UPLOADS_DIR)) {
          const files = fs.readdirSync(UPLOADS_DIR);
          for (const f of files) {
            if (!referencedSet.has(`/uploads/${f}`)) {
              orphanCount++;
              orphanBytes += fs.statSync(path.join(UPLOADS_DIR, f)).size;
            }
          }
        }

        return sendJSON(res, 200, {
          action: 'clean_orphans',
          orphanCount,
          orphanBytes,
          warningMessage: `Se eliminarán ${orphanCount} imágenes huérfanas (${(orphanBytes / 1024).toFixed(1)} KB) que ya no están vinculadas a ningún platillo ni restaurante activo.`
        });
      }

      return sendJSON(res, 400, { error: 'Acción no válida' });
    }

    // Step 5: Cleanup Execution with Explicit Confirmation
    if (pathname === '/api/admin/storage/cleanup-execute' && method === 'POST') {
      if (!verifyAdmin(req)) return sendJSON(res, 401, { error: 'No autorizado' });
      const body = await parseJSONBody(req);
      const { action, year, confirmToken } = body;

      if (confirmToken !== 'CONFIRMAR') {
        return sendJSON(res, 400, { error: 'Debe escribir exactamente "CONFIRMAR" para ejecutar esta operación.' });
      }

      const now = new Date().toISOString();

      if (action === 'archive') {
        // Compute summary to protect historical metrics
        const ordersOfYear = db.prepare("SELECT * FROM orders WHERE strftime('%Y', created_at) = ?").all(year);
        const total = ordersOfYear.length;
        const completed = ordersOfYear.filter(o => o.status === 'delivered').length;
        const cancelled = ordersOfYear.filter(o => o.status === 'cancelled').length;
        const revenue = ordersOfYear.reduce((sum, o) => sum + (o.status !== 'cancelled' ? o.total : 0), 0);
        const clients = new Set(ordersOfYear.map(o => o.client_id)).size;

        // Save historical summary
        db.prepare(`
          INSERT INTO historical_summaries (period_type, period_label, total_orders, completed_orders, cancelled_orders, total_revenue, total_clients, created_at)
          VALUES ('annual', ?, ?, ?, ?, ?, ?, ?)
        `).run(year, total, completed, cancelled, revenue, clients, now);

        // Mark orders as archived
        const resUpdate = db.prepare("UPDATE orders SET is_archived = 1, archived_at = ?, archived_year = ? WHERE strftime('%Y', created_at) = ?").run(now, Number(year), year);

        // Audit log
        db.prepare(`
          INSERT INTO admin_audit_logs (action_type, description, affected_count, performed_by, created_at)
          VALUES ('archive', ?, ?, 'Administrador', ?)
        `).run(`Archivado histórico de pedidos del año ${year}`, resUpdate.changes, now);

        return sendJSON(res, 200, {
          success: true,
          message: `Operación exitosa: Se archivaron ${resUpdate.changes} pedidos del año ${year} y se resguardó el resumen histórico.`
        });
      }

      if (action === 'delete_archived') {
        // Physical safe deletion of already-archived records
        const resDel = db.prepare("DELETE FROM orders WHERE strftime('%Y', created_at) = ? AND is_archived = 1").run(year);

        db.prepare(`
          INSERT INTO admin_audit_logs (action_type, description, affected_count, performed_by, created_at)
          VALUES ('delete', ?, ?, 'Administrador', ?)
        `).run(`Eliminación controlada de pedidos archivados del año ${year}`, resDel.changes, now);

        return sendJSON(res, 200, {
          success: true,
          message: `Operación exitosa: Se eliminaron ${resDel.changes} registros antiguos archivados. Las estadísticas históricas permanecen protegidas.`
        });
      }

      if (action === 'clean_orphans') {
        const restImages = db.prepare("SELECT image_url FROM restaurants WHERE image_url LIKE '%/uploads/%'").all().map(r => r.image_url);
        const dishImages = db.prepare("SELECT image_url FROM dishes WHERE image_url LIKE '%/uploads/%'").all().map(d => d.image_url);
        const referencedSet = new Set([...restImages, ...dishImages]);

        let removed = 0;
        if (fs.existsSync(UPLOADS_DIR)) {
          const files = fs.readdirSync(UPLOADS_DIR);
          for (const f of files) {
            const relPath = `/uploads/${f}`;
            if (!referencedSet.has(relPath)) {
              fs.unlinkSync(path.join(UPLOADS_DIR, f));
              db.prepare('DELETE FROM media_registry WHERE filename = ?').run(f);
              removed++;
            }
          }
        }

        db.prepare(`
          INSERT INTO admin_audit_logs (action_type, description, affected_count, performed_by, created_at)
          VALUES ('cleanup_images', ?, ?, 'Administrador', ?)
        `).run(`Limpieza de imágenes huérfanas sin referencia`, removed, now);

        return sendJSON(res, 200, {
          success: true,
          message: `Operación exitosa: Se eliminaron con seguridad ${removed} imágenes en desuso.`
        });
      }

      return sendJSON(res, 400, { error: 'Acción desconocida' });
    }

    // Admin Image Upload (Base64 dataURL support for cross-platform convenience)
    if (pathname === '/api/admin/upload-image' && method === 'POST') {
      if (!verifyAdmin(req)) return sendJSON(res, 401, { error: 'No autorizado' });
      const body = await parseJSONBody(req);
      const dataUrl = body.dataUrl || body.image;

      if (!dataUrl || !dataUrl.includes('base64,')) {
        return sendJSON(res, 400, { error: 'Formato de imagen inválido (se requiere base64 data URL)' });
      }

      const [header, base64Data] = dataUrl.split('base64,');
      const extMatch = header.match(/data:image\/([a-zA-Z0-9+]+);/);
      let ext = extMatch ? extMatch[1] : 'jpg';
      if (ext === 'jpeg') ext = 'jpg';

      const filename = `sf_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
      const filePath = path.join(UPLOADS_DIR, filename);
      const buffer = Buffer.from(base64Data, 'base64');

      fs.writeFileSync(filePath, buffer);

      // Register in media registry
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO media_registry (filename, filepath, file_size, uploaded_at)
        VALUES (?, ?, ?, ?)
      `).run(filename, `/uploads/${filename}`, buffer.length, now);

      return sendJSON(res, 200, {
        success: true,
        imageUrl: `/uploads/${filename}`,
        filename
      });
    }

    // Admin Audit Logs
    if (pathname === '/api/admin/audit-logs' && method === 'GET') {
      if (!verifyAdmin(req)) return sendJSON(res, 401, { error: 'No autorizado' });
      const logs = db.prepare('SELECT * FROM admin_audit_logs ORDER BY id DESC LIMIT 50').all();
      return sendJSON(res, 200, { logs });
    }

    // ----------------------------------------------------
    // STATIC FILE SERVING
    // ----------------------------------------------------

    // Handle /uploads/...
    if (pathname.startsWith('/uploads/')) {
      const filename = path.basename(pathname);
      const filePath = path.join(UPLOADS_DIR, filename);
      if (fs.existsSync(filePath)) {
        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        return fs.createReadStream(filePath).pipe(res);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('File not found');
      }
    }

    // Serve public directory
    let reqPath = pathname === '/' ? '/index.html' : pathname;
    let safePath = path.normalize(path.join(PUBLIC_DIR, reqPath));

    if (!safePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }

    if (!fs.existsSync(safePath) || fs.statSync(safePath).isDirectory()) {
      safePath = path.join(PUBLIC_DIR, 'index.html');
    }

    if (fs.existsSync(safePath)) {
      const ext = path.extname(safePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'text/html';
      res.writeHead(200, { 'Content-Type': contentType });
      return fs.createReadStream(safePath).pipe(res);
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');

  } catch (error) {
    console.error('Server error:', error);
    sendJSON(res, 500, { error: 'Internal Server Error', message: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`  SANFER EATS SERVER RUNNING`);
  console.log(`  Local URL: http://localhost:${PORT}`);
  console.log(`  Admin PIN: 1234 (Modificable en Ajustes)`);
  console.log(`===============================================`);
});
