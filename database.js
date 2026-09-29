// database.js - Relational Database Layer for SanFer Eats using built-in node:sqlite
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const DB_PATH = path.join(__dirname, 'data', 'sanfer_eats.db');

// Ensure data folder exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);

// Enable foreign keys and WAL mode for performance and concurrent safety
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

function initSchema() {
  db.exec(`
    -- Platform Settings
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT
    );

    -- Administrable WhatsApp Numbers
    CREATE TABLE IF NOT EXISTS whatsapp_numbers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL,
      phone TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      priority INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      created_at TEXT NOT NULL
    );

    -- Delivery Zones and Rates
    CREATE TABLE IF NOT EXISTS delivery_zones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      fee REAL NOT NULL,
      description TEXT,
      keywords TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      display_order INTEGER NOT NULL DEFAULT 0
    );

    -- Food Categories
    CREATE TABLE IF NOT EXISTS food_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      icon TEXT,
      image_url TEXT,
      display_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    -- Restaurants
    CREATE TABLE IF NOT EXISTS restaurants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category_name TEXT,
      image_url TEXT,
      banner_url TEXT,
      description TEXT,
      rating REAL DEFAULT 4.8,
      delivery_time TEXT DEFAULT '25 - 40 min',
      phone TEXT,
      address TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      is_open INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    -- Restaurant Dishes / Menu items
    CREATE TABLE IF NOT EXISTS dishes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      restaurant_id INTEGER NOT NULL,
      category_id INTEGER,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      image_url TEXT,
      is_available INTEGER NOT NULL DEFAULT 1,
      is_featured INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES food_categories(id) ON DELETE SET NULL
    );

    -- Super / Grocery Categories
    CREATE TABLE IF NOT EXISTS super_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      icon TEXT,
      suggested_items_json TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      display_order INTEGER NOT NULL DEFAULT 0
    );

    -- Super / Local Stores Reference
    CREATE TABLE IF NOT EXISTS super_stores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      image_url TEXT,
      description TEXT,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    -- Custom Identified Clients (Henry, HenryC, HCV, etc.)
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      identifier TEXT UNIQUE NOT NULL,
      full_name TEXT,
      phone TEXT,
      default_address TEXT,
      created_at TEXT NOT NULL,
      last_active_at TEXT NOT NULL
    );

    -- Orders Table (Independent, isolated, multi-restaurant support)
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT UNIQUE NOT NULL,
      client_id INTEGER,
      client_identifier TEXT NOT NULL,
      client_name TEXT,
      client_phone TEXT,
      service_type TEXT NOT NULL, -- 'food', 'shopping', 'courier'
      items_json TEXT NOT NULL, -- JSON array of grouped items
      notes TEXT,
      pickup_address TEXT,
      delivery_address TEXT NOT NULL,
      delivery_zone_id INTEGER,
      detected_zone_name TEXT,
      estimated_delivery_fee REAL NOT NULL DEFAULT 0,
      confirmed_delivery_fee REAL,
      fee_status TEXT NOT NULL DEFAULT 'estimated', -- 'estimated', 'confirmed'
      fee_confirmed_at TEXT,
      fee_confirmed_by TEXT,
      subtotal REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'new', -- 'new', 'reviewing', 'pending_confirmation', 'confirmed', 'preparing', 'on_the_way', 'delivered', 'cancelled'
      whatsapp_number_used TEXT,
      is_archived INTEGER NOT NULL DEFAULT 0,
      archived_at TEXT,
      archived_year INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
      FOREIGN KEY (delivery_zone_id) REFERENCES delivery_zones(id) ON DELETE SET NULL
    );

    -- Order Status History
    CREATE TABLE IF NOT EXISTS order_status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      old_status TEXT,
      new_status TEXT NOT NULL,
      notes TEXT,
      changed_by TEXT DEFAULT 'Sistema',
      created_at TEXT NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    -- Historical Summaries (Protects stats when archiving/purging old operational orders)
    CREATE TABLE IF NOT EXISTS historical_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period_type TEXT NOT NULL, -- 'annual', 'monthly'
      period_label TEXT NOT NULL, -- '2025', '2026-08'
      total_orders INTEGER NOT NULL DEFAULT 0,
      completed_orders INTEGER NOT NULL DEFAULT 0,
      cancelled_orders INTEGER NOT NULL DEFAULT 0,
      total_revenue REAL NOT NULL DEFAULT 0,
      total_clients INTEGER NOT NULL DEFAULT 0,
      top_restaurants_json TEXT,
      top_dishes_json TEXT,
      service_breakdown_json TEXT,
      created_at TEXT NOT NULL
    );

    -- Admin Audit Logs (6-step secure cleanup, archives, config changes)
    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action_type TEXT NOT NULL,
      description TEXT NOT NULL,
      affected_count INTEGER NOT NULL DEFAULT 0,
      details_json TEXT,
      performed_by TEXT NOT NULL DEFAULT 'Administrador',
      created_at TEXT NOT NULL
    );

    -- Uploaded Media Registry (to safely track orphan images)
    CREATE TABLE IF NOT EXISTS media_registry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT UNIQUE NOT NULL,
      filepath TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      uploaded_at TEXT NOT NULL
    );
  `);

  seedInitialData();
}

function seedInitialData() {
  const now = new Date().toISOString();

  // Seed default settings if empty
  const settingCheck = db.prepare('SELECT COUNT(*) as count FROM settings').get();
  if (settingCheck.count === 0) {
    const defaultSettings = [
      ['platform_name', 'SanFer Eats'],
      ['tagline', 'Tu ciudad, en un solo lugar'],
      ['hero_description', 'Comida, compras o entrega... ¡Nosotros te ayudamos!'],
      ['service_status', 'active'], // 'active', 'inactive', 'scheduled', 'temporary_close'
      ['service_status_message', 'En este momento SanFer Eats no está recibiendo solicitudes. Consulta nuestro próximo horario.'],
      ['admin_pin', '1234'],
      ['currency_symbol', '$ MXN'],
      ['contact_phone', '5219611234567'],
      ['schedule_config', JSON.stringify({
        monday: { enabled: true, open: '11:00', close: '22:00' },
        tuesday: { enabled: true, open: '11:00', close: '22:00' },
        wednesday: { enabled: true, open: '11:00', close: '22:00' },
        thursday: { enabled: true, open: '11:00', close: '22:00' },
        friday: { enabled: true, open: '11:00', close: '23:00' },
        saturday: { enabled: true, open: '10:00', close: '23:30' },
        sunday: { enabled: true, open: '10:00', close: '22:00' }
      })]
    ];

    const insertSetting = db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)');
    for (const [k, v] of defaultSettings) {
      insertSetting.run(k, v, now);
    }
  }

  // Seed WhatsApp Numbers
  const waCheck = db.prepare('SELECT COUNT(*) as count FROM whatsapp_numbers').get();
  if (waCheck.count === 0) {
    const insertWA = db.prepare('INSERT INTO whatsapp_numbers (label, phone, is_active, priority, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)');
    insertWA.run('Administrador Principal', '5219611234567', 1, 1, 'Línea de atención principal SanFer Eats', now);
    insertWA.run('Repartidor Central (Turno A)', '5219612345678', 1, 2, 'Línea de apoyo para repartos', now);
    insertWA.run('Repartidor Turno B (Respaldo)', '5219613456789', 0, 3, 'Línea secundaria de respaldo', now);
  }

  // Seed Delivery Zones
  const zoneCheck = db.prepare('SELECT COUNT(*) as count FROM delivery_zones').get();
  if (zoneCheck.count === 0) {
    const insertZone = db.prepare('INSERT INTO delivery_zones (name, fee, description, keywords, is_active, display_order) VALUES (?, ?, ?, ?, ?, ?)');
    insertZone.run('Centro', 20.00, 'Dentro de la zona centro', 'centro,parque,iglesia,mercado,zocalo,primera,segunda,tercera,cuarta,palacio,calle central,avenida central', 1, 1);
    insertZone.run('Orillas', 30.00, 'Zonas periféricas', 'orilla,periferico,norte,sur,este,oeste,fraccionamiento,fracc,lindavista,santa cruz,san juan,las palmas', 1, 2);
    insertZone.run('Colonias externas', 50.00, 'Colonias fuera del municipio (consultar disponibilidad)', 'externa,rancho,ejido,carretera,desviacion,km,san pedro,la cañada,monte alto,campo', 1, 3);
  }

  // Seed Food Categories
  const catCheck = db.prepare('SELECT COUNT(*) as count FROM food_categories').get();
  if (catCheck.count === 0) {
    const insertCat = db.prepare('INSERT INTO food_categories (name, icon, image_url, display_order, is_active) VALUES (?, ?, ?, ?, ?)');
    insertCat.run('Tacos', '🌮', 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=500&auto=format&fit=crop&q=80', 1, 1);
    insertCat.run('Pizza', '🍕', 'https://images.unsplash.com/photo-1534308983496-4fabb1a015ee?w=500&auto=format&fit=crop&q=80', 2, 1);
    insertCat.run('Hamburguesas', '🍔', 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500&auto=format&fit=crop&q=80', 3, 1);
    insertCat.run('Antojitos', '🥟', 'https://images.unsplash.com/photo-1615870216519-2f9fa575fa5c?w=500&auto=format&fit=crop&q=80', 4, 1);
    insertCat.run('Pollo', '🍗', 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=500&auto=format&fit=crop&q=80', 5, 1);
    insertCat.run('Bebidas', '🥤', 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=500&auto=format&fit=crop&q=80', 6, 1);
    insertCat.run('Postres', '🍰', 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=500&auto=format&fit=crop&q=80', 7, 1);
    insertCat.run('Sushi', '🍣', 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=500&auto=format&fit=crop&q=80', 8, 1);
  }

  // Seed Restaurants
  const restCheck = db.prepare('SELECT COUNT(*) as count FROM restaurants').get();
  if (restCheck.count === 0) {
    const insertRest = db.prepare(`
      INSERT INTO restaurants (name, category_name, image_url, description, rating, delivery_time, phone, address, is_active, is_open, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const r1 = insertRest.run(
      'Taquería El Güero',
      'Tacos • Comida mexicana',
      'https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?w=600&auto=format&fit=crop&q=80',
      'Los mejores tacos al pastor, suadero, tripa y cortes con tortillas hechas a mano y salsas tradicionales.',
      4.8,
      '20 - 35 min',
      '9611112233',
      'Av. Central Hidalgo #45, Centro',
      1,
      1,
      now
    );

    const r2 = insertRest.run(
      'Pizza Lovers',
      'Pizzas • Italiana',
      'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&auto=format&fit=crop&q=80',
      'Masa artesanal horneada a la piedra, quesos selectos e ingredientes frescos italianos.',
      4.6,
      '30 - 45 min',
      '9612223344',
      'Calle Morelos #12, Barrio San Juan',
      1,
      1,
      now
    );

    const r3 = insertRest.run(
      'Sushi Express',
      'Sushi • Japonesa',
      'https://images.unsplash.com/photo-1611143669185-af224c5e3252?w=600&auto=format&fit=crop&q=80',
      'Rollos clásicos, empanizados, kushiages y bowls frescos preparados al momento.',
      4.7,
      '30 - 50 min',
      '9613334455',
      'Blvd. Belisario Domínguez #108',
      1,
      1,
      now
    );

    const r4 = insertRest.run(
      'La Hamburguesa Feliz',
      'Hamburguesas • Snacks',
      'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=600&auto=format&fit=crop&q=80',
      'Carne 100% de res a la parrilla, tocino crujiente, papas a la francesa y aros de cebolla.',
      4.5,
      '20 - 35 min',
      '9614445566',
      'Calle Juárez #89, Centro',
      1,
      1,
      now
    );

    const r5 = insertRest.run(
      'Antojitos Doña Mary',
      'Antojitos • Cocina regional',
      'https://images.unsplash.com/photo-1615870216519-2f9fa575fa5c?w=600&auto=format&fit=crop&q=80',
      'Gorditas, quesadillas fritas, sopes, empanadas y tamalitos con el sazón de hogar.',
      4.9,
      '15 - 30 min',
      '9615556677',
      'Barrio El Calvario #14',
      1,
      1,
      now
    );

    // Seed Dishes for each restaurant
    const insertDish = db.prepare(`
      INSERT INTO dishes (restaurant_id, category_id, name, description, price, image_url, is_available, is_featured, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Dishes for Taqueria El Guero (id: 1)
    insertDish.run(Number(r1.lastInsertRowid), 1, 'Orden de Tacos al Pastor (5 pzas)', 'Con piña asada, cebollita, cilantro y limón sobre doble tortilla.', 75.00, 'https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?w=400&auto=format&fit=crop&q=80', 1, 1, now);
    insertDish.run(Number(r1.lastInsertRowid), 1, 'Gringa Especial de Pastor con Queso', 'Tortilla de harina grande doradita con carne al pastor y queso fundido.', 65.00, 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=400&auto=format&fit=crop&q=80', 1, 1, now);
    insertDish.run(Number(r1.lastInsertRowid), 1, 'Taco de Arrachera Marinada', 'Corte suave de arrachera con cebollitas cambray y chiles toreados.', 35.00, 'https://images.unsplash.com/photo-1599974579688-8dbdd335c77f?w=400&auto=format&fit=crop&q=80', 1, 0, now);
    insertDish.run(Number(r1.lastInsertRowid), 6, 'Agua Fresca de Horchata 1L', 'Receta artesanal con toque de canela y vainilla.', 35.00, 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=400&auto=format&fit=crop&q=80', 1, 0, now);

    // Dishes for Pizza Lovers (id: 2)
    insertDish.run(Number(r2.lastInsertRowid), 2, 'Pizza Pepperoni Suprema Grande', 'Abundante pepperoni americano con extra queso mozzarella.', 179.00, 'https://images.unsplash.com/photo-1534308983496-4fabb1a015ee?w=400&auto=format&fit=crop&q=80', 1, 1, now);
    insertDish.run(Number(r2.lastInsertRowid), 2, 'Pizza Hawaiana Clásica Mediana', 'Jamón de pavo con cubos dulces de piña caramelizada.', 149.00, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&auto=format&fit=crop&q=80', 1, 0, now);
    insertDish.run(Number(r2.lastInsertRowid), 2, 'Pizza Mexicana Especial Grande', 'Chorizo, jalapeños, cebolla morada y carne molida.', 189.00, 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400&auto=format&fit=crop&q=80', 1, 1, now);
    insertDish.run(Number(r2.lastInsertRowid), 6, 'Refresco Coca-Cola 600ml', 'Bien fría.', 25.00, 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=400&auto=format&fit=crop&q=80', 1, 0, now);

    // Dishes for Sushi Express (id: 3)
    insertDish.run(Number(r3.lastInsertRowid), 8, 'Rollo Mar y Tierra Empanizado', 'Res, camarón, queso crema y aguacate, crujiente por fuera con salsa tampico.', 125.00, 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=400&auto=format&fit=crop&q=80', 1, 1, now);
    insertDish.run(Number(r3.lastInsertRowid), 8, 'California Roll Clásico', 'Cangrejo, pepino, queso philadelphia y ajonjolí tostado.', 95.00, 'https://images.unsplash.com/photo-1611143669185-af224c5e3252?w=400&auto=format&fit=crop&q=80', 1, 0, now);
    insertDish.run(Number(r3.lastInsertRowid), 8, 'Kushiages de Queso Manchego (3 pzas)', 'Brochetas empanizadas con aderezo chipotle dulce.', 60.00, 'https://images.unsplash.com/photo-1617093727343-374698b1b08d?w=400&auto=format&fit=crop&q=80', 1, 0, now);

    // Dishes for La Hamburguesa Feliz (id: 4)
    insertDish.run(Number(r4.lastInsertRowid), 3, 'Hamburguesa Doble Carne con Tocino', 'Doble porción de carne jugosa, queso cheddar derretido, tocino y aderezo especial.', 110.00, 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&auto=format&fit=crop&q=80', 1, 1, now);
    insertDish.run(Number(r4.lastInsertRowid), 3, 'Papas a la Francesa Sazonadas', 'Crocantes por fuera y suaves por dentro con paprika y queso cheddar.', 50.00, 'https://images.unsplash.com/photo-1576107232684-1279f3908594?w=400&auto=format&fit=crop&q=80', 1, 0, now);
    insertDish.run(Number(r4.lastInsertRowid), 3, 'Aros de Cebolla Crujientes', 'Acompañados de dip ranch casero.', 55.00, 'https://images.unsplash.com/photo-1639024471287-035186b55d1c?w=400&auto=format&fit=crop&q=80', 1, 0, now);

    // Dishes for Antojitos Dona Mary (id: 5)
    insertDish.run(Number(r5.lastInsertRowid), 4, 'Quesadillas Fritas de Tinga (3 pzas)', 'Con lechuga fresca, crema de rancho y queso espolvoreado.', 60.00, 'https://images.unsplash.com/photo-1615870216519-2f9fa575fa5c?w=400&auto=format&fit=crop&q=80', 1, 1, now);
    insertDish.run(Number(r5.lastInsertRowid), 4, 'Sopes Surtidos con Cecina (3 pzas)', 'Base de maíz con frijoles refritos, cecina asada, salsa verde y queso.', 70.00, 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=400&auto=format&fit=crop&q=80', 1, 1, now);
    insertDish.run(Number(r5.lastInsertRowid), 7, 'Rebanada de Pastel de 3 Leches', 'Pastel casero húmedo con canela y fresa.', 45.00, 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=400&auto=format&fit=crop&q=80', 1, 0, now);
  }

  // Seed Super / Grocery Categories
  const superCatCheck = db.prepare('SELECT COUNT(*) as count FROM super_categories').get();
  if (superCatCheck.count === 0) {
    const insertSuperCat = db.prepare(`
      INSERT INTO super_categories (name, icon, suggested_items_json, is_active, display_order)
      VALUES (?, ?, ?, ?, ?)
    `);

    insertSuperCat.run('Abarrotes y alimentos', '🥫', JSON.stringify(['Aceite vegetal 1L', 'Arroz 1kg', 'Frijol negro 1kg', 'Azúcar estándar 1kg', 'Sal de mesa', 'Café soluble', 'Sopa de pasta', 'Atún en agua/aceite']), 1, 1);
    insertSuperCat.run('Bebidas', '🥤', JSON.stringify(['Agua purificada garrafón/botella', 'Refresco Coca-Cola 2L', 'Jugo de naranja 1L', 'Leche entera', 'Suero rehidratante', 'Cerveza clara/oscura']), 1, 2);
    insertSuperCat.run('Lácteos y refrigerados', '🧀', JSON.stringify(['Huevo blanco cono/docena', 'Queso panela', 'Queso manchego/oaxaca', 'Yogurt natural', 'Crema entera', 'Mantequilla con sal', 'Jamón de pavo']), 1, 3);
    insertSuperCat.run('Limpieza del hogar', '🧹', JSON.stringify(['Cloro blanqueador', 'Detergente en polvo/líquido', 'Suavizante de telas', 'Limpiador multiusos Fabuloso', 'Jabón para trastes Axion', 'Bolsas para basura']), 1, 4);
    insertSuperCat.run('Aseo e higiene personal', '🧼', JSON.stringify(['Papel higiénico paquete', 'Jabón de tocador', 'Shampoo', 'Pasta dental Colgate', 'Cepillo dental', 'Desodorante', 'Toallas femeninas']), 1, 5);
    insertSuperCat.run('Frutas y verduras', '🍎', JSON.stringify(['Jitomate 1kg', 'Cebolla blanca 1kg', 'Limón con semilla 1kg', 'Papa blanca', 'Aguacate hass', 'Plátano roatán', 'Manzana roja']), 1, 6);
    insertSuperCat.run('Carnes y alimentos frescos', '🥩', JSON.stringify(['Pechuga de pollo fresca', 'Bistec de res para asar', 'Carne molida especial', 'Milanesa de cerdo', 'Chorizo casero']), 1, 7);
    insertSuperCat.run('Cuidado del hogar y artículos básicos', '🔋', JSON.stringify(['Pilas AA / AAA', 'Cerillos / Encendedor', 'Foco ahorrador LED', 'Cinta canela / Diurex', 'Servilletas de papel']), 1, 8);
    insertSuperCat.run('Mascotas', '🐾', JSON.stringify(['Croquetas perro adulto 2kg', 'Croquetas cachorro', 'Comida para gato Whiskas/Purina', 'Sobres de alimento húmedo', 'Arena sanitaria para gato']), 1, 9);
    insertSuperCat.run('Otros', '📝', JSON.stringify(['Cualquier producto que no aparezca en la lista anterior']), 1, 10);
  }

  // Seed Super Stores
  const superStoreCheck = db.prepare('SELECT COUNT(*) as count FROM super_stores').get();
  if (superStoreCheck.count === 0) {
    const insertStore = db.prepare(`
      INSERT INTO super_stores (name, image_url, description, is_active)
      VALUES (?, ?, ?, ?)
    `);

    insertStore.run('Súper San Fernando', 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=500&auto=format&fit=crop&q=80', 'Tienda de autoservicio completa con abarrotes, lácteos y carnes.', 1);
    insertStore.run('Abarrotes La Guadalupana', 'https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=500&auto=format&fit=crop&q=80', 'Abarrotes locales con precios económicos y atención rápida.', 1);
    insertStore.run('Frutería & Verdulería Don Pepe', 'https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=500&auto=format&fit=crop&q=80', 'Frutas y verduras frescas del día seleccionadas.', 1);
    insertStore.run('Farmacia y Autoservicio San Juan', 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=500&auto=format&fit=crop&q=80', 'Medicamentos básicos, pañales, sueros y artículos de higiene.', 1);
    insertStore.run('Cualquier establecimiento local a mi elección', 'https://images.unsplash.com/photo-1534723452862-4c874018d66d?w=500&auto=format&fit=crop&q=80', 'Indica el nombre del lugar en las observaciones y nosotros vamos por ello.', 1);
  }

  // Seed sample clients
  const clientCheck = db.prepare('SELECT COUNT(*) as count FROM clients').get();
  if (clientCheck.count === 0) {
    const insertClient = db.prepare(`
      INSERT INTO clients (identifier, full_name, phone, default_address, created_at, last_active_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    insertClient.run('HenryC', 'Henry Castillo', '9611239988', 'Calle Hidalgo #24, Col. Centro', now, now);
    insertClient.run('MarianaL', 'Mariana López', '9619876543', 'Av. Las Palmas #50, Fracc. Lindavista', now, now);
    insertClient.run('CarlosR', 'Carlos Ramírez', '9615551234', 'Carretera Vieja Km 2, Ejido San Pedro', now, now);
  }

  // Seed initial sample orders for realistic dashboard & testing
  const orderCheck = db.prepare('SELECT COUNT(*) as count FROM orders').get();
  if (orderCheck.count === 0) {
    const insertOrder = db.prepare(`
      INSERT INTO orders (
        order_number, client_id, client_identifier, client_name, client_phone,
        service_type, items_json, notes, pickup_address, delivery_address,
        delivery_zone_id, detected_zone_name, estimated_delivery_fee, confirmed_delivery_fee,
        fee_status, fee_confirmed_at, fee_confirmed_by, subtotal, total, status,
        whatsapp_number_used, is_archived, archived_year, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertHistory = db.prepare(`
      INSERT INTO order_status_history (order_id, old_status, new_status, notes, changed_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    // Sample Order 1: Food (Multi-restaurant: Taqueria + Pizza!)
    const o1Items = [
      {
        restaurant_id: 1,
        restaurant_name: 'Taquería El Güero',
        items: [
          { dish_id: 1, name: 'Orden de Tacos al Pastor (5 pzas)', price: 75.00, quantity: 2, subtotal: 150.00 }
        ]
      },
      {
        restaurant_id: 2,
        restaurant_name: 'Pizza Lovers',
        items: [
          { dish_id: 5, name: 'Pizza Pepperoni Suprema Grande', price: 179.00, quantity: 1, subtotal: 179.00 }
        ]
      }
    ];

    const ord1 = insertOrder.run(
      '#SF-1048',
      1,
      'HenryC',
      'Henry Castillo',
      '9611239988',
      'food',
      JSON.stringify(o1Items),
      'Salsa verde extra para los tacos por favor',
      '',
      'Calle Hidalgo #24, Col. Centro',
      1,
      'Centro',
      20.00,
      20.00,
      'confirmed',
      now,
      'Administrador',
      329.00,
      349.00,
      'delivered',
      '5219611234567',
      0,
      2026,
      new Date(Date.now() - 3600000 * 5).toISOString(),
      now
    );

    insertHistory.run(Number(ord1.lastInsertRowid), 'new', 'confirmed', 'Tarifa confirmada y pedido enviado a cocina', 'Administrador', now);
    insertHistory.run(Number(ord1.lastInsertRowid), 'confirmed', 'delivered', 'Entregado con éxito al cliente', 'Repartidor', now);

    // Sample Order 2: Shopping / Super
    const o2Items = [
      {
        store_name: 'Súper San Fernando',
        items_text: '1 Cono de huevo blanco (30 pzas)\n1 Aceite 1L 1-2-3\n1 Leche Lala entera 1L\n1 Pan blanco Bimbo grande',
        custom_items: ['Huevo blanco cono', 'Aceite vegetal 1L', 'Leche entera', 'Pan Bimbo']
      }
    ];

    const ord2 = insertOrder.run(
      '#SF-1049',
      2,
      'MarianaL',
      'Mariana López',
      '9619876543',
      'shopping',
      JSON.stringify(o2Items),
      'Si no hay aceite 1-2-3 puede ser Capullo o Nutrioli',
      'Súper San Fernando',
      'Av. Las Palmas #50, Fracc. Lindavista',
      2,
      'Orillas',
      30.00,
      35.00,
      'confirmed',
      now,
      'Administrador',
      195.00,
      230.00,
      'on_the_way',
      '5219611234567',
      0,
      2026,
      new Date(Date.now() - 3600000 * 2).toISOString(),
      now
    );

    insertHistory.run(Number(ord2.lastInsertRowid), 'new', 'confirmed', 'Tarifa ajustada a $35 por distancia en Fracc. Lindavista', 'Administrador', now);
    insertHistory.run(Number(ord2.lastInsertRowid), 'confirmed', 'on_the_way', 'Compras concluidas, repartidor en camino', 'Repartidor Central', now);

    // Sample Order 3: Courier / Entrega
    const o3Items = [
      {
        service: 'Entrega y Mandado Local',
        description: 'Entrega de sobre con documentos notariales importantes y llaves de repuesto',
        pickup_address: 'Notaría Pública No. 4, Calle Central Norte #8',
        delivery_address: 'Carretera Vieja Km 2, Ejido San Pedro (frente a la gasolinera)',
        recipient_name: 'Carlos Ramírez',
        recipient_phone: '9615551234'
      }
    ];

    const ord3 = insertOrder.run(
      '#SF-1050',
      3,
      'CarlosR',
      'Carlos Ramírez',
      '9615551234',
      'courier',
      JSON.stringify(o3Items),
      'Favor de llamar antes de llegar para salir a la carretera.',
      'Notaría Pública No. 4, Calle Central Norte #8',
      'Carretera Vieja Km 2, Ejido San Pedro (frente a la gasolinera)',
      3,
      'Colonias externas',
      50.00,
      null,
      'estimated',
      null,
      null,
      0.00,
      50.00,
      'new',
      '5219611234567',
      0,
      2026,
      new Date(Date.now() - 1800000).toISOString(),
      now
    );

    insertHistory.run(Number(ord3.lastInsertRowid), 'none', 'new', 'Solicitud recibida por WhatsApp', 'Sistema', now);
  }
}

initSchema();

module.exports = {
  db,
  initSchema
};
