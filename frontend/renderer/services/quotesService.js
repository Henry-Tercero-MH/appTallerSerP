import { z } from 'zod'
import { unwrap } from './ipc.js'
import {
  quoteSchema, quoteListSchema, quoteDetailSchema, convertResultSchema,
} from '@/schemas/quotes.schema.js'

export async function listQuotes() {
  return unwrap('quotes:list', await window.api.quotes.list(), quoteListSchema)
}
export async function getQuote(id) {
  return unwrap('quotes:get', await window.api.quotes.get(id), quoteDetailSchema)
}
export async function createQuote(input) {
  return unwrap('quotes:create', await window.api.quotes.create(input), quoteSchema)
}
export async function updateQuote(id, input) {
  return unwrap('quotes:update', await window.api.quotes.update(id, input), quoteSchema)
}
export async function markSentQuote(id) {
  return unwrap('quotes:mark-sent', await window.api.quotes.markSent(id), quoteSchema)
}
export async function acceptQuote(id) {
  return unwrap('quotes:accept', await window.api.quotes.accept(id), quoteSchema)
}
export async function rejectQuote(id) {
  return unwrap('quotes:reject', await window.api.quotes.reject(id), quoteSchema)
}
export async function convertQuote(input) {
  return unwrap('quotes:convert', await window.api.quotes.convert(input), convertResultSchema)
}
export async function convertQuoteToReceivable(input) {
  return unwrap('quotes:convert-receivable', await window.api.quotes.convertReceivable(input), z.object({ quote: quoteSchema, receivable: z.any() }))
}
