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

    /**
     * Devuelve el producto o null si no existe. No lanza "not found":
     * el caller frecuentemente quiere distinguir 404 de error real y el
     * patron null es mas simple que un error tipado para un read sync.
     *
     * @param {number} id
     * @returns {import('./products.repository.js').ProductRow | null}
     */
    getById(id) {
      if (!Number.isInteger(id) || id <= 0) {
        throw Object.assign(new Error(`product id invalido: ${id}`), {
          code: 'PRODUCT_INVALID_ID',
        })
      }
      const row = repo.findById(id)
      return row ?? null
    },
  }
}
