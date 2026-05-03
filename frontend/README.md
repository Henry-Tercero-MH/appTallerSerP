# GestorERP — Mangueras del Sur

> Sistema ERP de escritorio offline para talleres y negocios pequeños.  
> Electron 30 + React 18 + SQLite (better-sqlite3). Corre en Windows/Linux sin internet.

---

## Inicio rápido

```bash
cd frontend
npm install                              # instala deps + compila better-sqlite3
npm run dev                              # Vite + Electron en modo desarrollo
npm run build                            # genera instalador en release/
```

> **Error `cabecera ELF inválida`** → ejecuta `npx electron-rebuild -f -w better-sqlite3`  
> (ocurre si `postinstall` falló al instalar)

---

## Arquitectura

```
GestorERP/
├── main/                   Proceso Node.js (Electron main)
│   ├── index.js            Punto de entrada: createWindow + bootstrap()
│   ├── preload.js          Bridge IPC seguro → expone window.api
│   ├── ipc/register.js     Bootstrap único: DB + migraciones + registro de todos los módulos IPC
│   ├── database/
│   │   ├── connection.js   Singleton SQLite con PRAGMAs (WAL, FK, journal_mode=NORMAL)
│   │   ├── migrator.js     Runner con checksum SHA-256 (nunca edites una migración ya aplicada)
│   │   ├── backup.js       Hot Backup automático (SQLite API) con scheduler configurable
│   │   └── migrations/     001–023 archivos SQL versionados
│   └── modules/            Un directorio por dominio, cada uno con:
│       └── <dominio>/      *.repository.js · *.service.js · *.ipc.js
│
└── renderer/               Proceso React (Vite)
    ├── main.jsx            Entry point: QueryProvider + AuthProvider + RouterProvider
    ├── router/index.jsx    createHashRouter (hash requerido para Electron)
    ├── layouts/            AppLayout · AuthLayout · ProtectedLayout · AdminRoute
    ├── features/           Una carpeta por pantalla/dominio
    ├── hooks/              React Query hooks por dominio
    ├── services/           Capa IPC + validación Zod
    ├── schemas/            Schemas Zod alineados a la DB
    ├── stores/             Zustand (cartStore)
    └── lib/                constants · pricing · reports · brand · themes · utils
```

**Flujo de datos:**  
`Renderer (hook) → service (Zod) → window.api (preload) → IPC → main service → repository → SQLite`

**Respuesta IPC estándar:**  
`{ ok: true, data: T }` | `{ ok: false, error: { code: string, message: string } }`

---

## Base de Datos

Archivo: `taller_pos.sqlite`  
- **Windows:** `%APPDATA%\GestorERP\`  
- **Linux:** `~/.config/GestorERP/`

### Migraciones (001–023)

| # | Archivo | Contenido |
|---|---------|-----------|
| 001 | `init.sql` | Tablas base: `products`, `sales`, `sale_items` + productos semilla |
| 002 | `settings.sql` | Tabla `settings` (moneda, impuesto, datos del negocio) |
| 003 | `sales_tax_snapshot.sql` | Columnas snapshot de impuesto en `sales` |
| 004 | `customers.sql` | Tabla `customers` + snapshot en `sales`, Consumidor Final id=1 |
| 005 | `products_extended.sql` | `category`, `brand`, `min_stock`, `is_active` en `products` |
| 006 | `users.sql` | Tabla `users` con roles y contraseña hasheada |
| 007 | `settings_extended.sql` | Configuraciones adicionales del negocio |
| 008 | `settings_theme.sql` | Configuración de tema visual |
| 009 | `sales_payment.sql` | `payment_method` y `client_type` en `sales` |
| 010 | `sales_void_audit.sql` | Tabla `sale_voids`, `audit_log`, estado `voided` en `sales` |
| 011 | `users_avatar.sql` | Columna `avatar` en `users` |
| 012 | `cash_sessions.sql` | Tablas `cash_sessions` y `cash_movements` |
| 013 | `purchases.sql` | Tablas `suppliers`, `purchase_orders`, `purchase_items` |
| 014 | `receivables.sql` | Tablas `receivables` y `receivable_payments` |
| 015 | `quotes.sql` | Tablas `quotes` y `quote_items` |
| 016 | `sales_discount.sql` | `discount_type`, `discount_value`, `discount_amount` en `sales` |
| 017 | `expenses.sql` | Tabla `expenses` (gastos del negocio) |
| 018 | `returns.sql` | Tabla `returns` y `return_items` |
| 019 | `stock_movements.sql` | Tabla `stock_movements` (bitácora de inventario) |
| 020 | `backup_settings.sql` | Settings para backup automático |
| 021 | `tax_enabled.sql` | Setting `tax_enabled` booleano |
| 022 | `printer_settings.sql` | Settings de impresora (`default_printer`, `paper_size`) |
| 023 | `categories.sql` | Tabla `categories` para productos |

---

## Módulos del Sistema

### Rutas y acceso

| Ruta | Página | Acceso |
|------|--------|--------|
| `/` | Dashboard | Solo admin |
| `/ventas` | Punto de Venta (POS) | Todos |
| `/historial` | Historial de ventas | Todos |
| `/inventario` | Inventario / Productos | Todos |
| `/clientes` | Clientes | Solo admin |
| `/reportes` | Reportes de ventas | Solo admin |
| `/caja` | Caja (sesiones) | Solo admin |
| `/compras` | Órdenes de compra | Solo admin |
| `/cuentas-cobrar` | Cuentas por cobrar | Solo admin |
| `/cotizaciones` | Cotizaciones | Solo admin |
| `/gastos` | Gastos | Solo admin |
| `/proveedores` | Proveedores | Solo admin |
| `/usuarios` | Gestión de usuarios | Solo admin |
| `/configuracion` | Configuración | Solo admin |
| `/bitacora` | Bitácora/Auditoría | Solo admin |
| `/taller` | Workshop (en desarrollo) | Todos |

### Roles de usuario

| Rol | Descripción |
|-----|-------------|
| `admin` | Acceso completo a todas las rutas y módulos |
| `cashier` | Acceso a POS, historial e inventario |
| `mechanic` | Acceso básico (POS, historial) |
| `warehouse` | Acceso a inventario y almacén |

---

## Módulos Backend (main/modules)

| Módulo | IPC base | Funciones principales |
|--------|----------|-----------------------|
| **settings** | `settings:*` | CRUD de configuraciones por clave/categoría, caché en memoria |
| **categories** | `categories:*` | CRUD de categorías de productos |
| **products** | `products:*` | CRUD + soft-delete + ajuste de stock + búsqueda |
| **customers** | `customers:*` | CRUD + búsqueda + activar/desactivar |
| **sales** | `sales:*` | Crear venta, historial paginado, reporte diario, reporte por rango, anular venta |
| **users** | `users:*` | Login, CRUD, cambio de contraseña, avatar |
| **audit** | `audit:*` | Listado paginado con filtros de bitácora |
| **cash** | `cash:*` | Abrir/cerrar sesión, movimientos manuales, historial de sesiones |
| **purchases** | `purchases:*` | Órdenes de compra, recepción con actualización de precios, variaciones |
| **receivables** | `receivables:*` | CxC, abonos, resumen, pagos por rango de fechas |
| **quotes** | `quotes:*` | Cotizaciones, conversión a venta o CxC, descuento de stock |
| **expenses** | `expenses:*` | Gastos del negocio con categorías |
| **returns** | `returns:*` | Devoluciones, restauración de stock |
| **inventory** | `inventory:*` | Movimientos de stock, alertas de stock bajo |

### Canales IPC adicionales (register.js)

| Canal | Función |
|-------|---------|
| `db:backup` | Backup manual con diálogo "Guardar como…" |
| `db:backup-now` | Backup automático a `userData/backups/` |
| `db:list-backups` | Lista backups automáticos disponibles |
| `db:restore` | Restaurar DB desde archivo (relanza la app) |
| `db:set-backup-interval` | Cambiar intervalo del scheduler en caliente |
| `db:get-path` | Ruta absoluta del archivo SQLite |
| `printer:list` | Lista impresoras del sistema |
| `printer:print` | Imprime HTML en ventana oculta (soporta `letter`, `half-letter`, `thermal-80`) |

---

## Dashboard (SystemDashboard)

Muestra tres niveles de información:

**KPIs del día**
- Transacciones · Total ventas · Cobros CxC hoy · Gastos del día

**Total General hoy** *(card destacada)*  
= Ventas cobradas (no crédito) + Cobros CxC del día

**Resumen del mes** *(con selector de mes)*  
- Transacciones · Total ventas · Cobros CxC · Total General del mes  
- Selector `<input type="month">` que permite navegar a meses anteriores

**Secciones secundarias**
- Estado de caja abierta/cerrada
- Cuentas por cobrar (saldo pendiente, cobrado hoy, vencidas)
- Compras pendientes
- Stock bajo (productos bajo mínimo)
- Alertas: stock crítico, cuentas próximas a vencer, cuentas vencidas

---

## Caja (Sesiones)

- Solo admin puede abrir/cerrar sesión
- Al **cerrar**, el monto esperado se calcula con:  
  `apertura + ventas_cobradas_HOY + cobros_CxC_HOY + entradas_manuales − salidas_manuales`
- Las ventas de crédito **no** cuentan en el cierre de caja
- Al **ver** una sesión histórica, se muestra el rango completo de la sesión

---

## Cuentas por Cobrar (CxC)

- Creación manual o automática al convertir una cotización a CxC
- Estados: `pending` → `partial` → `paid` | `cancelled`
- Al cancelar: el inventario **NO se restaura** (los productos ya fueron entregados)
- Los abonos se reflejan en: Dashboard (KPI del día), cierre de caja y resumen mensual

---

## Cotizaciones

- Flujo: Borrador → Enviada → convertir a **Venta directa** o **CxC**
- Al convertir a venta/CxC se descuenta el stock automáticamente
- Impresión en tamaño carta mediante `printer:print` con HTML autónomo

---

## Compras

- Estados de orden: `draft` → `sent` → `received` | `cancelled`
- Al recibir: opción de **actualizar precio de costo** si hay variación respecto al costo actual
- Las ventas a crédito se excluyen del cálculo de caja pero se registran normalmente

---

## Sistema de Backup

- **Automático:** scheduler con `setInterval`, guarda en `userData/backups/`
- **Intervalo por defecto:** 720 horas (mensual), máximo 10 copias
- **Configurable** desde Configuración sin reiniciar la app
- **Manual:** diálogo nativo "Guardar como…" desde Configuración
- **Restaurar:** abre la DB respaldada y relanza la app automáticamente

---

## Impresión

La app usa `printer:print` con una ventana Electron oculta, no `window.print()`.  
Tamaños soportados: `letter` (215×279 mm) · `half-letter` (139×215 mm) · `thermal-80` (80 mm).  
Documentos que se pueden imprimir: cotizaciones, cierre de caja.

---

## Identidad Visual

```js
// renderer/lib/brand.js — NO se sobreescribe con respaldos de DB
export const BRAND_NAME = 'Mangueras del Sur'
export const BRAND_LOGO = logoUrl   // renderer/assets/logo2.jpeg
```

Los assets de logo deben estar en `renderer/assets/` (no en `public/`) para que Vite los procese.

---

## Tecnologías

| Categoría | Librería | Versión |
|-----------|---------|---------|
| Runtime | Electron | 30.5.1 |
| BD | better-sqlite3 | 12.x |
| UI Framework | React | 18.3 |
| Build | Vite + vite-plugin-electron | 5.4 / 0.29 |
| Router | react-router-dom | 7.x |
| Server State | @tanstack/react-query | 5.x |
| Client State | Zustand | 4.x |
| Formularios | react-hook-form + Zod | 7.x / 3.x |
| UI Components | shadcn/ui (Radix) + Tailwind | 3.4 |
| Gráficas | Recharts | 3.x |
| PDF/Excel | jsPDF + jspdf-autotable + xlsx | — |
| Iconos | lucide-react + react-icons | — |
| Notificaciones | Sonner | 1.x |
| Fechas | date-fns | 4.x |

---

## Scripts disponibles

```bash
npm run dev          # Desarrollo (Vite + Electron)
npm run build        # Build de producción + instalador (electron-builder)
npm run lint         # ESLint
npm run typecheck    # TypeScript check (checkJs: true, sin compilar)
```

---

## Notas para desarrollo

- **`window.api`** solo existe en el renderer dentro de Electron, nunca en navegador
- **Nunca editar** una migración ya aplicada — el checksum SHA-256 lo detectaría
- **Ventas a crédito** (`payment_method = 'credit'`) no cuentan en cierre de caja ni en `cash_total`
- **`dailySummary`** incluye el campo `cash_total` (ventas no-crédito activas del día)
- El **Consumidor Final** es el cliente con `id = 1`, sembrado en migración 004
- El **admin por defecto** se siembra en migración 006 (ver seed o settings)
- Para desarrollo con TypeScript: `jsconfig.json` con `checkJs: true` y `api.d.ts` para `window.api`
