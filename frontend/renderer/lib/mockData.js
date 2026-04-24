// Mock data — reemplazar con llamadas reales a la API en fase 2

export const MOCK_USERS = [
  {
    id: '1',
    email: 'admin@empresa.com',
    password: 'admin123',
    fullName: 'Administrador',
    role: 'admin',
  },
  {
    id: '2',
    email: 'bodega@empresa.com',
    password: 'bodega123',
    fullName: 'Juan Pérez',
    role: 'warehouse_manager',
  },
];

export const MOCK_WAREHOUSES = [
  {
    id: '1',
    code: 'BDG-001',
    name: 'Bodega Central',
    description: 'Bodega principal de repuestos y suministros',
    address: 'Sede Principal, Planta Baja',
    isActive: true,
    createdAt: '2024-01-10T08:00:00Z',
  },
  {
    id: '2',
    code: 'BDG-002',
    name: 'Bodega Norte (Lubricantes)',
    description: 'Almacenamiento exclusivo para aceites, refrigerantes y químicos',
    address: 'Sede Norte, Galpón B',
    isActive: true,
    createdAt: '2024-02-15T09:30:00Z',
  },
  {
    id: '3',
    code: 'BDG-003',
    name: 'Bodega Temporal',
    description: 'Bodega utilizada para transiciones y equipos obsoletos',
    address: 'Sede Sur',
    isActive: false,
    createdAt: '2023-11-20T11:00:00Z',
  },
];

// Productos reales del taller SERPROMEC TALLER N-1
export const MOCK_PRODUCTS = [
  // ── Aceites y lubricantes ──────────────────────────
  {
    id: '1', code: '8-42071-00522-1', category: 'Aceites y lubricantes',
    name: 'Aceite de motor', description: 'SAE 20W50 galón',
    price: 250, location: 'E-3/AP2', brand: 'Chevron', condition: 'Nuevo',
    stock: 1, isActive: true, createdAt: '2024-01-15T10:00:00Z',
  },
  {
    id: '2', code: '8-42071-00360-9', category: 'Aceites y lubricantes',
    name: 'Aceite de catarina', description: 'SAE 80W90 galón',
    price: 280, location: 'E-3/AP2', brand: 'Chevron', condition: 'Nuevo',
    stock: 4, isActive: true, createdAt: '2024-01-15T10:00:00Z',
  },
  {
    id: '3', code: '0-85051-00953-0', category: 'Aceites y lubricantes',
    name: 'Aceite de motor', description: '1 litro SAE 40',
    price: 30, location: 'E-3/AP3', brand: 'American', condition: 'Nuevo',
    stock: 5, isActive: true, createdAt: '2024-01-15T10:00:00Z',
  },

  // ── Frenos e hidráulico ───────────────────────────
  {
    id: '4', code: '0-790920-027613', category: 'Frenos e hidráulico',
    name: 'Líquido de freno', description: 'Heavy DOT 3',
    price: 25, location: 'E-3/AP3', brand: 'ABRO', condition: 'Nuevo',
    stock: 1, isActive: true, createdAt: '2024-01-15T10:00:00Z',
  },
  {
    id: '5', code: '0-81905-00714-1', category: 'Frenos e hidráulico',
    name: 'Líquido de freno', description: 'Galón DOT 3 sintético',
    price: 25, location: 'E-3/AP5', brand: 'STI', condition: 'Antiguo',
    stock: 7, isActive: true, createdAt: '2024-01-15T10:00:00Z',
  },

  // ── Filtros ───────────────────────────────────────
  {
    id: '6', code: '90915-03001', category: 'Filtros',
    name: 'Filtro de aceite', description: '3001 ó 4967',
    price: 30, location: 'E-3/AP4', brand: 'AUTOX', condition: 'Nuevo',
    stock: 10, isActive: true, createdAt: '2024-01-15T10:00:00Z',
  },
  {
    id: '7', code: 'PH2840', category: 'Filtros',
    name: 'Filtro de aceite', description: '2840 ó 4967',
    price: 30, location: 'E-3/AP4', brand: 'ECOBREX', condition: 'Nuevo',
    stock: 0, isActive: true, createdAt: '2024-01-15T10:00:00Z',
  },
  {
    id: '8', code: 'PH7317', category: 'Filtros',
    name: 'Filtro de aceite', description: 'Filtro 7317',
    price: 30, location: 'E-3/AP4', brand: 'AUTOX', condition: 'Nuevo',
    stock: 4, isActive: true, createdAt: '2024-01-15T10:00:00Z',
  },
  {
    id: '9', code: 'CH-10358', category: 'Filtros',
    name: 'Filtro de aceite', description: 'Filtro 10358',
    price: 40, location: 'E-3/AP4', brand: 'AUTOX', condition: 'Nuevo',
    stock: 2, isActive: true, createdAt: '2024-01-15T10:00:00Z',
  },
  {
    id: '10', code: 'PH-3614', category: 'Filtros',
    name: 'Filtro de aceite', description: 'Filtro 3614',
    price: 30, location: 'E-3/AP4', brand: 'AUTOX', condition: 'Nuevo',
    stock: 6, isActive: true, createdAt: '2024-01-15T10:00:00Z',
  },
  {
    id: '11', code: '7-65809-33675-9', category: 'Filtros',
    name: 'Filtro de agua', description: '33675 / 533675',
    price: 30, location: 'E-3/AP5', brand: 'WIX', condition: 'Seminuevo',
    stock: 7, isActive: true, createdAt: '2024-01-15T10:00:00Z',
  },

  // ── Bujías y encendido ────────────────────────────
  {
    id: '12', code: '0-87295-12603-5', category: 'Bujías y encendido',
    name: 'Candela / Bujía', description: 'De 13/16 — BPR5ES',
    price: 25, location: 'E-3/AP3', brand: 'NGK', condition: 'Nuevo',
    stock: 0, isActive: true, createdAt: '2024-01-15T10:00:00Z',
  },
  {
    id: '13', code: '0-87295-13524-2', category: 'Bujías y encendido',
    name: 'Candela / Bujía', description: 'De 5/8 — BCPR5ES-11',
    price: 25, location: 'E-3/AP3', brand: 'NGK', condition: 'Nuevo',
    stock: 12, isActive: true, createdAt: '2024-01-15T10:00:00Z',
  },

  // ── Químicos y aerosoles ──────────────────────────
  {
    id: '14', code: '0-790920-045228', category: 'Químicos y aerosoles',
    name: 'Silicón gris', description: 'RTV Grey 999',
    price: 30, location: 'E-3/AP2', brand: 'ABRO', condition: 'Nuevo',
    stock: 10, isActive: true, createdAt: '2024-01-15T10:00:00Z',
  },
  {
    id: '15', code: '0-76906-45050-8', category: 'Químicos y aerosoles',
    name: 'Silicón gris', description: 'Premium Grey',
    price: 30, location: 'E-3/AP2', brand: 'BARDHAL', condition: 'Nuevo',
    stock: 0, isActive: true, createdAt: '2024-01-15T10:00:00Z',
  },
  {
    id: '16', code: '0-790920-221035', category: 'Químicos y aerosoles',
    name: 'Carbucleaner', description: '12 oz. Limpiador de carburador',
    price: 35, location: 'E-3/AP3', brand: 'ABRO', condition: 'Nuevo',
    stock: 0, isActive: true, createdAt: '2024-01-15T10:00:00Z',
  },
  {
    id: '17', code: '4-260610-399925', category: 'Químicos y aerosoles',
    name: 'Limpiacontactos', description: '450ml. Limpiador de contactos',
    price: 35, location: 'E-3/AP3', brand: 'SENFINECO', condition: 'Nuevo',
    stock: 3, isActive: true, createdAt: '2024-01-15T10:00:00Z',
  },
  {
    id: '18', code: '0-79567-52008-5', category: 'Químicos y aerosoles',
    name: 'Multiusos / WD-40', description: 'WD-40 8 oz',
    price: 55, location: 'E-3/AP4', brand: 'WD-40', condition: 'Nuevo',
    stock: 10, isActive: true, createdAt: '2024-01-15T10:00:00Z',
  },

  // ── Refrigeración ─────────────────────────────────
  {
    id: '19', code: '7-60896-11535-5', category: 'Refrigeración',
    name: 'Refrigerante', description: 'Verde CAR KOOL galón',
    price: 50, location: 'E-3/AP5', brand: 'PRODIN', condition: 'Nuevo',
    stock: 8, isActive: true, createdAt: '2024-01-15T10:00:00Z',
  },
  {
    id: '20', code: '0-85051-00305-7', category: 'Refrigeración',
    name: 'Refrigerante', description: 'Radiador refrigerante verde',
    price: 45, location: 'E-3/AP5', brand: 'SUPERS', condition: 'Antiguo',
    stock: 0, isActive: true, createdAt: '2024-01-15T10:00:00Z',
  },

  // ── Eléctrico ─────────────────────────────────────
  {
    id: '21', code: '7-506240-618546', category: 'Eléctrico',
    name: 'Terminales', description: 'Par de terminales de plomo',
    price: 30, location: 'E-3/AP4', brand: 'PRETUL', condition: 'Nuevo',
    stock: 9, isActive: true, createdAt: '2024-01-15T10:00:00Z',
  },
];

export const MOCK_MOVEMENTS = [
  {
    id: 'm1', productId: '1', productName: 'Aceite de motor (20W50)',
    type: 'entry', qty: 3, notes: 'Compra inicial', createdAt: '2024-03-01T09:00:00Z',
  },
  {
    id: 'm2', productId: '1', productName: 'Aceite de motor (20W50)',
    type: 'exit', qty: 2, notes: 'Servicio vehículo placa P-123', createdAt: '2024-03-10T14:30:00Z',
  },
  {
    id: 'm3', productId: '4', productName: 'Líquido de freno DOT 3',
    type: 'exit', qty: 1, notes: 'Cambio de frenos cliente', createdAt: '2024-03-15T11:00:00Z',
  },
  {
    id: 'm4', productId: '8', productName: 'Filtro de aceite 7317',
    type: 'exit', qty: 2, notes: 'Servicio de mantenimiento', createdAt: '2024-03-18T09:45:00Z',
  },
];
