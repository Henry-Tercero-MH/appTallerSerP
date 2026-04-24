#!/usr/bin/env node
import Database from 'better-sqlite3'
import os from 'os'
import path from 'path'
import fs from 'fs'

const home = os.homedir()
const candidates = [
  path.join(home, '.config', 'TallerPOS', 'taller_pos.sqlite'),
  path.join(home, '.config', 'taller-pos-electron', 'taller_pos.sqlite'),
  path.join(home, '.config', 'taller_pos.sqlite'),
  path.join(process.cwd(), 'taller_pos.sqlite'),
]

function findDb() {
  for (const c of candidates) if (fs.existsSync(c)) return c
  return null
}

function main() {
  const dbPath = findDb()
  if (!dbPath) {
    console.error('No se encontró la DB en rutas estándar. Ejecuta el seed primero.')
    process.exit(1)
  }
  console.log('Usando DB:', dbPath)

  const db = new Database(dbPath, { readonly: true })

  const productCount = db.prepare('SELECT COUNT(*) as c FROM products').get().c || 0
  console.log(`Productos: ${productCount}`)
  const products = db.prepare('SELECT id, code, name, price, stock FROM products ORDER BY id DESC LIMIT 10').all()
  console.log('Muestras de productos:')
  console.table(products)

  const salesCount = db.prepare('SELECT COUNT(*) as c FROM sales').get().c || 0
  console.log(`Ventas: ${salesCount}`)
  const sales = db.prepare('SELECT id, total, subtotal, tax_amount, currency_code, date FROM sales ORDER BY id DESC LIMIT 10').all()
  console.log('Muestras de ventas:')
  console.table(sales)

  const items = db.prepare('SELECT si.id, si.sale_id, si.product_id, si.qty, si.price, p.code as product_code FROM sale_items si LEFT JOIN products p ON p.id = si.product_id ORDER BY si.id DESC LIMIT 20').all()
  console.log('Muestras de sale_items:')
  console.table(items)

  db.close()
}

main()
