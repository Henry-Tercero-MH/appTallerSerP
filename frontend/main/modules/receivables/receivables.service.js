/** @param {ReturnType<typeof import('./receivables.repository.js').createReceivablesRepository>} repo */
export function createReceivablesService(repo) {

  return {
    list() {
      return repo.findAll()
    },

    getDetail(id) {
      const receivable = repo.findById(id)
      if (!receivable) throw Object.assign(new Error('Cuenta no encontrada'), { code: 'RECV_NOT_FOUND' })
      const payments = repo.findPayments(id)
      return { receivable, payments }
    },

    getSummary() {
      return repo.getSummary()
    },

    getPaymentsToday() {
      return repo.getPaymentsToday()
    },

    /** @param {{ from: string, to: string }} range */
    getPaymentsForRange({ from, to }) {
      return repo.getPaymentsForRange({ from, to })
    },

    /**
     * @param {{ customerId?: number, customerName: string, customerNit?: string, description: string, amount: number, dueDate?: string, notes?: string, userId: number, userName: string }} input
     */
    create(input) {
      const desc = input.description?.trim()
      if (!desc) throw Object.assign(new Error('Descripción requerida'), { code: 'RECV_MISSING_DESC' })
      if (!input.customerName?.trim()) throw Object.assign(new Error('Nombre del cliente requerido'), { code: 'RECV_MISSING_CUSTOMER' })
      const amount = Number(input.amount)
      if (isNaN(amount) || amount <= 0) throw Object.assign(new Error('Monto debe ser mayor a 0'), { code: 'RECV_INVALID_AMOUNT' })

      const id = repo.create({
        customer_id:     input.customerId   ?? null,
        customer_name:   input.customerName.trim(),
        customer_nit:    input.customerNit?.trim() || null,
        description:     desc,
        amount,
        due_date:        input.dueDate      || null,
        notes:           input.notes?.trim() || null,
        created_by:      input.userId,
        created_by_name: input.userName,
      })
      return repo.findById(id)
    },

    /**
     * @param {{ receivableId: number, amount: number, paymentMethod?: string, notes?: string, userId: number, userName: string }} input
     */
    applyPayment(input) {
      const rec = repo.findById(input.receivableId)
      if (!rec) throw Object.assign(new Error('Cuenta no encontrada'), { code: 'RECV_NOT_FOUND' })
      if (['paid', 'cancelled'].includes(rec.status)) {
        throw Object.assign(new Error('Esta cuenta ya está cerrada'), { code: 'RECV_CLOSED' })
      }
      const amount = Number(input.amount)
      if (isNaN(amount) || amount <= 0) throw Object.assign(new Error('Monto de pago inválido'), { code: 'RECV_INVALID_PAYMENT' })
      const balance = rec.amount - rec.amount_paid
      if (amount > balance + 0.001) {
        throw Object.assign(new Error(`El pago (${amount}) supera el saldo (${balance.toFixed(2)})`), { code: 'RECV_OVERPAYMENT' })
      }

      return repo.applyPayment(input.receivableId, {
        receivable_id:   input.receivableId,
        amount,
        payment_method:  input.paymentMethod || 'cash',
        notes:           input.notes?.trim() || null,
        created_by:      input.userId,
        created_by_name: input.userName,
      })
    },

    cancel(id) {
      const rec = repo.findById(id)
      if (!rec) throw Object.assign(new Error('Cuenta no encontrada'), { code: 'RECV_NOT_FOUND' })
      if (rec.status === 'paid') throw Object.assign(new Error('No se puede cancelar una cuenta ya pagada'), { code: 'RECV_CLOSED' })
      repo.cancel(id)
      return repo.findById(id)
    },

    byCustomer(customerId) {
      if (!Number.isInteger(customerId) || customerId <= 0) {
        throw Object.assign(new Error('customer_id inválido'), { code: 'RECV_INVALID_CUSTOMER' })
      }
      const rows = repo.findByCustomer(customerId)
      const active = rows.filter(r => ['pending', 'partial'].includes(r.status))
      const balance = active.reduce((s, r) => s + (r.amount - r.amount_paid), 0)
      return { rows: active, balance }
    },
  }
}
