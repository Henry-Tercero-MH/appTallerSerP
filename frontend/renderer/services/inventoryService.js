import { z } from 'zod'
import { unwrap } from './ipc.js'

const any = z.any()

export const getStock      = async ()      => unwrap('inventory:stock',     await window.api.inventory.stock(),          any)
export const getMovements  = async (opts)  => unwrap('inventory:movements', await window.api.inventory.movements(opts),  any)
export const adjustStock   = async (input) => unwrap('inventory:adjust',    await window.api.inventory.adjust(input),    any)
