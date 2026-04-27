const VALID_CATEGORIES = [
  'renta', 'servicios', 'sueldos', 'insumos', 'transporte',
  'mantenimiento', 'publicidad', 'impuestos', 'otros',
]
const VALID_METHODS = ['cash', 'transfer', 'card', 'check']

/** @param {ReturnType<typeof import('./expenses.repository.js').createExpensesRepository>} repo */
export function createExpensesService(repo) {
  function validate(input) {
    if (!input.description?.trim()) {
      throw Object.assign(new Error('La descripción es requerida'), { code: 'EXP_INVALID' })
    }
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw Object.assign(new Error('El monto debe ser mayor a 0'), { code: 'EXP_INVALID' })
    }
  }

  function today() {
    return new Date().toISOString().slice(0, 10)
  }

  return {
    list(opts = {}) {
      if (opts.from && opts.to) return repo.findByRange(opts.from, opts.to)
      return repo.findAll()
    },

    getById(id) {
      const row = repo.findById(id)
      if (!row) throw Object.assign(new Error(`Gasto ${id} no encontrado`), { code: 'EXP_NOT_FOUND' })
      return row
    },

    create(input) {
      validate(input)
      const id = repo.create({
        category:       VALID_CATEGORIES.includes(input.category) ? input.category : 'otros',
        description:    input.description.trim(),
        amount:         input.amount,
        payment_method: VALID_METHODS.includes(input.payment_method) ? input.payment_method : 'cash',
        expense_date:   input.expense_date || today(),
        notes:          input.notes?.trim() || null,
        created_by:     input.created_by ?? null,
        created_by_name: input.created_by_name ?? null,
      })
      return repo.findById(id)
    },

    update(id, input) {
      validate(input)
      const existing = repo.findById(id)
      if (!existing) throw Object.assign(new Error(`Gasto ${id} no encontrado`), { code: 'EXP_NOT_FOUND' })
      repo.update(id, {
        category:       VALID_CATEGORIES.includes(input.category) ? input.category : 'otros',
        description:    input.description.trim(),
        amount:         input.amount,
        payment_method: VALID_METHODS.includes(input.payment_method) ? input.payment_method : 'cash',
        expense_date:   input.expense_date || existing.expense_date,
        notes:          input.notes?.trim() || null,
      })
      return repo.findById(id)
    },

    remove(id) {
      const existing = repo.findById(id)
      if (!existing) throw Object.assign(new Error(`Gasto ${id} no encontrado`), { code: 'EXP_NOT_FOUND' })
      repo.remove(id)
      return true
    },

    summary(from, to) {
      const f = from || today()
      const t = to   || today()
      return {
        ...repo.getSummary(f, t),
        byCategory: repo.getByCategory(f, t),
      }
    },

    categories: () => VALID_CATEGORIES,
  }
}
