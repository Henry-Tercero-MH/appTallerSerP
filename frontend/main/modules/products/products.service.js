/**
 * Capa de negocio de products. Hoy es delgada porque los handlers originales
 * no tenian logica: aqui solo validamos entrada y delegamos al repo.
 * Las reglas de inventario (ej. allow_negative_stock) iran aqui en prompts
 * siguientes.
 *
 * @param {ReturnType<typeof import('./products.repository.js').createProductsRepository>} repo
 */
export function createProductsService(repo) {
  return {
    list() {
      return repo.findAll()
    },

    /**
     * @param {string} query
     */
    search(query) {
      const q = typeof query === 'string' ? query.trim() : ''
      if (q.length === 0) return repo.findAll()
      return repo.search(q)
    },
  }
}
