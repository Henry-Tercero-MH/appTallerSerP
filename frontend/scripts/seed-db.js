#!/usr/bin/env node
import Database from 'better-sqlite3'
import path from 'path'
import os from 'os'
import fs from 'fs'

// Intenta localizar la DB usada por la app Electron (taller_pos.sqlite)
const home = os.homedir()
const candidates = [
  path.join(home, '.config', 'TallerPOS', 'taller_pos.sqlite'),
  path.join(home, '.config', 'taller-pos-electron', 'taller_pos.sqlite'),
  path.join(home, '.config', 'taller_pos.sqlite'),
  path.join(process.cwd(), 'taller_pos.sqlite'),
]

function ensureDirExists(filePath) {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      total REAL NOT NULL,
      subtotal REAL NOT NULL DEFAULT 0,
      tax_rate_applied REAL NOT NULL DEFAULT 0,
      tax_amount REAL NOT NULL DEFAULT 0,
      currency_code TEXT NOT NULL DEFAULT 'GTQ',
      date TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      qty INTEGER NOT NULL,
      price REAL NOT NULL,
      FOREIGN KEY(sale_id) REFERENCES sales(id),
      FOREIGN KEY(product_id) REFERENCES products(id)
    );
  `)
}

function seedData(db) {
  const insert = db.prepare('INSERT OR IGNORE INTO products (code, name, price, stock) VALUES (?, ?, ?, ?)')
  const seedProducts = [
    ['ACE-001', 'Aceite de Motor 10W40 Chevron', 45.0, 12],
    ['FIL-002', 'Filtro de Aceite ECOBREX', 15.5, 5],
    ['FRE-003', 'Pastillas de Freno Ceramicas', 120.0, 8],
    ['BAT-004', 'Bateria 12V 70Ah LTH', 650.0, 2],
    ['SRV-001', 'Servicio de Diagnostico Escaner', 150.0, 999],
  ]
  const insertMany = db.transaction((rows) => {
    for (const r of rows) insert.run(...r)
  })
  insertMany(seedProducts)

  // Inserta una venta de ejemplo si no hay ventas
  const count = db.prepare('SELECT COUNT(*) as c FROM sales').get()
  if (count.c === 0) {
    const sale = db.prepare(
      `INSERT INTO sales (total, subtotal, tax_rate_applied, tax_amount, currency_code) VALUES (?, ?, ?, ?, ?)`
    )
    const saleInfo = sale.run(100.0, 89.29, 0.12, 10.71, 'GTQ')
    const saleId = saleInfo.lastInsertRowid
    const product = db.prepare('SELECT id, price FROM products WHERE code = ?').get('ACE-001')
    if (product) {
      const insertItem = db.prepare('INSERT INTO sale_items (sale_id, product_id, qty, price) VALUES (?, ?, ?, ?)')
      insertItem.run(saleId, product.id, 2, product.price)
    }
  }
}

function main() {
  let target = null
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      target = c
      break
    }
  }

  if (!target) {
    // Usa la primera candidata y crea la carpeta si no existe
    target = candidates[0]
    ensureDirExists(target)
    console.log('No se encontró DB existente. Se creará en:', target)
  } else {
    console.log('DB encontrada en:', target)
  }

  const db = new Database(target)
  initSchema(db)
  seedData(db)
  console.log('Semilla insertada correctamente en', target)
  db.close()
}

main()
