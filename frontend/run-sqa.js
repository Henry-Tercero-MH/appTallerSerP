import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'
import { runMigrations } from './main/database/migrator.js'

// Mocking simple loadMigrations function that the app does via file reads
import { fileURLToPath } from 'node:url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

function loadMigrations() {
  const migrationsDir = path.join(__dirname, 'main/database/migrations')
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()
  return files.map(file => ({
    name: file,
    sql: fs.readFileSync(path.join(migrationsDir, file), 'utf8')
  }))
}

// Simple Test Runner
const tests = []
function test(name, fn) { tests.push({ name, fn }) }

async function runTests() {
  console.log('--- Iniciando SQA: Pruebas de Base de Datos y Repositorios ---\n')
  const testDbPath = path.join(process.cwd(), 'taller_pos_test.sqlite')
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath)

  let db
  try {
    db = new Database(testDbPath)
    
    test('Migraciones: se aplican correctamente', () => {
      const migrations = loadMigrations()
      runMigrations(db, migrations)
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
      if (!tables.find(t => t.name === 'products')) throw new Error('Tabla products no creada')
      if (!tables.find(t => t.name === 'sales')) throw new Error('Tabla sales no creada')
    })
    
    test('Productos: CRUD Básico', () => {
      // Create
      const insert = db.prepare(`
        INSERT INTO products (code, name, price, cost, stock, category, is_active)
        VALUES (?, ?, ?, ?, ?, ?, 1)
      `)
      const res = insert.run('TEST-001', 'Filtro Aceite Test', 50.00, 25.00, 10, 'Filtros')
      if (res.changes !== 1) throw new Error('No se insertó el producto')
      
      // Read
      const row = db.prepare('SELECT * FROM products WHERE code = ?').get('TEST-001')
      if (row.name !== 'Filtro Aceite Test') throw new Error('Nombre incorrecto en la lectura')
      if (row.stock !== 10) throw new Error('Stock incorrecto')
        
      // Update
      const update = db.prepare('UPDATE products SET price = ? WHERE code = ?')
      update.run(60.00, 'TEST-001')
      const row2 = db.prepare('SELECT * FROM products WHERE code = ?').get('TEST-001')
      if (row2.price !== 60.00) throw new Error('No se actualizó el producto')
        
      // Soft Delete
      const del = db.prepare('UPDATE products SET is_active = 0 WHERE code = ?')
      del.run('TEST-001')
      const row3 = db.prepare('SELECT * FROM products WHERE code = ?').get('TEST-001')
      if (row3.is_active !== 0) throw new Error('No funcionó el soft delete')
    })
    
    test('Clientes: Creación Falla si NIT está duplicado', () => {
      // Insertar por defecto
      db.prepare('INSERT INTO customers (nit, name) VALUES (?, ?)').run('123456-7', 'Cliente A')
      // Intentar insertar de nuevo
      try {
        db.prepare('INSERT INTO customers (nit, name) VALUES (?, ?)').run('123456-7', 'Cliente B')
        throw new Error('Debería fallar al duplicar NIT')
      } catch (err) {
        if (!err.message.includes('UNIQUE constraint failed')) {
          throw new Error('Falló con otro error: ' + err.message)
        }
      }
    })

    // Ejecutar pruebas
    let passed = 0
    for (const t of tests) {
      try {
        t.fn()
        console.log(`✅ TEST PASSED: ${t.name}`)
        passed++
      } catch (err) {
        console.error(`❌ TEST FAILED: ${t.name}`)
        console.error(`   ${err.message}`)
      }
    }
    
    console.log(`\nResumen: ${passed}/${tests.length} tests pasaron correctamente.`)
    
  } finally {
    if (db) db.close()
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath)
  }
}

runTests()