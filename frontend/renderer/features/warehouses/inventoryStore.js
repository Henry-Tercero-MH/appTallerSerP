import { useState, useMemo } from 'react';
import { MOCK_PRODUCTS, MOCK_MOVEMENTS } from '../../lib/mockData';

let nextProductId = 100;
let nextMovementId = 100;

export function useInventoryStore() {
  const [products, setProducts] = useState(MOCK_PRODUCTS.map(p => ({ ...p, minStock: p.minStock || 5 })));
  const [movements, setMovements] = useState(MOCK_MOVEMENTS);

  function getProducts() {
    return products;
  }

  function getMovements() {
    return movements;
  }

  function getProduct(id) {
    return products.find(p => p.id === id);
  }

  function createProduct(data) {
    const newItem = {
      ...data,
      id: String(++nextProductId),
      isActive: true,
      stock: Number(data.stock) || 0,
      createdAt: new Date().toISOString(),
    };
    setProducts(prev => [newItem, ...prev]);
    return newItem;
  }

  function updateProduct(id, data) {
    setProducts(prev =>
      prev.map(p => (p.id === id ? { ...p, ...data, stock: data.stock !== undefined ? Number(data.stock) : p.stock } : p))
    );
  }

  function removeProduct(id) {
    setProducts(prev =>
      prev.map(p => (p.id === id ? { ...p, isActive: false } : p))
    );
  }

  function restoreProduct(id) {
    setProducts(prev =>
      prev.map(p => (p.id === id ? { ...p, isActive: true } : p))
    );
  }

  function addMovement({ productId, type, qty, notes }) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    
    // Convert qty to number
    const numQty = Number(qty);

    const newMovement = {
      id: 'm' + (++nextMovementId),
      productId,
      productName: product.name,
      type,
      qty: numQty,
      notes,
      createdAt: new Date().toISOString()
    };

    setMovements(prev => [newMovement, ...prev]);

    // Update stock
    const diff = type === 'entry' ? numQty : -numQty;
    setProducts(prev =>
      prev.map(p => p.id === productId ? { ...p, stock: Math.max(0, p.stock + diff) } : p)
    );
  }

  const lowStockProducts = useMemo(() => {
    return products.filter(p => p.isActive && p.stock <= p.minStock);
  }, [products]);

  return {
    products,
    movements,
    lowStockProducts,
    getProducts,
    getMovements,
    getProduct,
    createProduct,
    updateProduct,
    removeProduct,
    restoreProduct,
    addMovement
  };
}
