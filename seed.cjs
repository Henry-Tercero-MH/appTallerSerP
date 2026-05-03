/**
 * Seed completo: limpia datos transaccionales, resetea IDs y carga datos dummy
 * que cubren todo el flujo: caja → ventas → cuentas x cobrar → compras → gastos → bitácora.
 * Ejecutar con: node seed.cjs
 */
const Database = require('/tmp/seed_tmp/node_modules/better-sqlite3')

const DB_PATH = '/home/henry-tercero/.config/taller-pos-electron/taller_pos.sqlite'
const db = new Database(DB_PATH)

db.pragma('foreign_keys = OFF')
db.pragma('journal_mode = WAL')

// ─── helpers ─────────────────────────────────────────────────────────────────
function localTs(daysAgo = 0, hour = 10, minute = 0) {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(hour, minute, 0, 0)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`
}
function localDate(daysAgo = 0) { return localTs(daysAgo, 0, 0).slice(0, 10) }

// ─── 1. LIMPIAR ───────────────────────────────────────────────────────────────
console.log('\n=== LIMPIANDO DATOS ===')
const cleanUp = db.transaction(() => {
  const tables = [
    'audit_log',
    'stock_movements',
    'return_items','returns',
    'quote_items','quotes',
    'purchase_items','purchase_orders',
    'cash_movements','cash_sessions',
    'receivable_payments','receivables',
    'expenses',
    'sale_voids','sale_items','sales',
    'products',
  ]
  for (const t of tables) {
    try { console.log(`  DELETE ${t}: ${db.prepare(`DELETE FROM ${t}`).run().changes} filas`) }
    catch (e) { console.log(`  SKIP ${t}: ${e.message}`) }
  }
  db.prepare('DELETE FROM customers WHERE id != 1').run()
  console.log('  DELETE customers (no CF)')
})
cleanUp()

// Resetear auto-increment de tablas transaccionales
const seqTables = [
  'products','sales','sale_items','sale_voids',
  'customers','cash_sessions','cash_movements',
  'purchase_orders','purchase_items',
  'receivables','receivable_payments',
  'quotes','quote_items',
  'expenses','stock_movements',
  'returns','return_items','audit_log',
]
for (const t of seqTables) {
  try { db.prepare(`UPDATE sqlite_sequence SET seq = 0 WHERE name = ?`).run(t) } catch {}
}
console.log('  IDs reseteados a 0')

// ─── 2. PROVEEDORES ───────────────────────────────────────────────────────────
// Reutilizar el existente id=1 y agregar uno más
console.log('\n=== PROVEEDORES ===')
db.prepare(`UPDATE suppliers SET name='Distribuidora Hidráulica GT', contact_name='Carlos Morales',
  phone='2233-4455', email='ventas@dhgt.com' WHERE id=1`).run()
const supId1 = 1
const supId2 = db.prepare(`
  INSERT INTO suppliers (name, contact_name, phone, email, active, created_at, updated_at)
  VALUES ('Mangueras y Accesorios S.A.','Ana López','5566-7788','ana@myagt.com',1,
    strftime('%Y-%m-%d %H:%M:%S','now','localtime'),
    strftime('%Y-%m-%d %H:%M:%S','now','localtime'))
`).run().lastInsertRowid
console.log(`  Proveedor 1: Distribuidora Hidráulica GT (id=${supId1})`)
console.log(`  Proveedor 2: Mangueras y Accesorios S.A. (id=${supId2})`)

// ─── 3. PRODUCTOS ─────────────────────────────────────────────────────────────
console.log('\n=== PRODUCTOS ===')
const insProduct = db.prepare(`
  INSERT INTO products (code, name, price, cost, stock, category, is_active)
  VALUES (@code, @name, @price, @cost, @stock, @category, 1)
`)
const products = [
  { code:'MAN-001', name:'Manguera Hidráulica 1/4"',    price:85.00,  cost:45.00, stock:50,  category:'Mangueras'   },
  { code:'MAN-002', name:'Manguera Hidráulica 1/2"',    price:120.00, cost:65.00, stock:40,  category:'Mangueras'   },
  { code:'MAN-003', name:'Manguera Hidráulica 3/4"',    price:165.00, cost:90.00, stock:30,  category:'Mangueras'   },
  { code:'CON-001', name:'Conector Recto 1/4" NPT',     price:25.00,  cost:12.00, stock:200, category:'Conectores'  },
  { code:'CON-002', name:'Conector Codo 90° 1/2"',      price:38.00,  cost:18.00, stock:150, category:'Conectores'  },
  { code:'SER-001', name:'Servicio Instalación Básica', price:150.00, cost:0,     stock:999, category:'Servicios'   },
  { code:'SER-002', name:'Servicio Prensado Manguera',  price:45.00,  cost:0,     stock:999, category:'Servicios'   },
  { code:'ACC-001', name:'Aceite Hidráulico 1L',        price:95.00,  cost:55.00, stock:25,  category:'Accesorios'  },
]
const pid = {}
for (const p of products) {
  pid[p.code] = Number(insProduct.run(p).lastInsertRowid)
  console.log(`  + ${p.code} (id=${pid[p.code]}) stock=${p.stock}`)
}

// ─── 4. CLIENTES ──────────────────────────────────────────────────────────────
console.log('\n=== CLIENTES ===')
const insCustomer = db.prepare(`
  INSERT INTO customers (nit, name, email, phone, address, active, created_at, updated_at)
  VALUES (@nit, @name, @email, @phone, @address, 1,
    strftime('%Y-%m-%d %H:%M:%S','now','localtime'),
    strftime('%Y-%m-%d %H:%M:%S','now','localtime'))
`)
const customersData = [
  { nit:'12345678', name:'Constructora Pérez S.A.',  email:'compras@perez.gt',  phone:'2222-1111', address:'Zona 10' },
  { nit:'87654321', name:'Talleres López',            email:'lopez@taller.gt',   phone:'5555-9999', address:'Zona 5'  },
  { nit:'11223344', name:'Mecánica Central S.A.',    email:'info@mecanica.gt',  phone:'7777-4444', address:'Mixco'   },
  { nit:'55667788', name:'Distribuidora Norte',      email:'ventas@dnorte.gt',  phone:'3333-8888', address:'Zona 18' },
]
const cid = {}
for (const c of customersData) {
  cid[c.nit] = Number(insCustomer.run(c).lastInsertRowid)
  console.log(`  + ${c.name} (id=${cid[c.nit]})`)
}

// ─── 5. USUARIOS ──────────────────────────────────────────────────────────────
const adminUser   = db.prepare(`SELECT id, full_name FROM users WHERE role='admin' LIMIT 1`).get()
const cashierUser = db.prepare(`SELECT id, full_name FROM users WHERE role='cashier' LIMIT 1`).get()
const ADMIN_ID    = adminUser?.id       ?? 1
const ADMIN_NAME  = adminUser?.full_name  ?? 'Administrador'
const CASH_ID     = cashierUser?.id      ?? ADMIN_ID
const CASH_NAME   = cashierUser?.full_name ?? ADMIN_NAME
console.log(`\n=== USUARIOS: admin="${ADMIN_NAME}" (${ADMIN_ID}), cajero="${CASH_NAME}" (${CASH_ID}) ===`)

// ─── 6. COMPRAS (antes de ventas para tener stock actualizado) ─────────────────
console.log('\n=== COMPRAS ===')
const insOrder = db.prepare(`
  INSERT INTO purchase_orders (supplier_id, status, notes, created_by, created_by_name, created_at, received_at, total_cost)
  VALUES (@supplier_id, @status, @notes, @created_by, @created_by_name, @created_at, @received_at, @total_cost)
`)
const insOrderItem = db.prepare(`
  INSERT INTO purchase_items (order_id, product_id, product_name, product_code, qty_ordered, qty_received, unit_cost)
  VALUES (@order_id, @product_id, @product_name, @product_code, @qty_ordered, @qty_received, @unit_cost)
`)
const insMove = db.prepare(`
  INSERT INTO stock_movements
    (product_id, product_name, type, qty, qty_before, qty_after, reference_type, reference_id, notes, created_by, created_by_name, created_at)
  VALUES
    (@product_id, @product_name, @type, @qty, @qty_before, @qty_after, @reference_type, @reference_id, @notes, @created_by, @created_by_name, @created_at)
`)
const updStock = db.prepare(`UPDATE products SET stock = stock + ? WHERE id = ?`)

// Compra 1 — hace 10 días, recibida
const po1Items = [
  { code:'MAN-001', qty: 30, cost: 45.00 },
  { code:'MAN-002', qty: 20, cost: 65.00 },
  { code:'CON-001', qty:100, cost: 12.00 },
]
const po1Total = po1Items.reduce((s,i) => s + i.qty * i.cost, 0)
const po1Id = Number(insOrder.run({
  supplier_id: supId1, status: 'received', notes: 'Reposición de mangueras y conectores',
  created_by: ADMIN_ID, created_by_name: ADMIN_NAME,
  created_at: localTs(10, 9), received_at: localTs(8, 14), total_cost: po1Total,
}).lastInsertRowid)
for (const i of po1Items) {
  insOrderItem.run({ order_id: po1Id, product_id: pid[i.code], product_name: products.find(p=>p.code===i.code).name,
    product_code: i.code, qty_ordered: i.qty, qty_received: i.qty, unit_cost: i.cost })
  const prod = db.prepare('SELECT stock, name FROM products WHERE id=?').get(pid[i.code])
  const before = prod.stock
  updStock.run(i.qty, pid[i.code])
  insMove.run({ product_id: pid[i.code], product_name: prod.name, type:'purchase',
    qty: i.qty, qty_before: before, qty_after: before + i.qty,
    reference_type:'purchase', reference_id: po1Id,
    notes: `Recepción OC #${po1Id}`, created_by: ADMIN_ID, created_by_name: ADMIN_NAME, type:'purchase',
    created_at: localTs(8,14) })
}
console.log(`  + OC #${po1Id} ${localDate(10)} → recibida ${localDate(8)} total Q${po1Total}`)

// Compra 2 — hace 3 días, enviada (pendiente de recibir)
const po2Items = [
  { code:'MAN-003', qty: 15, cost: 90.00 },
  { code:'ACC-001', qty: 20, cost: 55.00 },
  { code:'CON-002', qty: 50, cost: 18.00 },
]
const po2Total = po2Items.reduce((s,i) => s + i.qty * i.cost, 0)
const po2Id = Number(insOrder.run({
  supplier_id: supId2, status: 'sent', notes: 'Pedido mensual accesorios',
  created_by: ADMIN_ID, created_by_name: ADMIN_NAME,
  created_at: localTs(3, 10), received_at: null, total_cost: po2Total,
}).lastInsertRowid)
for (const i of po2Items) {
  insOrderItem.run({ order_id: po2Id, product_id: pid[i.code], product_name: products.find(p=>p.code===i.code).name,
    product_code: i.code, qty_ordered: i.qty, qty_received: 0, unit_cost: i.cost })
}
console.log(`  + OC #${po2Id} ${localDate(3)} → enviada, pendiente recepción total Q${po2Total}`)

// ─── 7. CAJAS POR DÍA + VENTAS ────────────────────────────────────────────────
console.log('\n=== CAJAS Y VENTAS ===')

const insCashSession = db.prepare(`
  INSERT INTO cash_sessions
    (opened_by, opened_by_name, opened_at, opening_amount,
     closed_by, closed_by_name, closed_at, closing_amount, expected_amount, difference, notes, status)
  VALUES
    (@opened_by, @opened_by_name, @opened_at, @opening_amount,
     @closed_by, @closed_by_name, @closed_at, @closing_amount, @expected_amount, @difference, @notes, @status)
`)
const insSale = db.prepare(`
  INSERT INTO sales (
    date, total, subtotal, tax_rate_applied, tax_amount, currency_code,
    customer_id, customer_name_snapshot, customer_nit_snapshot,
    payment_method, client_type, discount_type, discount_value, discount_amount,
    created_by_user_id, created_by_user_snapshot, status
  ) VALUES (
    @date, @total, @subtotal, 0, 0, 'GTQ',
    @customer_id, @customer_name_snapshot, @customer_nit_snapshot,
    @payment_method, @client_type, 'none', 0, 0,
    @created_by_user_id, @created_by_user_snapshot, 'active'
  )
`)
const insSaleItem = db.prepare(`
  INSERT INTO sale_items (sale_id, product_id, qty, price) VALUES (?, ?, ?, ?)
`)
const updStockDown = db.prepare(`UPDATE products SET stock = stock - ? WHERE id = ?`)

const insAudit = db.prepare(`
  INSERT INTO audit_log (action, entity, entity_id, description, payload_json, user_id, user_name, created_at)
  VALUES (@action, @entity, @entity_id, @description, @payload_json, @user_id, @user_name, @created_at)
`)

// Definición de ventas por día
// [ daysAgo, hour, items[], paymentMethod, clientType, customerId, customerName, customerNit, userId, userName ]
const salesPlan = [
  // Día -6
  [6, 9,  [{c:'MAN-001',q:2},{c:'CON-001',q:4}], 'cash',     'cf',         1,          'Consumidor Final',     'CF',       CASH_ID,  CASH_NAME],
  [6, 14, [{c:'SER-001',q:1}],                    'cash',     'registered', cid['12345678'], 'Constructora Pérez S.A.','12345678',ADMIN_ID, ADMIN_NAME],
  // Día -5
  [5, 10, [{c:'MAN-002',q:1},{c:'SER-002',q:2}], 'card',     'cf',         1,          'Consumidor Final',     'CF',       CASH_ID,  CASH_NAME],
  [5, 16, [{c:'ACC-001',q:3}],                    'credit',   'company',    cid['87654321'], 'Talleres López','87654321',  ADMIN_ID, ADMIN_NAME],
  // Día -4
  [4, 8,  [{c:'CON-002',q:5}],                    'cash',     'cf',         1,          'Consumidor Final',     'CF',       CASH_ID,  CASH_NAME],
  [4, 11, [{c:'MAN-001',q:3},{c:'MAN-002',q:2}], 'transfer', 'registered', cid['11223344'], 'Mecánica Central S.A.','11223344',CASH_ID, CASH_NAME],
  [4, 15, [{c:'SER-001',q:2}],                    'credit',   'company',    cid['55667788'], 'Distribuidora Norte','55667788', ADMIN_ID, ADMIN_NAME],
  // Día -3
  [3, 9,  [{c:'MAN-003',q:1},{c:'CON-001',q:6}], 'cash',     'cf',         1,          'Consumidor Final',     'CF',       CASH_ID,  CASH_NAME],
  [3, 13, [{c:'ACC-001',q:2},{c:'SER-002',q:3}], 'card',     'registered', cid['12345678'], 'Constructora Pérez S.A.','12345678',CASH_ID, CASH_NAME],
  // Día -2
  [2, 10, [{c:'MAN-001',q:4}],                    'cash',     'cf',         1,          'Consumidor Final',     'CF',       ADMIN_ID, ADMIN_NAME],
  [2, 14, [{c:'MAN-002',q:2},{c:'CON-002',q:4}], 'credit',   'company',    cid['87654321'], 'Talleres López','87654321',  CASH_ID,  CASH_NAME],
  // Día -1
  [1, 8,  [{c:'SER-001',q:1},{c:'SER-002',q:1}], 'cash',     'cf',         1,          'Consumidor Final',     'CF',       CASH_ID,  CASH_NAME],
  [1, 11, [{c:'MAN-003',q:2},{c:'ACC-001',q:1}], 'transfer', 'registered', cid['11223344'], 'Mecánica Central S.A.','11223344',ADMIN_ID, ADMIN_NAME],
  // Hoy
  [0, 9,  [{c:'CON-001',q:8},{c:'CON-002',q:3}], 'cash',     'cf',         1,          'Consumidor Final',     'CF',       CASH_ID,  CASH_NAME],
  [0, 11, [{c:'MAN-001',q:2},{c:'SER-001',q:1}], 'card',     'registered', cid['55667788'], 'Distribuidora Norte','55667788', ADMIN_ID, ADMIN_NAME],
]

// Agrupar ventas por día
const byDay = {}
for (const s of salesPlan) {
  const day = s[0]
  if (!byDay[day]) byDay[day] = []
  byDay[day].push(s)
}

const creditSales = [] // para cuentas x cobrar

// Para cada día: abrir caja, insertar ventas, cerrar caja (salvo hoy)
const insReceivable = db.prepare(`
  INSERT INTO receivables
    (customer_id, customer_name, customer_nit, description, amount, amount_paid, status,
     created_by, created_by_name, created_at, updated_at)
  VALUES
    (@customer_id, @customer_name, @customer_nit, @description, @amount, 0, 'pending',
     @created_by, @created_by_name,
     strftime('%Y-%m-%d %H:%M:%S','now','localtime'),
     strftime('%Y-%m-%d %H:%M:%S','now','localtime'))
`)

for (const dayAgo of [6,5,4,3,2,1,0]) {
  const daySales = byDay[dayAgo] ?? []
  const isToday = dayAgo === 0

  // Abrir caja a las 8:00
  const sessionId = Number(insCashSession.run({
    opened_by: ADMIN_ID, opened_by_name: ADMIN_NAME,
    opened_at: localTs(dayAgo, 8, 0), opening_amount: 500,
    closed_by:       isToday ? null : ADMIN_ID,
    closed_by_name:  isToday ? null : ADMIN_NAME,
    closed_at:       isToday ? null : localTs(dayAgo, 18, 0),
    closing_amount:  null,
    expected_amount: null,
    difference:      null,
    notes: isToday ? null : 'Cierre de caja diario',
    status: isToday ? 'open' : 'closed',
  }).lastInsertRowid)

  insAudit.run({
    action:'cash_open', entity:'cash_session', entity_id: sessionId,
    description: `Caja #${sessionId} abierta con Q500.00`,
    payload_json: JSON.stringify({ opening_amount: 500 }),
    user_id: ADMIN_ID, user_name: ADMIN_NAME, created_at: localTs(dayAgo, 8, 0),
  })

  let dayCashTotal = 500  // opening amount
  let daySaleCount = 0

  for (const [daysAgoS, hour, items, method, ctype, custId, custName, custNit, userId, userName] of daySales) {
    // Calcular total
    let total = 0
    for (const i of items) {
      const p = products.find(p => p.code === i.c)
      total += (p?.price ?? 0) * i.q
    }

    const saleRow = insSale.run({
      date: localTs(daysAgoS, hour),
      total, subtotal: total,
      customer_id: custId, customer_name_snapshot: custName, customer_nit_snapshot: custNit,
      payment_method: method, client_type: ctype,
      created_by_user_id: userId, created_by_user_snapshot: userName,
    })
    const saleId = Number(saleRow.lastInsertRowid)

    for (const i of items) {
      const p = products.find(p => p.code === i.c)
      const prod = db.prepare('SELECT stock, name FROM products WHERE id=?').get(pid[i.c])
      const before = prod.stock
      insSaleItem.run(saleId, pid[i.c], i.q, p?.price ?? 0)
      updStockDown.run(i.q, pid[i.c])
      insMove.run({
        product_id: pid[i.c], product_name: prod.name, type:'sale',
        qty: i.q, qty_before: before, qty_after: before - i.q,
        reference_type:'sale', reference_id: saleId,
        notes: null, created_by: userId, created_by_name: userName,
        created_at: localTs(daysAgoS, hour),
      })
    }

    // Cuenta x cobrar si es crédito
    if (method === 'credit') {
      creditSales.push({ saleId, custId, custName, custNit, total, userId, userName, daysAgoS, hour })
      insReceivable.run({
        customer_id: custId > 1 ? custId : null,
        customer_name: custName,
        customer_nit: custNit !== 'CF' ? custNit : null,
        description: `Venta #${String(saleId).padStart(6,'0')}`,
        amount: total,
        created_by: userId, created_by_name: userName,
      })
    }

    insAudit.run({
      action:'sale_created', entity:'sale', entity_id: saleId,
      description: `Venta #${saleId} por Q${total.toFixed(2)} — ${method} — ${custName}`,
      payload_json: JSON.stringify({ total, method, customer: custName }),
      user_id: userId, user_name: userName, created_at: localTs(daysAgoS, hour),
    })

    if (method === 'cash' || method === 'card' || method === 'transfer') dayCashTotal += total
    daySaleCount++
    console.log(`  Caja#${sessionId} Venta#${saleId} ${localTs(daysAgoS, hour).slice(0,16)} ${method} Q${total.toFixed(2)} (${custName})`)
  }

  // Cerrar caja (días pasados)
  if (!isToday) {
    db.prepare(`UPDATE cash_sessions SET closing_amount=?, expected_amount=?, difference=? WHERE id=?`)
      .run(dayCashTotal, dayCashTotal, 0, sessionId)
    insAudit.run({
      action:'cash_close', entity:'cash_session', entity_id: sessionId,
      description: `Caja #${sessionId} cerrada con Q${dayCashTotal.toFixed(2)}. ${daySaleCount} ventas.`,
      payload_json: JSON.stringify({ closing_amount: dayCashTotal, sale_count: daySaleCount }),
      user_id: ADMIN_ID, user_name: ADMIN_NAME, created_at: localTs(dayAgo, 18, 0),
    })
    console.log(`  → Caja #${sessionId} cerrada Q${dayCashTotal.toFixed(2)}`)
  } else {
    console.log(`  → Caja #${sessionId} ABIERTA (hoy)`)
  }
}

// ─── 8. GASTOS ────────────────────────────────────────────────────────────────
console.log('\n=== GASTOS ===')
const insExpense = db.prepare(`
  INSERT INTO expenses (description, amount, category, expense_date, created_by, created_by_name)
  VALUES (@description, @amount, @category, @date, @created_by, @created_by_name)
`)
const expenses = [
  { description:'Compra insumos limpieza',  amount:250.00, category:'operativo', date:localDate(5) },
  { description:'Reparación herramienta',   amount:450.00, category:'operativo', date:localDate(3) },
  { description:'Papelería y útiles',       amount:85.00,  category:'admin',     date:localDate(1) },
]
for (const e of expenses) {
  const r = insExpense.run({ ...e, created_by: ADMIN_ID, created_by_name: ADMIN_NAME })
  insAudit.run({
    action:'expense_created', entity:'expense', entity_id: Number(r.lastInsertRowid),
    description: `Gasto registrado: ${e.description} Q${e.amount}`,
    payload_json: JSON.stringify({ amount: e.amount, category: e.category }),
    user_id: ADMIN_ID, user_name: ADMIN_NAME, created_at: localTs(0,9),
  })
  console.log(`  + Gasto #${r.lastInsertRowid}: ${e.description} Q${e.amount}`)
}

// ─── 9. COTIZACIÓN ────────────────────────────────────────────────────────────
console.log('\n=== COTIZACIÓN ===')
const insQuote = db.prepare(`
  INSERT INTO quotes (customer_id, customer_name, customer_nit, subtotal, tax_rate, tax_amount, total, status, created_by, created_by_name, created_at, updated_at)
  VALUES (@customer_id, @customer_name, @customer_nit, @subtotal, 0, 0, @total, 'draft',
    @created_by, @created_by_name,
    strftime('%Y-%m-%d %H:%M:%S','now','localtime'),
    strftime('%Y-%m-%d %H:%M:%S','now','localtime'))
`)
const insQItem = db.prepare(`
  INSERT INTO quote_items (quote_id, product_id, product_name, product_code, qty, unit_price, subtotal)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`)
const qr = insQuote.run({
  customer_id: cid['12345678'], customer_name:'Constructora Pérez S.A.', customer_nit:'12345678',
  subtotal:850.00, total:850.00, created_by: ADMIN_ID, created_by_name: ADMIN_NAME,
})
const qid = Number(qr.lastInsertRowid)
insQItem.run(qid, pid['MAN-002'], 'Manguera Hidráulica 1/2"',  'MAN-002', 5,  120.00, 600.00)
insQItem.run(qid, pid['CON-001'], 'Conector Recto 1/4" NPT',   'CON-001', 10,  25.00, 250.00)
insAudit.run({
  action:'quote_created', entity:'quote', entity_id: qid,
  description: `Cotización #${qid} creada para Constructora Pérez S.A. Q850.00`,
  payload_json: JSON.stringify({ total:850.00, customer:'Constructora Pérez S.A.' }),
  user_id: ADMIN_ID, user_name: ADMIN_NAME, created_at: localTs(0,9),
})
console.log(`  + Cotización #${qid}: Constructora Pérez S.A. Q850.00`)

// ─── RESUMEN FINAL ─────────────────────────────────────────────────────────────
console.log('\n=== RESUMEN ===')
const q = (sql) => db.prepare(sql).get()
console.log('  Productos:',         q('SELECT COUNT(*) n FROM products').n)
console.log('  Clientes (no CF):',  q('SELECT COUNT(*) n FROM customers WHERE id!=1').n)
console.log('  Ventas:',            q('SELECT COUNT(*) n FROM sales').n)
console.log('  Items de venta:',    q('SELECT COUNT(*) n FROM sale_items').n)
console.log('  Movimientos stock:', q('SELECT COUNT(*) n FROM stock_movements').n)
console.log('  Cajas (sesiones):',  q('SELECT COUNT(*) n FROM cash_sessions').n, '(1 abierta)')
console.log('  Compras (OC):',      q('SELECT COUNT(*) n FROM purchase_orders').n)
console.log('  Cuentas x cobrar:',  q('SELECT COUNT(*) n FROM receivables').n)
console.log('  Gastos:',            q('SELECT COUNT(*) n FROM expenses').n)
console.log('  Cotizaciones:',      q('SELECT COUNT(*) n FROM quotes').n)
console.log('  Bitácora:',          q('SELECT COUNT(*) n FROM audit_log').n)
console.log('\n  Stock actual:')
for (const p of db.prepare('SELECT code, name, stock FROM products ORDER BY id').all()) {
  console.log(`    ${p.code} ${p.name}: ${p.stock}`)
}
console.log('\n✓ Seed completado.')

db.pragma('foreign_keys = ON')
db.close()
