import { z } from 'zod'
import { unwrap } from './ipc.js'

const any = z.any()

export const listExpenses      = async (opts)        => unwrap('expenses:list',       await window.api.expenses.list(opts),        any)
export const getExpense        = async (id)          => unwrap('expenses:get',        await window.api.expenses.get(id),           any)
export const createExpense     = async (input)       => unwrap('expenses:create',     await window.api.expenses.create(input),     any)
export const updateExpense     = async (id, input)   => unwrap('expenses:update',     await window.api.expenses.update(id, input), any)
export const removeExpense     = async (id)          => unwrap('expenses:remove',     await window.api.expenses.remove(id),        any)
export const getExpenseSummary = async (from, to)    => unwrap('expenses:summary',    await window.api.expenses.summary(from, to), any)
export const getCategories     = async ()            => unwrap('expenses:categories', await window.api.expenses.categories(),      any)
