import { useState } from 'react';
import { MOCK_WAREHOUSES } from '../../lib/mockData';

let nextId = 100;

export function useWarehouseStore() {
  const [warehouses, setWarehouses] = useState(MOCK_WAREHOUSES);

  function getAll() {
    return warehouses;
  }

  function create(data) {
    const newItem = {
      ...data,
      id: String(++nextId),
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    setWarehouses((prev) => [newItem, ...prev]);
    return newItem;
  }

  function update(id, data) {
    setWarehouses((prev) =>
      prev.map((w) => (w.id === id ? { ...w, ...data } : w))
    );
  }

  function remove(id) {
    // Soft delete — igual que la DB
    setWarehouses((prev) =>
      prev.map((w) => (w.id === id ? { ...w, isActive: false } : w))
    );
  }

  function restore(id) {
    setWarehouses((prev) =>
      prev.map((w) => (w.id === id ? { ...w, isActive: true } : w))
    );
  }

  return { warehouses, getAll, create, update, remove, restore };
}
