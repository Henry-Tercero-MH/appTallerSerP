# TallerPOS — Sistema de Punto de Venta para Taller Mecánico (Desktop Offline)

> Aplicación de escritorio offline construida con Electron + React + SQLite.
> Corre en cualquier PC con Windows sin internet, sin servidores externos, sin Docker.

---

## Arquitectura General

```text
[Aplicación de Escritorio (Electron)]
│
├── Proceso Main (Node.js)
│   ├── Ciclo de vida de la app (main/index.js)
│   ├── Base de datos local SQLite (main/database/)
│   ├── Sistema de migraciones versionadas (main/database/migrator.js)
│   └── Módulos IPC por dominio (main/modules/)
│       ├── settings/   → configuración del negocio
│       ├── products/   → inventario CRUD completo
│       ├── customers/  → directorio de clientes
│       └── sales/      → ventas, historial, reportes
│
├── IPC Bridge (Preload)
│   └── main/preload.js → expone window.api al renderer (contextIsolation)
│
└── Proceso Renderer (React + Vite + Tailwind + shadcn/ui)
    └── renderer/ → interfaz de usuario reactiva
```

---

## Base de Datos (SQLite)

Se usa **SQLite** vía `better-sqlite3`. El archivo `taller_pos.sqlite` se crea automáticamente en:
- **Windows:** `C:\Users\<usuario>\AppData\Roaming\TallerPOS\`
- **Linux:** `~/.config/TallerPOS/`

Los datos persisten aunque se actualice el ejecutable.

### Migraciones

Las migraciones corren automáticamente al iniciar la app, en orden, con checksum SHA-256 para detectar manipulaciones. Nunca edites una migración ya aplicada — crea una nueva.

| Archivo | Contenido |
|---------|-----------|
| `001_init.sql` | Tablas base: `products`, `sales`, `sale_items` + 5 productos semilla |
| `002_settings.sql` | Tabla `settings` (moneda, impuesto, datos del negocio) |
| `003_sales_tax_snapshot.sql` | Columnas snapshot de impuesto en `sales` |
| `004_customers.sql` | Tabla `customers` + columnas snapshot en `sales` |
| `005_products_extended.sql` | Columnas `category`, `brand`, `location`, `condition`, `min_stock`, `is_active` en `products` |

---

## Módulos del Sistema

| Módulo | Ruta | Estado | Descripción |
|--------|------|--------|-------------|
| Dashboard | `/` | Activo | KPIs del día, alertas de stock bajo, accesos rápidos |
| POS / Facturación | `/ventas` | Activo | Carrito, descuentos, impuesto, método de pago |
| Historial | `/historial` | Activo | Ventas paginadas, detalle con ítems, impresión de ticket |
| Taller | `/taller` | Mock | UI base lista, lógica de órdenes de servicio pendiente |
| Inventario | `/inventario` | Activo | CRUD completo conectado a SQLite, entradas/salidas de stock |
| Clientes | `/clientes` | Activo | CRUD, NIT, búsqueda, Consumidor Final como fallback |
| Reportes | `/reportes` | Activo | Ventas del día, subtotal/impuesto/total, top 5 productos |

---

## Estructura de Carpetas

```text
frontend/
├── package.json              ← Scripts y dependencias
├── vite.config.js            ← Vite + vite-plugin-electron + aliases @/
│
├── main/                     ← Proceso main de Electron (Node.js)
│   ├── index.js              ← Punto de entrada: bootstrap() + createWindow()
│   ├── preload.js            ← Puente IPC seguro → window.api
│   ├── ipc/
│   │   ├── register.js       ← Bootstrap: DB + migraciones + registro IPC
│   │   └── response.js       ← Helper wrap() para envelope { ok, data/error }
│   ├── database/
│   │   ├── connection.js     ← Singleton SQLite con PRAGMAs (WAL, FK, NORMAL)
│   │   ├── migrator.js       ← Runner de migraciones con checksum SHA-256
│   │   └── migrations/       ← Archivos SQL versionados (001 a 005)
│   └── modules/
│       ├── settings/         ← settings.repository / service / ipc
│       ├── products/         ← products.repository / service / ipc (CRUD + stock)
│       ├── customers/        ← customers.repository / service / ipc
│       └── sales/            ← sales.repository / service / ipc (+ daily report)
│
└── renderer/                 ← Proceso renderer (React)
    ├── main.jsx              ← Entry point React
    ├── App.jsx               ← QueryClient + AuthProvider + RouterProvider
    ├── router/index.jsx      ← createHashRouter (hash requerido para Electron)
    ├── layouts/
    │   ├── AppLayout.jsx     ← Sidebar + navegación principal
    │   ├── AuthLayout.jsx    ← Redirige a / si ya hay sesión activa
    │   └── ProtectedLayout.jsx ← Redirige a /login si no hay sesión
    ├── features/
    │   ├── auth/             ← Login (sessionStorage), AuthContext
    │   ├── dashboard/        ← SystemDashboard: KPIs + alertas + accesos rápidos
    │   ├── pos/              ← POSPage: carrito de ventas
    │   ├── sales/            ← SalesHistoryPage, SaleDetailDialog, ReportsPage
    │   ├── clients/          ← ClientsPage, CustomerFormDialog
    │   ├── warehouses/       ← InventoryPage, ProductForm, StockMovementModal
    │   └── workshop/         ← WorkshopPage (mock, órdenes de servicio pendientes)
    ├── hooks/                ← React Query hooks por dominio
    │   ├── useProducts.js
    │   ├── useCustomers.js
    │   ├── useSales.js       ← incluye useDailyReport
    │   └── useSettings.js
    ├── services/             ← Capa IPC → validación Zod por dominio
    │   ├── productsService.js
    │   ├── customersService.js
    │   ├── salesService.js
    │   └── settingsService.js
    ├── schemas/              ← Schemas Zod alineados a la DB real
    └── lib/
        ├── constants.js      ← ROUTES, APP_NAME, ROLES
        └── mockData.js       ← Solo usado por auth (login temporal)
```

---

## Cómo iniciar el proyecto

### Requisitos previos
- **Node.js** v18 o superior
- **Windows** (probado en Windows 11) — también funciona en Linux

### 1. Instalar dependencias y compilar módulos nativos

```bash
cd frontend
npm install
npx electron-rebuild -f -w better-sqlite3
```

> **Por qué el segundo paso:** `better-sqlite3` es un módulo nativo (C++) que debe compilarse
> para el runtime interno de Electron, no para el Node.js del sistema. Sin este paso la app
> arranca con pantalla en blanco y error en consola.

### 2. Levantar entorno de desarrollo

```bash
npm run dev
```

Levanta Vite (renderer) y abre la ventana de Electron automáticamente.

**Importante:** No uses el navegador (`localhost:5173`) para desarrollar — `window.api`
solo existe dentro de la ventana Electron, no en el navegador.

### 3. Generar ejecutable instalable

```bash
npm run build
```

Genera un `.exe` instalable en `release/`. Ese archivo se puede copiar a cualquier PC
sin necesidad de Node.js ni dependencias adicionales.

---

## API IPC (`window.api`)

Todos los canales siguen el envelope estándar:
`{ ok: true, data } | { ok: false, error: { code, message } }`

```js
// Productos
window.api.products.list()
window.api.products.listActive()
window.api.products.search(query)
window.api.products.create(input)
window.api.products.update(id, patch)
window.api.products.remove(id)              // soft-delete (is_active = 0)
window.api.products.restore(id)
window.api.products.adjustStock(id, type, qty)  // type: 'entry' | 'exit'

// Clientes
window.api.customers.list(opts)
window.api.customers.search(query, opts)
window.api.customers.getById(id)
window.api.customers.create(input)
window.api.customers.update(id, patch)
window.api.customers.setActive(id, active)

// Ventas
window.api.sales.create(saleData)
window.api.sales.list(opts)                 // paginado { page, pageSize }
window.api.sales.getById(id)
window.api.sales.dailyReport()              // KPIs del día + top 5 productos

// Configuración
window.api.settings.getAll()
window.api.settings.get(key)
window.api.settings.set(key, value)
window.api.settings.getByCategory(category)
```

---

## Pendiente

| Prioridad | Tarea |
|-----------|-------|
| Alta | **Órdenes de servicio (Workshop)** — esquema DB, IPC, UI completa. Es el diferenciador de un taller vs un POS genérico |
| Media | **Cierre de caja** — apertura con monto inicial, corte del día por método de pago |
| Media | **Método de pago en reportes** — agregar columna `payment_method` a `sales` para desglosar efectivo/tarjeta |
| Baja | **Filtro por fecha en historial** — hoy solo pagina, no filtra por rango de fechas |
| Baja | **Ticket con membrete configurable** — logo del negocio, formato 80mm para impresora térmica |
