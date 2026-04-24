export const APP_NAME = 'SerProMec';

export const ROUTES = {
  LOGIN: '/login',
  DASHBOARD: '/',
  POS: '/ventas',
  WORKSHOP: '/taller',
  INVENTORY: '/inventario',
  CLIENTS: '/clientes',
  WAREHOUSES: '/bodegas', // Mantenido para retrocompatibilidad interna de components si es necesario
  PRODUCTS: '/productos',
};

export const ROLES = {
  ADMIN: 'admin',
  MANAGER: 'warehouse_manager',
  VIEWER: 'viewer',
};
