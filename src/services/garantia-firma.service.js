import { supabase } from '../lib/supabase'

export function telefonoWhatsApp(v) {
  let n = String(v || '').replace(/\D/g, '')
  if (n.length === 10) n = `52${n}`
  return n
}

export async function asegurarFirmaGarantiaPorOrden(ordenId) {
  const { data: g, error: eg } = await supabase
    .from('garantias')
    .select('*, ordenes(*, clientes(*), equipos(*))')
    .eq('orden_id', ordenId)
    .eq('activa', true)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (eg) throw eg
  if (!g) return null

  // Una garantía/orden debe reutilizar SIEMPRE el mismo registro remoto.
  // Priorizamos el ya firmado; si no existe, reutilizamos el pendiente más antiguo.
  const { data: existentes, error: ee } = await supabase
    .from('garantia_firmas_remotas')
    .select('*')
    .eq('garantia_id', g.id)
    .order('firmado_en', { ascending: false, nullsFirst: false })
    .order('id', { ascending: true })

  if (ee) throw ee

  const firmado = (existentes || []).find(
    x => x.firmado_en && x.firma_data_url && x.acepto_condiciones
  )
  if (firmado) return firmado

  const pendiente = (existentes || []).find(x => !x.firmado_en)
  if (pendiente) return pendiente

  if ((existentes || []).length) return existentes[0]

  const equipo = [g.ordenes?.equipos?.marca, g.ordenes?.equipos?.modelo].filter(Boolean).join(' ') || 'Equipo'
  const payload = {
    garantia_id: g.id,
    orden_id: g.orden_id,
    token: crypto.randomUUID(),
    folio_garantia: `GAR-${String(g.id).padStart(4, '0')}`,
    cliente_nombre: g.ordenes?.clientes?.nombre || '',
    cliente_telefono: g.ordenes?.clientes?.telefono || g.ordenes?.clientes?.whatsapp || '',
    equipo,
    serie: g.ordenes?.equipos?.serie || g.ordenes?.equipos?.numero_serie || null,
    servicio: g.tipo_servicio || g.ordenes?.trabajo_realizado || 'Servicio realizado',
    dias_garantia: Number(g.dias_garantia || 0),
    condiciones: g.condiciones || '',
    fecha_emision: new Date().toISOString()
  }
  const { data, error } = await supabase.from('garantia_firmas_remotas').insert(payload).select('*').single()
  if (error) throw error
  return data
}

export function linkFirmaGarantia(firma) {
  return firma?.token ? `${window.location.origin}/firma-garantia/${firma.token}` : ''
}

export function abrirWhatsAppFirma(firma) {
  if (!firma) return false
  const tel = telefonoWhatsApp(firma.cliente_telefono)
  if (!tel) throw new Error('El cliente no tiene un teléfono registrado.')
  const link = linkFirmaGarantia(firma)
  const nombre = String(firma.cliente_nombre || '').trim().split(' ')[0]
  const mensaje = `Hola${nombre ? ` ${nombre}` : ''} 👋 Tu equipo ya está listo en TechSoul. 💙\n\nTe compartimos tu garantía digital. Por favor revisa las condiciones y firma de conformidad desde el siguiente enlace:\n\n${link}\n\n¡Gracias por confiar en TechSoul!`
  window.open(`https://wa.me/${tel}?text=${encodeURIComponent(mensaje)}`, '_blank', 'noopener,noreferrer')
  return true
}
