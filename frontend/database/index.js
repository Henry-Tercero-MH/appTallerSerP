import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'

// Guardar la DB en userData /home/...
const dbPath = path.join(app.getPath('userData'), 'taller_pos.sqlite')
const db = new Database(dbPath)

db.pragma('journal_mode = WAL')

// Inicializar tablas
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

// Datos semilla
const count = db.prepare('SELECT COUNT(*) as count FROM products').get()
if (count.count === 0) {
  const insert = db.prepare('INSERT INTO products (code, name, price, stock) VALUES (?, ?, ?, ?)')
  const seedProducts = [
    { code: 'ACE-001', name: 'Aceite de Motor 10W40 Chevron', price: 45.00, stock: 12 },
    { code: 'FIL-002', name: 'Filtro de Aceite ECOBREX', price: 15.50, stock: 5 },
    { code: 'FRE-003', name: 'Pastillas de Freno Cerámicas', price: 120.00, stock: 8 },
    { code: 'BAT-004', name: 'Batería 12V 70Ah LTH', price: 650.00, stock: 2 },
    { code: 'SRV-001', name: 'Servicio de Diagnóstico Escáner', price: 150.00, stock: 999 },
  ]
  seedProducts.forEach(p => insert.run(p.code, p.name, p.price, p.stock))
}

export default db
