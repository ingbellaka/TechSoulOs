import { supabase } from '../lib/supabase'

const TABLES = {
  faq: 'faq',
  promociones: 'promociones',
  plantillas: 'plantillas_respuesta',
  configuracion: 'configuracion_negocio',
  auditoria: 'auditoria'
}

function assertOk(result, fallback) {
  if (result?.error) throw new Error(result.error.message || fallback)
  return result?.data ?? null
}

export const knowledgeRepository = {
  async list(tipo, { activo, categoria } = {}) {
    const table = TABLES[tipo]
    if (!table) throw new Error(`Repositorio no disponible: ${tipo}`)
    let query = supabase.from(table).select('*')
    if (activo !== undefined) query = query.eq('activo', activo)
    if (categoria) query = query.eq('categoria', categoria)
    return assertOk(await query.order('id', { ascending: false }), `No se pudo consultar ${tipo}`) || []
  },

  async create(tipo, payload) {
    const table = TABLES[tipo]
    return assertOk(await supabase.from(table).insert(payload).select('*').single(), `No se pudo crear ${tipo}`)
  },

  async update(tipo, id, payload) {
    const table = TABLES[tipo]
    return assertOk(await supabase.from(table).update({ ...payload, actualizado_en: new Date().toISOString() }).eq('id', id).select('*').single(), `No se pudo actualizar ${tipo}`)
  },

  async remove(tipo, id) {
    const table = TABLES[tipo]
    assertOk(await supabase.from(table).delete().eq('id', id), `No se pudo eliminar ${tipo}`)
    return true
  },

  async getBusinessConfig() {
    const result = await supabase.from(TABLES.configuracion).select('*').order('id').limit(1).maybeSingle()
    return assertOk(result, 'No se pudo cargar la configuración')
  },

  async saveBusinessConfig(payload) {
    const current = await this.getBusinessConfig()
    if (current?.id) return this.update('configuracion', current.id, payload)
    return this.create('configuracion', payload)
  },

  async log(entry) {
    try {
      return await this.create('auditoria', {
        modulo: entry.modulo || 'sistema',
        accion: entry.accion || 'consulta',
        entidad: entry.entidad || null,
        entidad_id: entry.entidad_id == null ? null : String(entry.entidad_id),
        usuario_id: entry.usuario_id || null,
        usuario_nombre: entry.usuario_nombre || null,
        detalle: entry.detalle || {}
      })
    } catch (error) {
      console.warn('No fue posible registrar auditoría:', error.message)
      return null
    }
  }
}
