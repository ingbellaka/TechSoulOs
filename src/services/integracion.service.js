import { supabase } from '../lib/supabase'

const now = () => new Date().toISOString()

export async function registrarMovimientoInventario({ producto, tipo, cantidad, stockAnterior, stockNuevo, referenciaTipo = null, referenciaId = null, nota = '' }) {
  const payload = {
    producto_id: producto.id,
    producto: producto.nombre,
    tipo,
    cantidad: Number(cantidad || 0),
    stock_anterior: Number(stockAnterior || 0),
    stock_nuevo: Number(stockNuevo || 0),
    referencia_tipo: referenciaTipo,
    referencia_id: referenciaId,
    nota,
    fecha_movimiento: now()
  }
  const { error } = await supabase.from('movimientos_inventario').insert(payload)
  if (error) throw new Error(error.message)
  return payload
}

export async function ajustarExistencia(producto, cambio, opciones = {}) {
  if (!producto?.id) throw new Error('Producto inválido')
  if (producto.modalidad === 'bajo_pedido') throw new Error('La pieza está configurada como bajo pedido')
  const anterior = Number(producto.stock || 0)
  const nuevo = anterior + Number(cambio || 0)
  if (nuevo < 0) throw new Error(`Stock insuficiente para ${producto.nombre}`)
  const { error } = await supabase.from('productos').update({ stock: nuevo, actualizado_en: now() }).eq('id', producto.id)
  if (error) throw new Error(error.message)
  await registrarMovimientoInventario({
    producto,
    tipo: cambio >= 0 ? 'Entrada' : 'Salida',
    cantidad: Math.abs(Number(cambio || 0)),
    stockAnterior: anterior,
    stockNuevo: nuevo,
    referenciaTipo: opciones.referenciaTipo,
    referenciaId: opciones.referenciaId,
    nota: opciones.nota || 'Ajuste de inventario'
  })
  return nuevo
}

export async function registrarMovimientoCaja({ tipo, concepto, monto, metodoPago = 'Efectivo', referenciaTipo = null, referenciaId = null, notas = '' }) {
  const valor = Number(monto || 0)
  if (!concepto?.trim() || valor <= 0) throw new Error('Concepto y monto son obligatorios')

  if (referenciaTipo && referenciaId) {
    const { data: existentes } = await supabase.from('movimientos_caja').select('*').eq('referencia_tipo', referenciaTipo).eq('referencia_id', referenciaId)
    const duplicado = (existentes || []).some(m => m.tipo === tipo && String(m.concepto || '').trim() === concepto.trim())
    if (duplicado) return { duplicado: true }
  }

  const { data, error } = await supabase.from('movimientos_caja').insert({
    tipo,
    concepto: concepto.trim(),
    monto: valor,
    metodo_pago: metodoPago,
    referencia_tipo: referenciaTipo,
    referencia_id: referenciaId,
    notas: notas?.trim?.() || '',
    fecha_movimiento: now()
  }).select('*').single()
  if (error) throw new Error(error.message)
  return data
}

export async function recibirOrdenCompra(ordenCompra, detalle) {
  if (!ordenCompra?.id) throw new Error('Orden de compra inválida')
  if (ordenCompra.estado === 'Recibida') return

  for (const item of detalle) {
    if (!item.producto_id) continue
    const { data: producto, error } = await supabase.from('productos').select('*').eq('id', item.producto_id).single()
    if (error || !producto) throw new Error(`No se encontró el producto de la partida: ${item.descripcion}`)

    const cantidad = Number(item.cantidad || 0)
    const costoAnterior = Number(producto.costo || 0)
    const stockAnterior = Number(producto.stock || 0)
    const costoCompra = Number(item.costo_unitario || 0)
    const stockNuevo = stockAnterior + cantidad
    const costoPromedio = stockNuevo > 0
      ? ((stockAnterior * costoAnterior) + (cantidad * costoCompra)) / stockNuevo
      : costoCompra

    const { error: updateError } = await supabase.from('productos').update({
      stock: stockNuevo,
      costo: Number(costoPromedio.toFixed(2)),
      actualizado_en: now()
    }).eq('id', producto.id)
    if (updateError) throw new Error(updateError.message)

    await registrarMovimientoInventario({
      producto,
      tipo: 'Entrada por compra',
      cantidad,
      stockAnterior,
      stockNuevo,
      referenciaTipo: 'orden_compra',
      referenciaId: ordenCompra.id,
      nota: ordenCompra.folio
    })
  }

  const { error: estadoError } = await supabase.from('ordenes_compra').update({ estado: 'Recibida', fecha_recepcion: now() }).eq('id', ordenCompra.id)
  if (estadoError) throw new Error(estadoError.message)

  await registrarMovimientoCaja({
    tipo: 'Salida',
    concepto: `Orden de compra ${ordenCompra.folio}`,
    monto: Number(ordenCompra.total || 0),
    metodoPago: ordenCompra.metodo_pago || 'Efectivo',
    referenciaTipo: 'orden_compra',
    referenciaId: ordenCompra.id,
    notas: ordenCompra.notas || ''
  })
}
