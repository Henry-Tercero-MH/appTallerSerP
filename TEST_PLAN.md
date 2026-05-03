# Plan de Pruebas de Software (SQA) - TallerPOS

Este documento define la estrategia automatizada de Aseguramiento de Calidad (QA) para la aplicación de punto de venta *TallerPOS*.

## Enfoque (Testing Automatizado)

Ya que TallerPOS utiliza SQLite intensivamente a través del proceso Main (Node.js) con IPC, nos enfocaremos en validar la lógica core de los repositorios sin intervenir en la UI del navegador local.

### Fases del SQA

1. **Análisis Estático (Verificación de Calidad de Código)** 🧹
   - Ejecución del linter para convenciones y errores sintácticos (`npm run lint`).
   - Verificación de Typescript-JSDoc para prevención de errores de tipos en JS (`npm run typecheck`).

2. **Pruebas de Integración (Backend de Base de Datos - `better-sqlite3`)** 💾
   - Crear y montar una base de datos provisional de pruebas.
   - Probar y verificar que las migraciones son aplicadas correctamente.
   - Ejecutar pruebas básicas CRUD: Creación, lectura y soft-delete de Modelos (p.ej., Categorías, Productos, Ventas, Backups).

3. **Análisis de Vulnerabilidades (Seguridad)** 🔒
   - Escaneo básico del árbol de dependencias buscando paquetes rotos o vulnerables.

---

## Resultados y Plan de Acción (Resolución de Hallazgos SQA)

Derivado de la primera ejecución del SQA, se han detectado fallos que comprometen la solidez (tipos) y la consistencia de datos (duplicados). A continuación, el plan estructurado para su corrección:

### 🔴 Tarea 1: Consistencia en Base de Datos (Prioridad: Alta)
**Problema:** La validación CRUD permitió registrar dos clientes con el mismo número de NIT debido a la falta de restricciones en la base de datos.
**Acción:** 
- Crear una nueva migración (ej. `006_unique_customer_nit.sql`) que altere la tabla `customers` u obligue a que la columna `nit` posea la restricción `UNIQUE`.
- Asegurar que la lógica de inserción atrape el error `UNIQUE constraint failed` desde SQLite y lo devuelva a la interfaz (UI) como un aviso amigable ("Este NIT ya está registrado") en lugar de generar un error de red.

### 🟡 Tarea 2: Completar Interfaz de Tipos (JSDoc/TypeScript) (Prioridad: Media)
**Problema:** El análisis estático reportó que muchos canales IPC utilizados en la interfaz (`window.api.expenses`, `window.api.returns`, `window.api.inventory`, `window.api.quotes`, etc.) no están declarados en el archivo `frontend/renderer/types/api.d.ts`.
**Acción:**
- Mapear las funciones expuestas en el archivo de registro IPC (`register.js`) y plasmarlas formalmente bajo la interfaz `RendererApi` dentro de `api.d.ts`.

### 🟡 Tarea 3: Resolver Parámetros y Estados sin Tipo (`any` Implícito) (Prioridad: Media)
**Problema:** Múltiples servicios (`expensesService.js`, `reports.js`, `usersService.js`, etc.) declaran funciones pero arrojan error por carecer de tipos básicos. El manejador de estados `cartStore.js` falló porque está actualizando una propiedad `discount` que el analizador no reconoce en su `CartState`.
**Acción:**
- Proveer directivas de JSDoc elementales (ej. `/** @param {number} id */`) en los argumentos faltantes.
- Reparar las propiedades de los *stores* (zustand) y asegurarse de que el componente exportador de PDFs (`reports.js`) identifique correctamente los tipos de parámetros y propiedades iterables en las tablas.
- Reparar los componentes de React (`QueryProvider.jsx`, `ThemeProvider.jsx`) documentando la propiedad implícita `children`.
