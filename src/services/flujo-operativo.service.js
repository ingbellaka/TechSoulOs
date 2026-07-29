import { supabase } from '../lib/supabase'
import { registrarMovimientoCaja } from './integracion.service'

const now = () => new Date().toISOString()
const clean = value => String(value || '').trim()

async function buscarOCrearCliente(nombre, telefono = '') {
  const nombreLimpio = clean(nombre) || 'Cliente de mostrador'
  const telefonoLimpio = clean(telefono)
  if (telefonoLimpio) {
    const { data } = await supabase.from('clientes').select('*').eq('telefono', telefonoLimpio).maybeSingle()
    if (data) return data
  }
  const { data, error } = await supabase.from('clientes').insert({
    nombre: nombreLimpio,
    telefono: telefonoLimpio,
    whatsapp: telefonoLimpio
  }).select('*').single()
  if (error) throw new Error(error.message)
  return data
}

async function crearEquipoDesdeTexto(clienteId, equipoTexto) {
  const texto = clean(equipoTexto)
  const marcas = ['Apple', 'Samsung', 'Xiaomi', 'Motorola', 'Huawei', 'Honor', 'Oppo', 'Realme']
  const marca = marcas.find(item => texto.toLowerCase().includes(item.toLowerCase())) || (texto.toLowerCase().includes('iphone') ? 'Apple' : '')
  const modelo = marca ? texto.replace(new RegExp(marca, 'ig'), '').trim() || texto : texto
  const { data, error } = await supabase.from('equipos').insert({
    cliente_id: clienteId,
    tipo_equipo: 'Celular',
    marca,
    modelo,
    observaciones: 'Creado automáticamente desde presupuesto aprobado.'
  }).select('*').single()
  if (error) throw new Error(error.message)
  return data
}

async function siguienteFolio(tabla, prefijo, largo = 4) {
  const { data } = await supabase.from(tabla).select('id')
  const numero = Math.max(0, ...(data || []).map(row => Number(row.id) || 0)) + 1
  return `${prefijo}-${String(numero).padStart(largo, '0')}`
}

export async function guardarPresupuesto(payload, id = null) {
  const conceptos = (payload.conceptos || []).filter(c => clean(c.descripcion) && Number(c.precio || 0) >= 0)
  if (!clean(payload.cliente) || !clean(payload.equipo) || !conceptos.length) throw new Error('Captura cliente, equipo y al menos un concepto.')
  const total = conceptos.reduce((sum, c) => sum + Number(c.cantidad || 0) * Number(c.precio || 0), 0)
  const data = {
    ...payload,
    cliente: clean(payload.cliente),
    telefono: clean(payload.telefono),
    equipo: clean(payload.equipo),
    conceptos,
    total,
    actualizado_en: now()
  }
  if (id) {
    const { data: updated, error } = await supabase.from('presupuestos').update(data).eq('id', id).select('*').single()
    if (error) throw new Error(error.message)
    return updated
  }
  data.folio = data.folio || await siguienteFolio('presupuestos', 'P')
  data.creado_en = now()
  const { data: created, error } = await supabase.from('presupuestos').insert(data).select('*').single()
  if (error) throw new Error(error.message)
  return created
}

export async function cambiarEstadoPresupuesto(presupuesto, estado) {
  const { error } = await supabase.from('presupuestos').update({ estado, actualizado_en: now() }).eq('id', presupuesto.id)
  if (error) throw new Error(error.message)
}

export async function convertirPresupuestoAOrden(presupuesto) {
  if (presupuesto.orden_id) return presupuesto.orden_id
  const cliente = await buscarOCrearCliente(presupuesto.cliente, presupuesto.telefono)
  const equipo = await crearEquipoDesdeTexto(cliente.id, presupuesto.equipo)
  const folio = await siguienteFolio('ordenes', 'TS')
  const conceptos = presupuesto.conceptos || []
  const trabajo = conceptos.map(c => `${Number(c.cantidad || 1)} × ${c.descripcion}`).join('\n')
  const garantia = conceptos.map(c => c.garantia).filter(Boolean).join(' · ')
  const { data: orden, error } = await supabase.from('ordenes').insert({
    folio,
    cliente_id: cliente.id,
    equipo_id: equipo.id,
    falla_reportada: `Servicio autorizado desde presupuesto ${presupuesto.folio}`,
    diagnostico: 'Presupuesto aprobado por el cliente.',
    trabajo_realizado: trabajo,
    costo_total: Number(presupuesto.total || 0),
    anticipo: 0,
    estado: 'Autorizada',
    notas: presupuesto.notas || '',
    fecha_ingreso: now(),
    presupuesto_id: presupuesto.id,
    garantia_dias: garantia ? 90 : 0,
    garantia_condiciones: garantia
  }).select('*').single()
  if (error) throw new Error(error.message)

  await supabase.from('orden_historial').insert({
    orden_id: orden.id,
    tipo: 'conversion_presupuesto',
    titulo: 'Creada desde presupuesto',
    descripcion: `Conversión de ${presupuesto.folio}`,
    estado_nuevo: 'Autorizada'
  })
  await supabase.from('presupuestos').update({ estado: 'Convertido a orden', orden_id: orden.id, actualizado_en: now() }).eq('id', presupuesto.id)
  return orden.id
}

export async function convertirPresupuestoAVenta(presupuesto, metodoPago = 'Efectivo') {
  if (presupuesto.venta_id) return presupuesto.venta_id
  const folio = await siguienteFolio('ventas', 'V', 5)
  const { data: venta, error } = await supabase.from('ventas').insert({
    folio,
    cliente_nombre: presupuesto.cliente,
    cliente_telefono: presupuesto.telefono || '',
    total: Number(presupuesto.total || 0),
    anticipo: 0,
    pagado: 0,
    saldo: Number(presupuesto.total || 0),
    metodo_pago: metodoPago,
    estado_pago: 'Pendiente',
    estado_entrega: 'Pendiente de surtir',
    notas: `Creada desde presupuesto ${presupuesto.folio}. ${presupuesto.notas || ''}`.trim(),
    fecha_venta: now(),
    presupuesto_id: presupuesto.id
  }).select('*').single()
  if (error) throw new Error(error.message)

  const detalle = (presupuesto.conceptos || []).map(c => ({
    venta_id: venta.id,
    tipo_item: 'servicio',
    producto_id: null,
    descripcion: c.descripcion,
    cantidad: Number(c.cantidad || 1),
    precio_unitario: Number(c.precio || 0),
    subtotal: Number(c.cantidad || 1) * Number(c.precio || 0),
    costo_estimado: 0,
    proveedor: '',
    estado_entrega: 'pendiente_surtir',
    notas: c.garantia || ''
  }))
  if (detalle.length) {
    const { error: detalleError } = await supabase.from('detalle_ventas').insert(detalle)
    if (detalleError) throw new Error(detalleError.message)
  }
  await supabase.from('presupuestos').update({ estado: 'Convertido a venta', venta_id: venta.id, actualizado_en: now() }).eq('id', presupuesto.id)
  return venta.id
}

export async function registrarAbonoVenta(venta, monto, metodoPago = 'Efectivo', notas = '') {
  const valor = Number(monto || 0)
  const saldoActual = Number(venta.saldo || 0)
  if (valor <= 0) throw new Error('Captura un abono mayor a cero.')
  if (valor > saldoActual) throw new Error('El abono no puede superar el saldo pendiente.')
  const pagado = Number(venta.pagado || 0) + valor
  const saldo = Math.max(0, Number(venta.total || 0) - pagado)
  const { error } = await supabase.from('ventas').update({
    pagado,
    anticipo: pagado,
    saldo,
    estado_pago: saldo === 0 ? 'Pagado' : 'Parcial'
  }).eq('id', venta.id)
  if (error) throw new Error(error.message)
  await registrarMovimientoCaja({
    tipo: 'Entrada',
    concepto: saldo === 0 ? `Liquidación venta ${venta.folio}` : `Abono venta ${venta.folio}`,
    monto: valor,
    metodoPago,
    referenciaTipo: 'venta_abono',
    referenciaId: `${venta.id}-${Date.now()}`,
    notas
  })
  return { pagado, saldo }
}
