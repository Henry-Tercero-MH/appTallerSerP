# Sistema de Gestión de Taller y Ventas → ERP (Desktop Offline)

> Documento de arquitectura, contexto del proyecto e instrucciones de inicio.

---

## Arquitectura General

El sistema ha evolucionado de una arquitectura web tradicional a una **Aplicación de Escritorio Offline** robusta utilizando **Electron**, garantizando que pueda funcionar en cualquier PC sin necesidad de internet, servidores locales externos o Docker.

```text
[Aplicación de Escritorio (Electron)]
│
├── Proceso Main (Node.js)
│   ├── Gestión del ciclo de vida de la App
│   ├── Base de Datos Local (SQLite)
│   └── Controladores IPC (Eventos del sistema)
│
├── IPC Bridge (Seguridad / Preload)
│   └── window.api (Puente de comunicación seguro)
│
└── Proceso Renderer (React + Vite + Tailwind CSS)
    └── Interfaz de Usuario (UI) reactiva
```

## Base de Datos (SQLite)

Se utiliza **SQLite** (vía `better-sqlite3`) para almacenar toda la información.  
El archivo de la base de datos (`taller_pos.sqlite`) se crea de forma automática en la carpeta segura de datos del sistema operativo del usuario (`AppData/Roaming` en Windows, `~/.config` en Linux), de modo que los datos persisten y no se pierden aunque se actualice el ejecutable de la aplicación.

---

## 🚀 Cómo iniciar el proyecto

Sigue estos pasos para arrancar el entorno de programación o generar los ejecutables.

### Requisitos previos
* **Node.js** instalado en tu computadora de desarrollo.

### 1. Entorno de Desarrollo (Para editar el código)

Abre una terminal, navega a la subcarpeta del proyecto e instala las dependencias:

```bash
cd frontend
npm install
```

**Paso Crítico:** Debido a que SQLite utiliza código nativo en C++, necesitas compilarlo específicamente para el entorno que usa Electron (que tiene su propia versión interna de Node).
```bash
npx electron-rebuild -f -w better-sqlite3
```

Finalmente, levanta el entorno de desarrollo (React + Electron):
```bash
npm run dev
```

---

### 2. Generar el Ejecutable (Para instalar en otra computadora)

Si quieres probar o instalar la aplicación en la máquina del taller de mecánica o en otra PC que **no tiene Node.js**, debes compilar el código fuente en un ejecutable (`.exe` para Windows, `.AppImage`/.deb para Linux).

Ejecuta este comando en la terminal (siempre dentro de la carpeta `frontend/`):

```bash
npm run build
```

**¿Qué hace este comando?**
1. Empaqueta todo tu código visual de React.
2. Compila el código del proceso oculto de Electron (la base de datos, sistema de archivos).
3. `electron-builder` toma esos dos pasos y genera un archivo instalador usando las configuraciones indicadas en tu `package.json`.

Al finalizar el proceso, se generará una carpeta `dist/` resultante. Dentro de ella encontrarás el archivo ejecutable (`.exe` o análogo). ¡Ese único archivo autoinstalable es el que debes transferir a la nueva computadora usando una memoria USB u otro medio!

---

## Estructura de Carpetas Actual

```text
apptaller/
└── frontend/
    ├── package.json          ← Scripts de ejecución y configuración de build
    ├── vite.config.js        ← Configuración del empaquetador Vite/Electron
    ├── main/                 ← Lógica backend (Node.js) de Electron
    │   ├── index.js          ← Punto de entrada de la aplicación desktop
    │   └── preload.js        ← Puente de seguridad IPC
    ├── ipc/                  ← Handlers (Operaciones a la base de datos)
    │   └── handlers.js       
    ├── database/             ← Inicialización de los datos locales (SQLite)
    │   └── index.js
    └── renderer/             ← El Frontend en React (Antiguamente src/)
        ├── components/
        ├── features/
        ├── App.jsx
        └── main.jsx
```
