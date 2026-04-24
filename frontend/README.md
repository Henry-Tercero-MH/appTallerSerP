# Taller ERP - Frontend & Electron App

Este documento detalla el estado interno actual de la infraestructura de la aplicación de escritorio, especificando los componentes existentes y lo que ya tenemos construido.

## 🏗️ Infraestructura y Stack Tecnológico

La aplicación está construida utilizando una arquitectura de escritorio local (sin dependencias externas en tiempo de ejecución), apoyándose en el siguiente stack:

- **Contenedor Desktop:** Electron
- **Interfaz Gráfica / UI:** React 18 + Vite + Tailwind CSS
- **Base de Datos Local:** SQLite (vía el paquete `better-sqlite3`, compilado nativamente)
- **Comunicación Segura (IPC):** ContextBridge a través de scripts de `preload`
- **Enrutamiento:** React Router v7

---

## 📂 Organización Interna (`frontend/`)

El modelo actual ha reemplazado la vieja arquitectura web por una estructura unificada dividida:

* **`main/` (Proceso de Fondo - Node.js):**
  * `index.js`: Inicializador de la ventana de Electron, carga de la base de datos y registro de los puentes IPC.
  * `preload.js`: Puente de seguridad que inyecta funciones de Node al navegador bajo `window.api`.
* **`ipc/` (Controladores de Lógica):**
  * `handlers.js`: Archivo donde se centralizan las consultas y transacciones pesadas hacia la base de datos.
* **`database/`:**
  * `index.js`: Conexión de SQlite que autoconstruye el esquema de tablas si no existen al iniciar la App.
* **`renderer/` (Interfaz React, antes llamado `src/`):**
  * `features/`: Módulos de negocio (Autenticación, Bodegas, Inventario, Punto de Venta).
  * `layouts/`: Marcos visuales base (ex: Navbar/Sidebar, Rutas protegidas).
  * `components/`: Componentes visuales genéricos y reutilizables.
  * `lib/`: Constantes y datos agrupados.

---

## 🚀 ¿Qué tenemos implementado actualmente?

### 1. Motor de Base de Datos Base (SQLite) ✅
- Tablas creadas y automatizadas: `products`, `sales`, y `sale_items`.
- Configuración en modo "WAL" (Write-Ahead Logging) para mejor rendimiento local.
- Datos sembrados (mock de productos inicial) para tener inventario de prueba que vender.

### 2. Canales de Comunicación Listos (IPC) ✅
Los túneles seguros hacia el Backend ya están definidos y listos para ser consumidos desde React por el usuario:
- `window.api.getProducts()`: Solicita todos los productos a la DB.
- `window.api.searchProducts(consulta)`: Búsqueda indexada de componentes.
- `window.api.createSale({ items, total })`: Realiza una transacción unificada descontando inventarios de forma segura.

### 3. Vistas y Componentes React (UI) 🚧
- **Módulos Visuales Fundamentales:** Enrutador y Contexto de inicio de sesión de muestra.
- **Páginas Bases:** Punto de Venta (POS) con UI dividida para lector de lista de productos y carrito lateral. Módulos base de Bodegas. Layout principal con barra de navegación en tono "Navy y Carmesí".
*Nota:* En la actualidad la mayoría de estas vistas todavía operan con archivos "mock" (variables falsas) en lugar de utilizar el puente `window.api` que accede a SQLite, esto representa nuestro trabajo en curso a continuación.

---

## 🛠️ Próximos Pasos Prioritarios (Roadmap)

Lo que debemos atacar inmediatamente basados en este estado:

1. **Reemplazar variables MOCK por SQLite:** Ir a la página del Punto de Venta y pedir productos reales llamando a `await window.api.getProducts()` para enlazar UI con base de datos real.
2. **Registro de Ventas (Checkout):** Programar el guardado real de la información del carrito hacia la base de datos con `window.api.createSale(...)`.
3. **Módulo de Taller:** Generar las tablas SQLite referentes a "Órdenes de Trabajo" de los clientes y crear su diseño correspondiente en React donde se pueda administrar dichos tickets.
4. **Empaquetado Final Autorizado:** Una vez conectados los datos reales, asegurar una compilación correcta a archivos `.exe` con `npm run build`.
