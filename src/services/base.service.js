import { dataClient } from '../repositories/client'

/** Base para servicios de dominio. Nuevos módulos deben usar servicios y no
 * acceder directamente a localStorage o Supabase desde las vistas. */
export class BaseService {
  constructor(table) {
    this.table = table
  }

  list({ orderBy = 'id', ascending = false } = {}) {
    return dataClient.from(this.table).select('*').order(orderBy, { ascending })
  }

  getById(id) {
    return dataClient.from(this.table).select('*').eq('id', id).single()
  }

  create(payload) {
    return dataClient.from(this.table).insert(payload).select().single()
  }

  update(id, payload) {
    return dataClient.from(this.table).update(payload).eq('id', id).select().single()
  }

  remove(id) {
    return dataClient.from(this.table).delete().eq('id', id)
  }
}
