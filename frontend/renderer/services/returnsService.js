import { z } from 'zod'
import { unwrap } from './ipc.js'

const any = z.any()

export const listReturns      = async ()        => unwrap('returns:list',         await window.api.returns.list(),           any)
export const listReturnsBySale= async (saleId)  => unwrap('returns:list-by-sale', await window.api.returns.listBySale(saleId), any)
export const getReturn        = async (id)      => unwrap('returns:get',          await window.api.returns.get(id),          any)
export const createReturn     = async (input)   => unwrap('returns:create',       await window.api.returns.create(input),    any)
