import { supabase } from '../lib/supabase'

const ok = (result, message) => {
  if (result?.error) throw new Error(result.error.message || message)
  return result?.data ?? null
}

export const agentRepository = {
  async getConfig() {
    return ok(await supabase.from('configuracion_agente_ia').select('*').order('id').limit(1).maybeSingle(), 'No se pudo cargar el agente')
  },
  async saveConfig(payload) {
    const current = await this.getConfig().catch(() => null)
    if (current?.id) return ok(await supabase.from('configuracion_agente_ia').update({ ...payload, actualizado_en: new Date().toISOString() }).eq('id', current.id).select('*').single(), 'No se pudo guardar el agente')
    return ok(await supabase.from('configuracion_agente_ia').insert(payload).select('*').single(), 'No se pudo crear el agente')
  },
  async getContext() {
    const [config, faq, promos, plantillas, servicios, productos, aprobadas] = await Promise.all([
      supabase.from('configuracion_negocio').select('*').order('id').limit(1).maybeSingle(),
      supabase.from('faq').select('*').eq('activo', true).order('prioridad', { ascending: false }),
      supabase.from('promociones').select('*').eq('activo', true),
      supabase.from('plantillas_respuesta').select('*').eq('activo', true),
      supabase.from('catalogo_servicios').select('*').eq('activo', true),
      supabase.from('productos').select('*'),
      supabase.from('respuestas_aprobadas_ia').select('*').eq('activo', true)
    ])
    return {
      negocio: config.data || null,
      faq: faq.data || [], promociones: promos.data || [], plantillas: plantillas.data || [],
      servicios: servicios.data || [], productos: productos.data || [], aprobadas: aprobadas.data || []
    }
  },
  async createConversation() {
    return ok(await supabase.from('conversaciones_ia').insert({ canal: 'simulador', estado: 'abierta' }).select('*').single(), 'No se pudo iniciar la conversación')
  },
  async addMessage(payload) {
    return ok(await supabase.from('mensajes_ia').insert(payload).select('*').single(), 'No se pudo guardar el mensaje')
  },
  async listConversations() {
    return ok(await supabase.from('conversaciones_ia').select('*').order('creado_en', { ascending: false }).limit(50), 'No se pudo consultar el historial') || []
  },
  async listMessages(conversationId) {
    return ok(await supabase.from('mensajes_ia').select('*').eq('conversacion_id', conversationId).order('creado_en'), 'No se pudieron consultar los mensajes') || []
  },
  async approve(payload) {
    return ok(await supabase.from('respuestas_aprobadas_ia').insert(payload).select('*').single(), 'No se pudo aprobar la respuesta')
  }
}
