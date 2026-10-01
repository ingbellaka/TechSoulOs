import { supabase } from '../lib/supabase'

export function telefonoComparable(valor) {
  const n = String(valor || '').replace(/\D/g, '')
  return n.length === 12 && n.startsWith('52') ? n.slice(2) : n
}

export async function listarClientesAgenda() {
  const clientes = []
  for (let pagina = 0; ; pagina++) {
    const { data, error } = await supabase.from('clientes').select('id,nombre,telefono,whatsapp').order('id').range(pagina * 1000, pagina * 1000 + 999)
    if (error) throw error
    clientes.push(...(data || []))
    if (!data || data.length < 1000) return clientes.sort((a,b) => a.nombre.localeCompare(b.nombre))
  }
}

export async function resolverClienteAgenda(datos) {
  if (datos.cliente_id) {
    const { data, error } = await supabase.from('clientes').select('id,nombre,telefono,whatsapp').eq('id', datos.cliente_id).single()
    if (error) throw error
    return data
  }
  const nombre = String(datos.nombre_cliente || '').trim()
  const telefono = telefonoComparable(datos.telefono)
  if (nombre.length < 2) throw new Error('Captura el nombre del cliente.')
  if (!/^\d{10}$/.test(telefono)) throw new Error('El teléfono debe tener exactamente 10 dígitos o selecciona un cliente existente.')
  const existentes = await listarClientesAgenda()
  const coincidencias = existentes.filter(c => [c.telefono,c.whatsapp].some(n => telefonoComparable(n) === telefono))
  if (coincidencias.length > 1) throw new Error('Hay varios clientes con ese teléfono. Selecciona el cliente correcto en Agenda.')
  if (coincidencias.length === 1) {
    const c = coincidencias[0]
    if (c.nombre.trim().toLowerCase() !== nombre.toLowerCase()) throw new Error(`Ese teléfono ya pertenece a ${c.nombre}. Selecciónalo en Agenda si es la misma persona.`)
    return c
  }
  const { data, error } = await supabase.from('clientes').insert({ nombre, telefono, whatsapp: telefono }).select('id,nombre,telefono,whatsapp').single()
  if (error) throw error
  return data
}
