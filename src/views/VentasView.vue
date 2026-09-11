<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { supabase } from '../lib/supabase'
import { registrarAbonoVenta } from '../services/flujo-operativo.service'
import { useAuthStore } from '../stores/auth'

const productos = ref([])
const ventas = ref([])
const detalles = ref([])
const negocio = ref({})
const busqueda = ref('')
const estadoFiltro = ref('Todos')
const mostrarVenta = ref(false)
const procesando = ref(false)
const cargando = ref(true)
const ventaAbono = ref(null)
const abono = ref({ monto: 0, metodo_pago: 'Efectivo', notas: '' })
const authStore = useAuthStore()
const route = useRoute()
const ventaEditar = ref(null)
const editForm = ref(null)
const procesandoEdicion = ref(false)
const esAdministrador = computed(() => authStore.isAdmin)

const form = ref(nuevaVenta())
const item = ref(nuevoItem())

function nuevaVenta() {
  return {
    cliente_nombre: '',
    cliente_telefono: '',
    metodo_pago: 'Efectivo',
    anticipo: 0,
    notas: '',
    items: []
  }
}

function nuevoItem(tipo = 'inventario') {
  return {
    tipo,
    producto_id: '',
    descripcion: '',
    cantidad: 1,
    precio_unitario: 0,
    costo_estimado: 0,
    proveedor: '',
    fecha_estimada: '',
    notas: ''
  }
}

function moneda(valor) {
  return Number(valor || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
}

function fecha(valor) {
  return valor ? new Date(valor).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : 'Sin fecha'
}

function nombreTipo(tipo) {
  return ({ inventario: 'Inventario', encargo: 'Por encargo', servicio: 'Servicio', libre: 'Concepto libre' })[tipo] || tipo
}

const productoItem = computed(() => productos.value.find(p => String(p.id) === String(item.value.producto_id)))
const subtotalItem = computed(() => Number(item.value.cantidad || 0) * Number(item.value.precio_unitario || 0))
const totalVenta = computed(() => form.value.items.reduce((s, renglon) => s + Number(renglon.subtotal || 0), 0))
const anticipoAplicado = computed(() => Math.min(Math.max(Number(form.value.anticipo || 0), 0), totalVenta.value))
const saldoVenta = computed(() => Math.max(0, totalVenta.value - anticipoAplicado.value))
const productosDisponibles = computed(() => productos.value.filter(p => Number(p.stock || 0) > 0))
const totalEdicion = computed(() => (editForm.value?.items || []).reduce((s, renglon) => s + Number(renglon.cantidad || 0) * Number(renglon.precio_unitario || 0), 0))
const saldoEdicion = computed(() => Math.max(0, totalEdicion.value - Number(ventaEditar.value?.pagado || 0)))

const ventasHoy = computed(() => {
  const hoy = new Date().toDateString()
  return ventas.value.filter(v => v.fecha_venta && new Date(v.fecha_venta).toDateString() === hoy)
})
const ingresoHoy = computed(() => ventasHoy.value.reduce((s, v) => s + Number(v.pagado ?? v.total ?? 0), 0))
const pendientes = computed(() => detalles.value.filter(d => ['pendiente_comprar', 'pendiente_surtir', 'surtido'].includes(d.estado_entrega)).length)
const porCobrar = computed(() => ventas.value.reduce((s, v) => s + Number(v.saldo ?? 0), 0))

const ventasFiltradas = computed(() => {
  const termino = busqueda.value.trim().toLowerCase()
  return ventas.value.filter(v => {
    const coincideEstado = estadoFiltro.value === 'Todos' || (v.estado_entrega || 'Entregado') === estadoFiltro.value
    const texto = [v.id, v.folio, v.cliente_nombre, v.cliente_telefono, v.metodo_pago, v.notas, v.total]
      .filter(Boolean).join(' ').toLowerCase()
    return coincideEstado && (!termino || texto.includes(termino))
  })
})

async function cargar() {
  cargando.value = true
  const [{ data: prods, error: errorProductos }, { data: vtas, error: errorVentas }, { data: dets, error: errorDetalles }, { data: config, error: errorConfig }] = await Promise.all([
    supabase.from('productos').select('*').order('nombre'),
    supabase.from('ventas').select('*').order('id', { ascending: false }),
    supabase.from('detalle_ventas').select('*').order('id', { ascending: false }),
    supabase.from('configuracion_negocio').select('*').order('id').limit(1).maybeSingle()
  ])
  const error = errorProductos || errorVentas || errorDetalles || errorConfig
  if (error) alert(error.message)
  productos.value = prods || []
  ventas.value = (vtas || []).map(v => ({
    ...v,
    pagado: Number(v.pagado ?? v.anticipo ?? v.total ?? 0),
    saldo: Number(v.saldo ?? Math.max(0, Number(v.total || 0) - Number(v.anticipo ?? v.total ?? 0))),
    estado_entrega: v.estado_entrega || 'Entregado'
  }))
  detalles.value = dets || []
  negocio.value = config || {}
  cargando.value = false
}

function cambiarTipo(tipo) {
  item.value = nuevoItem(tipo)
}

function seleccionarProducto() {
  const producto = productoItem.value
  if (!producto) return
  item.value.descripcion = producto.nombre
  item.value.precio_unitario = Number(producto.precio_venta || 0)
  item.value.costo_estimado = Number(producto.costo || 0)
}

function agregarItem() {
  const cantidad = Number(item.value.cantidad || 0)
  const precio = Number(item.value.precio_unitario || 0)
  if (cantidad <= 0) return alert('La cantidad debe ser mayor a cero')
  if (precio < 0) return alert('El precio no puede ser negativo')

  if (item.value.tipo === 'inventario') {
    const producto = productoItem.value
    if (!producto) return alert('Selecciona un producto del inventario')
    if (cantidad > Number(producto.stock || 0)) return alert(`Solo hay ${producto.stock || 0} unidades disponibles`)
    item.value.descripcion = producto.nombre
  } else if (!item.value.descripcion.trim()) {
    return alert('Escribe la descripción del concepto')
  }

  const estado = item.value.tipo === 'encargo' ? 'pendiente_comprar' : 'entregado'
  form.value.items.push({
    ...item.value,
    id_temporal: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    cantidad,
    precio_unitario: precio,
    costo_estimado: Number(item.value.costo_estimado || 0),
    subtotal: cantidad * precio,
    estado_entrega: estado
  })
  item.value = nuevoItem(item.value.tipo)
}

function quitarItem(id) {
  form.value.items = form.value.items.filter(r => r.id_temporal !== id)
}

function estadoGeneral(items) {
  const estados = items.map(r => r.estado_entrega)
  if (estados.every(e => e === 'entregado')) return 'Entregado'
  if (estados.some(e => e === 'entregado')) return 'Entrega parcial'
  return 'Pendiente de surtir'
}

async function registrarVenta() {
  if (!form.value.items.length) return alert('Agrega al menos un artículo, servicio o concepto')
  if (anticipoAplicado.value > totalVenta.value) return alert('El anticipo no puede superar el total')

  procesando.value = true
  const pagado = anticipoAplicado.value
  const saldo = saldoVenta.value
  const estadoEntrega = estadoGeneral(form.value.items)
  const folio = `V-${String((Math.max(0, ...ventas.value.map(v => Number(v.id) || 0)) + 1)).padStart(5, '0')}`

  const { data: venta, error: errorVenta } = await supabase
    .from('ventas')
    .insert({
      folio,
      cliente_nombre: form.value.cliente_nombre.trim() || 'Cliente de mostrador',
      cliente_telefono: form.value.cliente_telefono.trim(),
      total: totalVenta.value,
      anticipo: pagado,
      pagado,
      saldo,
      metodo_pago: form.value.metodo_pago,
      estado_pago: saldo > 0 ? (pagado > 0 ? 'Parcial' : 'Pendiente') : 'Pagado',
      estado_entrega: estadoEntrega,
      notas: form.value.notas.trim(),
      fecha_venta: new Date().toISOString()
    })
    .select()
    .single()

  if (errorVenta) {
    procesando.value = false
    return alert(errorVenta.message)
  }

  const errores = []
  for (const renglon of form.value.items) {
    const detalle = {
      venta_id: venta.id,
      tipo_item: renglon.tipo,
      producto_id: renglon.tipo === 'inventario' ? renglon.producto_id : null,
      descripcion: renglon.descripcion.trim(),
      cantidad: renglon.cantidad,
      precio_unitario: renglon.precio_unitario,
      subtotal: renglon.subtotal,
      costo_estimado: renglon.costo_estimado,
      proveedor: renglon.proveedor.trim(),
      fecha_estimada: renglon.fecha_estimada || null,
      estado_entrega: renglon.estado_entrega,
      notas: renglon.notas.trim()
    }
    const { error: errorDetalle } = await supabase.from('detalle_ventas').insert(detalle)
    if (errorDetalle) errores.push(errorDetalle.message)

    if (renglon.tipo === 'inventario') {
      const producto = productos.value.find(p => String(p.id) === String(renglon.producto_id))
      if (producto) {
        const nuevoStock = Number(producto.stock || 0) - Number(renglon.cantidad || 0)
        const { error } = await supabase.from('productos').update({ stock: nuevoStock }).eq('id', producto.id)
        if (error) errores.push(error.message)
        await supabase.from('movimientos_inventario').insert({
          producto_id: producto.id,
          tipo: 'Salida',
          cantidad: renglon.cantidad,
          motivo: `Venta ${folio}`,
          referencia_tipo: 'venta',
          referencia_id: venta.id
        })
      }
    }

    if (renglon.tipo === 'encargo') {
      const { error } = await supabase.from('solicitudes_compra').insert({
        venta_id: venta.id,
        detalle_venta_id: null,
        descripcion: renglon.descripcion.trim(),
        cantidad: renglon.cantidad,
        costo_estimado: renglon.costo_estimado,
        proveedor: renglon.proveedor.trim(),
        fecha_estimada: renglon.fecha_estimada || null,
        estado: 'Pendiente',
        cliente_nombre: form.value.cliente_nombre.trim() || 'Cliente de mostrador',
        notas: renglon.notas.trim()
      })
      if (error) errores.push(error.message)
    }
  }

  if (pagado > 0) {
    const { error } = await supabase.from('movimientos_caja').insert({
      tipo: 'Entrada',
      concepto: saldo > 0 ? `Anticipo venta ${folio}` : `Venta ${folio}`,
      monto: pagado,
      metodo_pago: form.value.metodo_pago,
      referencia_tipo: 'venta',
      referencia_id: venta.id,
      notas: form.value.notas.trim()
    })
    if (error) errores.push(error.message)
  }

  procesando.value = false
  form.value = nuevaVenta()
  item.value = nuevoItem()
  mostrarVenta.value = false
  await cargar()
  if (errores.length) alert(`La venta se guardó, pero hubo operaciones pendientes: ${[...new Set(errores)].join(' · ')}`)
}

function itemsVenta(ventaId) {
  return detalles.value.filter(d => String(d.venta_id) === String(ventaId))
}


function escaparHtml(valor) {
  return String(valor ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function generarNotaVenta(venta) {
  const conceptos = itemsVenta(venta.id)
  const popup = window.open('', '_blank')
  if (!popup) {
    alert('El navegador bloqueó la ventana del PDF. Permite ventanas emergentes para TechSoul e inténtalo otra vez.')
    return
  }

  const pagado = Number(venta.pagado ?? venta.anticipo ?? 0)
  const saldo = Number(venta.saldo ?? Math.max(0, Number(venta.total || 0) - pagado))
  const estadoPago = saldo <= 0 ? 'Pagada' : (pagado > 0 ? 'Pago parcial' : 'Pendiente')
  const filas = conceptos.length
    ? conceptos.map((d) => `<tr><td><b>${escaparHtml(d.descripcion || 'Concepto')}</b>${d.notas ? `<small>${escaparHtml(d.notas)}</small>` : ''}</td><td>${escaparHtml(d.cantidad || 0)}</td><td>${escaparHtml(moneda(d.precio_unitario))}</td><td>${escaparHtml(moneda(d.subtotal))}</td></tr>`).join('')
    : `<tr><td colspan="4" class="empty">Sin conceptos registrados</td></tr>`

  const firmaHtml = negocio.value?.firma_url
    ? `<img src="${escaparHtml(negocio.value.firma_url)}" alt="Firma del responsable">`
    : ''
  const responsable = negocio.value?.responsable_nombre || 'Técnico / recepción'
  const condiciones = negocio.value?.condiciones_generales || 'La garantía cubre exclusivamente las piezas o servicios indicados en esta nota. No cubre golpes, humedad, mal uso, manipulación por terceros ni fallas ajenas al trabajo realizado.'

  const html = `<!doctype html>
  <html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Nota-${escaparHtml(venta.folio || venta.id)}</title>
  <style>
    @page{size:A4;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#172033;margin:0;background:#fff;font-size:11px;line-height:1.45}.sheet{max-width:186mm;margin:0 auto}.header{display:flex;justify-content:space-between;gap:20px;border-bottom:3px solid #2563eb;padding-bottom:14px;margin-bottom:14px}.brand{min-width:0}.brand h1{font-size:24px;margin:0;color:#101828}.brand p{margin:3px 0;color:#667085}.brand-logo{max-height:42px;max-width:150px;object-fit:contain;margin-bottom:6px}.folio{text-align:right;min-width:150px}.folio span{display:block;color:#667085;text-transform:uppercase;letter-spacing:.08em;font-size:9px}.folio strong{display:block;font-size:20px;color:#2563eb;margin:2px 0}.status{display:inline-block;border-radius:999px;background:#eef4ff;color:#1849a9;padding:4px 9px;font-weight:700}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px}.card{border:1px solid #dfe5ee;border-radius:9px;padding:11px;break-inside:avoid}.card h2{font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:#475467;margin:0 0 8px}.wide{grid-column:1/-1}.row{display:grid;grid-template-columns:90px 1fr;gap:8px;margin:4px 0}.row span{color:#667085}.row b{font-weight:600;overflow-wrap:anywhere}.items{width:100%;border-collapse:collapse}.items th{text-align:left;color:#667085;text-transform:uppercase;font-size:9px;letter-spacing:.05em;padding:7px 6px;border-bottom:1px solid #dfe5ee}.items td{padding:9px 6px;border-bottom:1px solid #edf0f4;vertical-align:top}.items th:nth-child(2),.items td:nth-child(2){text-align:center;width:55px}.items th:nth-child(3),.items th:nth-child(4),.items td:nth-child(3),.items td:nth-child(4){text-align:right;width:90px}.items small{display:block;color:#667085;margin-top:2px}.empty{text-align:center!important;color:#98a2b3}.totals{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.total{background:#f8fafc;border-radius:8px;padding:9px}.total span{display:block;color:#667085;font-size:9px;text-transform:uppercase}.total b{display:block;font-size:15px;margin-top:2px}.total.balance b{color:${saldo>0?'#b42318':'#15803d'}}.note{white-space:pre-wrap;background:#f8fafc;border-radius:7px;padding:9px;color:#475467}.signature{height:72px;display:flex;align-items:flex-end;justify-content:center}.signature img{max-height:58px;max-width:220px;object-fit:contain}.signature-line{border-top:1px solid #667085;padding-top:5px;text-align:center;color:#475467}.conditions{margin-top:12px;border-top:1px solid #dfe5ee;padding-top:9px;color:#667085;font-size:9px}.footer{margin-top:10px;text-align:center;color:#98a2b3;font-size:9px}@media print{.no-print{display:none!important}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style></head><body><main class="sheet">
    <header class="header"><div class="brand">${negocio.value?.logo_url ? `<img class="brand-logo" src="${escaparHtml(negocio.value.logo_url)}" alt="Logo">` : ''}<h1>${escaparHtml(negocio.value?.nombre_negocio || 'TechSoul')}</h1><p>Especialistas en celulares</p><p>${escaparHtml(negocio.value?.direccion || '')}</p><p>${escaparHtml(negocio.value?.telefono || negocio.value?.whatsapp || '')}</p></div><div class="folio"><span>Nota de venta</span><strong>${escaparHtml(venta.folio || `V-${venta.id}`)}</strong><span class="status">${escaparHtml(estadoPago)}</span><p>${escaparHtml(fecha(venta.fecha_venta || venta.created_at))}</p></div></header>
    <section class="grid">
      <article class="card"><h2>Cliente</h2><div class="row"><span>Nombre</span><b>${escaparHtml(venta.cliente_nombre || 'Cliente de mostrador')}</b></div><div class="row"><span>Teléfono</span><b>${escaparHtml(venta.cliente_telefono || 'No registrado')}</b></div></article>
      <article class="card"><h2>Pago</h2><div class="row"><span>Método</span><b>${escaparHtml(venta.metodo_pago || 'No registrado')}</b></div><div class="row"><span>Estado</span><b>${escaparHtml(estadoPago)}</b></div><div class="row"><span>Entrega</span><b>${escaparHtml(venta.estado_entrega || 'Entregado')}</b></div></article>
      <article class="card wide"><h2>Detalle de venta</h2><table class="items"><thead><tr><th>Concepto</th><th>Cant.</th><th>P. unitario</th><th>Importe</th></tr></thead><tbody>${filas}</tbody></table></article>
      <article class="card wide"><h2>Resumen financiero</h2><div class="totals"><div class="total"><span>Total</span><b>${escaparHtml(moneda(venta.total))}</b></div><div class="total"><span>Pagado</span><b>${escaparHtml(moneda(pagado))}</b></div><div class="total balance"><span>Saldo pendiente</span><b>${escaparHtml(moneda(saldo))}</b></div></div></article>
      ${venta.notas ? `<article class="card wide"><h2>Observaciones</h2><div class="note">${escaparHtml(venta.notas)}</div></article>` : ''}
      <article class="card wide"><h2>Responsable</h2><div class="signature">${firmaHtml}</div><div class="signature-line">${escaparHtml(responsable)}</div></article>
    </section>
    <p class="conditions"><b>Condiciones:</b> ${escaparHtml(condiciones)} La entrega de mercancía o equipo podrá quedar sujeta a la liquidación total del saldo pendiente.</p>
    <p class="footer">Documento generado por TechSoul OS · ${escaparHtml(new Date().toLocaleString('es-MX'))}</p>
    <div class="no-print" style="position:fixed;right:18px;bottom:18px"><button onclick="window.print()" style="border:0;border-radius:9px;background:#2563eb;color:white;padding:11px 16px;font-weight:700;cursor:pointer">Guardar como PDF / Imprimir</button></div>
  </main><script>setTimeout(()=>window.print(),350)<\/script></body></html>`
  popup.document.open()
  popup.document.write(html)
  popup.document.close()
}


function abrirEditarVenta(venta) {
  ventaEditar.value = venta
  editForm.value = {
    cliente_nombre: venta.cliente_nombre || '',
    cliente_telefono: venta.cliente_telefono || '',
    metodo_pago: venta.metodo_pago || 'Efectivo',
    estado_entrega: venta.estado_entrega || 'Entregado',
    notas: venta.notas || '',
    items: itemsVenta(venta.id).map(d => ({
      ...d,
      cantidad_original: Number(d.cantidad || 0),
      cantidad: Number(d.cantidad || 0),
      precio_unitario: Number(d.precio_unitario || 0)
    }))
  }
}

function cerrarEditarVenta() {
  ventaEditar.value = null
  editForm.value = null
}

async function guardarEdicionVenta() {
  if (!ventaEditar.value || !editForm.value) return
  if (!editForm.value.items.length) return alert('La venta debe conservar al menos un concepto.')
  if (editForm.value.items.some(i => Number(i.cantidad || 0) <= 0 || Number(i.precio_unitario || 0) < 0)) {
    return alert('Revisa cantidades y precios de los conceptos.')
  }
  const pagado = Number(ventaEditar.value.pagado || 0)
  if (totalEdicion.value < pagado) {
    return alert(`El nuevo total no puede ser menor a lo ya cobrado (${moneda(pagado)}).`)
  }

  procesandoEdicion.value = true
  const errores = []
  try {
    for (const renglon of editForm.value.items) {
      const cantidadNueva = Number(renglon.cantidad || 0)
      const cantidadAnterior = Number(renglon.cantidad_original || 0)
      const diferencia = cantidadNueva - cantidadAnterior

      if (renglon.tipo_item === 'inventario' && renglon.producto_id && diferencia !== 0) {
        const producto = productos.value.find(p => String(p.id) === String(renglon.producto_id))
        if (!producto) throw new Error(`No se encontró el producto ${renglon.descripcion}.`)
        const stockActual = Number(producto.stock || 0)
        if (diferencia > 0 && diferencia > stockActual) {
          throw new Error(`No hay existencias suficientes de ${producto.nombre}. Disponibles: ${stockActual}.`)
        }
        const stockNuevo = stockActual - diferencia
        const { error: errorStock } = await supabase.from('productos').update({ stock: stockNuevo }).eq('id', producto.id)
        if (errorStock) throw new Error(errorStock.message)
        producto.stock = stockNuevo

        const { error: errorMov } = await supabase.from('movimientos_inventario').insert({
          producto_id: producto.id,
          producto: producto.nombre,
          tipo: diferencia > 0 ? 'Salida' : 'Entrada',
          cantidad: Math.abs(diferencia),
          stock_anterior: stockActual,
          stock_nuevo: stockNuevo,
          referencia_tipo: 'venta_ajuste',
          referencia_id: `${ventaEditar.value.id}-${renglon.id}-${Date.now()}`,
          motivo: `Ajuste de venta ${ventaEditar.value.folio}`,
          nota: 'Ajuste generado al editar la cantidad de una venta.'
        })
        if (errorMov) errores.push(errorMov.message)
      }

      const subtotal = cantidadNueva * Number(renglon.precio_unitario || 0)
      const { error: errorDetalle } = await supabase.from('detalle_ventas').update({
        descripcion: String(renglon.descripcion || '').trim(),
        cantidad: cantidadNueva,
        precio_unitario: Number(renglon.precio_unitario || 0),
        subtotal,
        notas: String(renglon.notas || '').trim()
      }).eq('id', renglon.id)
      if (errorDetalle) throw new Error(errorDetalle.message)
    }

    const total = totalEdicion.value
    const saldo = Math.max(0, total - pagado)
    const estadoPago = saldo <= 0 ? 'Pagado' : (pagado > 0 ? 'Parcial' : 'Pendiente')
    const { error: errorVenta } = await supabase.from('ventas').update({
      cliente_nombre: editForm.value.cliente_nombre.trim() || 'Cliente de mostrador',
      cliente_telefono: editForm.value.cliente_telefono.trim(),
      metodo_pago: editForm.value.metodo_pago,
      estado_entrega: editForm.value.estado_entrega,
      notas: editForm.value.notas.trim(),
      total,
      saldo,
      estado_pago: estadoPago
    }).eq('id', ventaEditar.value.id)
    if (errorVenta) throw new Error(errorVenta.message)

    // Si existe el movimiento inicial de caja de esta venta, corrige su método de pago.
    await supabase.from('movimientos_caja')
      .update({ metodo_pago: editForm.value.metodo_pago })
      .eq('referencia_tipo', 'venta')
      .eq('referencia_id', String(ventaEditar.value.id))

    cerrarEditarVenta()
    await cargar()
    if (errores.length) alert(`Venta actualizada, con avisos: ${[...new Set(errores)].join(' · ')}`)
  } catch (error) {
    alert(error.message)
  } finally {
    procesandoEdicion.value = false
  }
}

async function eliminarVenta(venta) {
  if (!esAdministrador.value) return alert('Solo un administrador puede eliminar ventas.')
  const confirmar = window.confirm(`¿Eliminar definitivamente ${venta.folio}?\n\nSe revertirán existencias y se eliminarán sus movimientos de caja relacionados. Esta acción no se puede deshacer.`)
  if (!confirmar) return

  procesandoEdicion.value = true
  try {
    const items = itemsVenta(venta.id)
    for (const renglon of items.filter(i => i.tipo_item === 'inventario' && i.producto_id)) {
      const { data: producto, error: errorProducto } = await supabase.from('productos').select('*').eq('id', renglon.producto_id).single()
      if (errorProducto) throw new Error(errorProducto.message)
      const stockActual = Number(producto.stock || 0)
      const stockNuevo = stockActual + Number(renglon.cantidad || 0)
      const { error: errorStock } = await supabase.from('productos').update({ stock: stockNuevo }).eq('id', producto.id)
      if (errorStock) throw new Error(errorStock.message)
      const { error: errorMov } = await supabase.from('movimientos_inventario').insert({
        producto_id: producto.id,
        producto: producto.nombre,
        tipo: 'Entrada',
        cantidad: Number(renglon.cantidad || 0),
        stock_anterior: stockActual,
        stock_nuevo: stockNuevo,
        referencia_tipo: 'venta_eliminada',
        referencia_id: `${venta.id}-${renglon.id}-${Date.now()}`,
        motivo: `Reverso por eliminación ${venta.folio}`,
        nota: 'Existencia devuelta automáticamente al eliminar la venta.'
      })
      if (errorMov) throw new Error(errorMov.message)
    }

    let r = await supabase.from('movimientos_caja').delete().eq('referencia_tipo', 'venta').eq('referencia_id', String(venta.id))
    if (r.error) throw new Error(r.error.message)
    r = await supabase.from('movimientos_caja').delete().eq('referencia_tipo', 'venta_abono').like('referencia_id', `${venta.id}-%`)
    if (r.error) throw new Error(r.error.message)
    r = await supabase.from('solicitudes_compra').delete().eq('venta_id', venta.id)
    if (r.error) throw new Error(r.error.message)
    r = await supabase.from('presupuestos').update({ venta_id: null }).eq('venta_id', venta.id)
    if (r.error) throw new Error(r.error.message)
    r = await supabase.from('detalle_ventas').delete().eq('venta_id', venta.id)
    if (r.error) throw new Error(r.error.message)
    r = await supabase.from('ventas').delete().eq('id', venta.id)
    if (r.error) throw new Error(r.error.message)

    await cargar()
  } catch (error) {
    alert(`No se pudo eliminar la venta: ${error.message}`)
  } finally {
    procesandoEdicion.value = false
  }
}

function abrirAbono(venta) {
  ventaAbono.value = venta
  abono.value = { monto: Number(venta.saldo || 0), metodo_pago: venta.metodo_pago || 'Efectivo', notas: '' }
}

async function guardarAbono() {
  try {
    await registrarAbonoVenta(ventaAbono.value, abono.value.monto, abono.value.metodo_pago, abono.value.notas)
    ventaAbono.value = null
    await cargar()
  } catch (error) { alert(error.message) }
}

async function actualizarEstadoItem(detalle, nuevoEstado) {
  const { error } = await supabase.from('detalle_ventas').update({ estado_entrega: nuevoEstado }).eq('id', detalle.id)
  if (error) return alert(error.message)

  const items = itemsVenta(detalle.venta_id).map(d => d.id === detalle.id ? { ...d, estado_entrega: nuevoEstado } : d)
  const estado = estadoGeneral(items)
  await supabase.from('ventas').update({ estado_entrega: estado }).eq('id', detalle.venta_id)
  await cargar()
}

onMounted(async () => {
  await cargar()
  if (route.query.nueva === '1') {
    mostrarVenta.value = true
    await nextTick()
    document.querySelector('.venta-builder')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
})
</script>

<template>
  <div class="ts-module-page">
    <header class="ts-module-header">
      <div>
        <span class="ts-eyebrow">Finanzas</span>
        <h2>Ventas inteligentes</h2>
        <p>Vende productos en existencia, artículos por encargo, servicios y conceptos libres.</p>
      </div>
      <button class="ts-action-primary" type="button" @click="mostrarVenta = !mostrarVenta">
        <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
        {{ mostrarVenta ? 'Cerrar venta' : 'Nueva venta' }}
      </button>
    </header>

    <section class="ts-metric-strip ts-metric-strip-four">
      <article class="ts-mini-metric"><span>Ventas de hoy</span><strong>{{ ventasHoy.length }}</strong><small>Operaciones registradas</small></article>
      <article class="ts-mini-metric"><span>Ingreso de hoy</span><strong>{{ moneda(ingresoHoy) }}</strong><small>Pagos recibidos hoy</small></article>
      <article class="ts-mini-metric"><span>Pendientes de surtir</span><strong>{{ pendientes }}</strong><small>Artículos por entregar</small></article>
      <article class="ts-mini-metric"><span>Por cobrar</span><strong>{{ moneda(porCobrar) }}</strong><small>Saldos de clientes</small></article>
    </section>

    <section v-if="mostrarVenta" class="ts-panel venta-builder">
      <div class="ts-panel-heading">
        <div><span class="ts-panel-kicker">Nueva operación</span><h3>Armar venta</h3></div>
        <strong class="ts-live-total">{{ moneda(totalVenta) }}</strong>
      </div>

      <div class="cliente-grid">
        <label class="ts-field"><span>Cliente</span><input v-model="form.cliente_nombre" placeholder="Cliente de mostrador"></label>
        <label class="ts-field"><span>Teléfono</span><input v-model="form.cliente_telefono" placeholder="667 000 0000"></label>
      </div>

      <div class="tipo-tabs" role="tablist" aria-label="Tipo de concepto">
        <button v-for="tipo in ['inventario', 'encargo', 'servicio', 'libre']" :key="tipo" type="button" :class="{ active: item.tipo === tipo }" @click="cambiarTipo(tipo)">
          {{ nombreTipo(tipo) }}
        </button>
      </div>

      <div class="item-editor">
        <label v-if="item.tipo === 'inventario'" class="ts-field item-wide">
          <span>Producto de inventario *</span>
          <select v-model="item.producto_id" class="ts-filter-select ts-select-full" @change="seleccionarProducto">
            <option value="">Selecciona un producto</option>
            <option v-for="p in productosDisponibles" :key="p.id" :value="p.id">{{ p.nombre }} · {{ p.stock }} disponibles · {{ moneda(p.precio_venta) }}</option>
          </select>
        </label>
        <label v-else class="ts-field item-wide"><span>Descripción *</span><input v-model="item.descripcion" :placeholder="item.tipo === 'encargo' ? 'Ej. Pantalla Xiaomi Poco X7 Pro OLED' : 'Describe el concepto'"></label>
        <label class="ts-field"><span>Cantidad *</span><input v-model.number="item.cantidad" min="1" type="number"></label>
        <label class="ts-field"><span>Precio unitario *</span><input v-model.number="item.precio_unitario" min="0" step="0.01" type="number"></label>

        <template v-if="item.tipo === 'encargo'">
          <label class="ts-field"><span>Costo estimado</span><input v-model.number="item.costo_estimado" min="0" step="0.01" type="number"></label>
          <label class="ts-field"><span>Proveedor</span><input v-model="item.proveedor" placeholder="Opcional"></label>
          <label class="ts-field"><span>Fecha estimada</span><input v-model="item.fecha_estimada" type="date"></label>
        </template>
        <label class="ts-field item-wide"><span>Notas del artículo</span><input v-model="item.notas" placeholder="Color, modelo, condición o indicaciones"></label>
        <div class="item-add">
          <span>Subtotal: <strong>{{ moneda(subtotalItem) }}</strong></span>
          <button class="ts-action-secondary" type="button" @click="agregarItem">Agregar a la venta</button>
        </div>
      </div>

      <div v-if="form.items.length" class="cart-list">
        <article v-for="renglon in form.items" :key="renglon.id_temporal" class="cart-row">
          <span class="type-pill" :class="`type-${renglon.tipo}`">{{ nombreTipo(renglon.tipo) }}</span>
          <div><strong>{{ renglon.descripcion }}</strong><small>{{ renglon.cantidad }} × {{ moneda(renglon.precio_unitario) }}<template v-if="renglon.fecha_estimada"> · Llegada estimada: {{ renglon.fecha_estimada }}</template></small></div>
          <strong>{{ moneda(renglon.subtotal) }}</strong>
          <button class="remove-line" type="button" title="Quitar" @click="quitarItem(renglon.id_temporal)">×</button>
        </article>
      </div>
      <div v-else class="cart-empty">Todavía no has agregado conceptos a esta venta.</div>

      <div class="checkout-grid">
        <label class="ts-field"><span>Método de pago</span><select v-model="form.metodo_pago" class="ts-filter-select ts-select-full"><option>Efectivo</option><option>Transferencia</option><option>Tarjeta</option><option>Mercado Pago</option></select></label>
        <label class="ts-field"><span>Pago / anticipo</span><input v-model.number="form.anticipo" min="0" :max="totalVenta" step="0.01" type="number"></label>
        <label class="ts-field checkout-notes"><span>Notas generales</span><textarea v-model="form.notas" rows="2" placeholder="Información opcional sobre la venta"></textarea></label>
        <div class="totals-card">
          <div><span>Total</span><strong>{{ moneda(totalVenta) }}</strong></div>
          <div><span>Pago recibido</span><strong>{{ moneda(anticipoAplicado) }}</strong></div>
          <div class="balance"><span>Saldo pendiente</span><strong>{{ moneda(saldoVenta) }}</strong></div>
        </div>
      </div>

      <div class="ts-form-actions">
        <button class="ts-action-secondary" type="button" @click="mostrarVenta = false">Cancelar</button>
        <button class="ts-action-primary" type="button" :disabled="procesando || !form.items.length" @click="registrarVenta">{{ procesando ? 'Procesando…' : 'Confirmar venta' }}</button>
      </div>
    </section>

    <section class="ts-panel">
      <div class="ts-orders-toolbar">
        <div class="ts-search-control ts-search-grow"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input v-model="busqueda" placeholder="Buscar por folio, cliente, teléfono o notas"></div>
        <select v-model="estadoFiltro" class="ts-filter-select"><option>Todos</option><option>Entregado</option><option>Entrega parcial</option><option>Pendiente de surtir</option></select>
      </div>

      <div v-if="cargando" class="ts-empty-state"><span class="ts-spinner"></span><p>Cargando ventas…</p></div>
      <div v-else-if="!ventasFiltradas.length" class="ts-empty-state"><strong>No hay ventas para mostrar</strong><p>Registra una venta o modifica los filtros.</p></div>
      <div v-else class="smart-sales-list">
        <article v-for="venta in ventasFiltradas" :key="venta.id" class="smart-sale-card">
          <div class="sale-head">
            <div><span>{{ venta.folio || `Venta #${venta.id}` }}</span><strong>{{ venta.cliente_nombre || 'Cliente de mostrador' }}</strong><small>{{ fecha(venta.fecha_venta || venta.created_at) }} · {{ venta.metodo_pago }}</small></div>
            <div class="sale-money"><strong>{{ moneda(venta.total) }}</strong><small v-if="venta.saldo > 0">Saldo: {{ moneda(venta.saldo) }}</small><small v-else>Pagada</small></div>
          </div>
          <div class="sale-status-line"><span class="status-chip">{{ venta.estado_entrega }}</span><div class="sale-line-actions"><span>{{ itemsVenta(venta.id).length }} concepto(s)</span><button class="edit-btn" type="button" @click="abrirEditarVenta(venta)">Editar</button><button class="pdf-btn" type="button" @click="generarNotaVenta(venta)">Nota PDF</button><button v-if="venta.saldo > 0" class="abono-btn" @click="abrirAbono(venta)">Registrar abono</button><button v-if="esAdministrador" class="delete-btn" type="button" @click="eliminarVenta(venta)">Eliminar</button></div></div>
          <div v-if="itemsVenta(venta.id).length" class="sale-items">
            <div v-for="detalle in itemsVenta(venta.id)" :key="detalle.id" class="sale-item-line">
              <div><span class="type-pill" :class="`type-${detalle.tipo_item || 'inventario'}`">{{ nombreTipo(detalle.tipo_item || 'inventario') }}</span><strong>{{ detalle.descripcion || 'Producto' }}</strong><small>{{ detalle.cantidad }} × {{ moneda(detalle.precio_unitario) }}</small></div>
              <select v-if="detalle.tipo_item === 'encargo'" :value="detalle.estado_entrega" class="line-status" @change="actualizarEstadoItem(detalle, $event.target.value)">
                <option value="pendiente_comprar">Pendiente de comprar</option>
                <option value="pendiente_surtir">Comprado / en camino</option>
                <option value="surtido">Listo para entregar</option>
                <option value="entregado">Entregado</option>
                <option value="cancelado">Cancelado</option>
              </select>
              <span v-else class="delivered-label">Entregado</span>
            </div>
          </div>
          <p v-if="venta.notas" class="sale-notes">{{ venta.notas }}</p>
        </article>
      </div>
    </section>

    <div v-if="ventaEditar && editForm" class="payment-backdrop" @click.self="cerrarEditarVenta">
      <form class="payment-modal edit-sale-modal" @submit.prevent="guardarEdicionVenta">
        <header><div><small>{{ ventaEditar.folio }}</small><h3>Editar venta</h3></div><button type="button" @click="cerrarEditarVenta">×</button></header>
        <div class="edit-grid">
          <label><span>Cliente</span><input v-model="editForm.cliente_nombre" required></label>
          <label><span>Teléfono</span><input v-model="editForm.cliente_telefono"></label>
          <label><span>Método de pago</span><select v-model="editForm.metodo_pago"><option>Efectivo</option><option>Transferencia</option><option>Tarjeta</option><option>Mercado Pago</option><option>Otro</option></select></label>
          <label><span>Estado de entrega</span><select v-model="editForm.estado_entrega"><option>Entregado</option><option>Entrega parcial</option><option>Pendiente de surtir</option></select></label>
        </div>
        <div class="edit-items">
          <strong>Conceptos</strong>
          <div v-for="renglon in editForm.items" :key="renglon.id" class="edit-item-row">
            <input v-model="renglon.descripcion" aria-label="Descripción">
            <input v-model.number="renglon.cantidad" type="number" min="0.01" step="0.01" aria-label="Cantidad">
            <input v-model.number="renglon.precio_unitario" type="number" min="0" step="0.01" aria-label="Precio unitario">
            <strong>{{ moneda(Number(renglon.cantidad || 0) * Number(renglon.precio_unitario || 0)) }}</strong>
          </div>
        </div>
        <label><span>Notas</span><textarea v-model="editForm.notas" rows="2"></textarea></label>
        <div class="edit-summary"><div><span>Total nuevo</span><strong>{{ moneda(totalEdicion) }}</strong></div><div><span>Ya cobrado</span><strong>{{ moneda(ventaEditar.pagado) }}</strong></div><div><span>Saldo</span><strong>{{ moneda(saldoEdicion) }}</strong></div></div>
        <small class="edit-warning">Los pagos ya registrados no se modifican desde aquí. Para cobrar más usa “Registrar abono”. Si cambias cantidades de artículos de inventario, las existencias se ajustan automáticamente.</small>
        <footer><button type="button" class="ts-action-secondary" @click="cerrarEditarVenta">Cancelar</button><button class="ts-action-primary" :disabled="procesandoEdicion">{{ procesandoEdicion ? 'Guardando…' : 'Guardar cambios' }}</button></footer>
      </form>
    </div>

    <div v-if="ventaAbono" class="payment-backdrop" @click.self="ventaAbono=null">
      <form class="payment-modal" @submit.prevent="guardarAbono">
        <header><div><small>{{ ventaAbono.folio }}</small><h3>Registrar abono</h3></div><button type="button" @click="ventaAbono=null">×</button></header>
        <p>Saldo actual: <strong>{{ moneda(ventaAbono.saldo) }}</strong></p>
        <label><span>Monto</span><input v-model.number="abono.monto" type="number" min="0.01" :max="ventaAbono.saldo" step="0.01" required></label>
        <label><span>Método de pago</span><select v-model="abono.metodo_pago"><option>Efectivo</option><option>Transferencia</option><option>Tarjeta</option><option>Otro</option></select></label>
        <label><span>Notas</span><textarea v-model="abono.notas" rows="2"></textarea></label>
        <footer><button type="button" class="ts-action-secondary" @click="ventaAbono=null">Cancelar</button><button class="ts-action-primary">Guardar abono</button></footer>
      </form>
    </div>
  </div>
</template>

<style scoped>
.venta-builder{display:grid;gap:22px}.cliente-grid,.checkout-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.tipo-tabs{display:flex;gap:8px;flex-wrap:wrap;padding:6px;background:var(--ts-surface-soft,#f5f7fb);border-radius:14px}.tipo-tabs button{border:0;background:transparent;padding:10px 14px;border-radius:10px;font-weight:700;cursor:pointer;color:inherit}.tipo-tabs button.active{background:var(--ts-surface,#fff);box-shadow:0 4px 16px rgba(15,23,42,.08);color:var(--ts-primary,#2563eb)}.item-editor{display:grid;grid-template-columns:2fr repeat(3,minmax(130px,1fr));gap:14px;align-items:end;padding:18px;border:1px solid var(--ts-border,#e5e7eb);border-radius:16px}.item-wide{grid-column:span 2}.item-add{display:flex;align-items:center;justify-content:space-between;gap:12px;grid-column:1/-1;padding-top:4px}.cart-list{display:grid;gap:10px}.cart-row{display:grid;grid-template-columns:auto 1fr auto auto;align-items:center;gap:14px;padding:14px 16px;border:1px solid var(--ts-border,#e5e7eb);border-radius:14px}.cart-row div{display:grid;gap:3px}.cart-row small,.sale-head small,.sale-item-line small{color:var(--ts-muted,#64748b)}.cart-empty{padding:24px;text-align:center;border:1px dashed var(--ts-border,#d6dae3);border-radius:14px;color:var(--ts-muted,#64748b)}.type-pill{display:inline-flex;width:max-content;padding:5px 9px;border-radius:999px;font-size:.72rem;font-weight:800;background:#e2e8f0}.type-encargo{background:#fef3c7;color:#92400e}.type-servicio{background:#dbeafe;color:#1d4ed8}.type-libre{background:#ede9fe;color:#6d28d9}.type-inventario{background:#dcfce7;color:#166534}.remove-line{width:30px;height:30px;border:0;border-radius:50%;font-size:22px;cursor:pointer;background:#fee2e2;color:#b91c1c}.checkout-notes{grid-column:1/-1}.totals-card{grid-column:1/-1;display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:16px;border-radius:14px;background:var(--ts-surface-soft,#f5f7fb)}.totals-card div{display:grid;gap:5px}.totals-card .balance strong{font-size:1.2rem}.smart-sales-list{display:grid;gap:14px}.smart-sale-card{border:1px solid var(--ts-border,#e5e7eb);border-radius:16px;padding:18px;display:grid;gap:14px}.sale-head{display:flex;justify-content:space-between;gap:20px}.sale-head>div:first-child{display:grid;gap:4px}.sale-money{text-align:right;display:grid;gap:4px}.sale-money>strong{font-size:1.25rem}.sale-line-actions{display:flex;align-items:center;gap:10px}.pdf-btn{border:1px solid var(--ts-border,#d0d5dd);border-radius:9px;padding:7px 10px;background:var(--ts-surface,#fff);color:inherit;font-weight:700;cursor:pointer}.edit-btn{border:1px solid #bfdbfe;border-radius:9px;padding:7px 10px;background:#eff6ff;color:#1d4ed8;font-weight:800;cursor:pointer}.delete-btn{border:1px solid #fecaca;border-radius:9px;padding:7px 10px;background:#fff1f2;color:#be123c;font-weight:800;cursor:pointer}.edit-sale-modal{width:min(760px,100%)}.edit-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.edit-items{display:grid;gap:8px}.edit-item-row{display:grid;grid-template-columns:minmax(220px,1fr) 90px 130px 110px;gap:8px;align-items:center}.edit-item-row input{min-width:0}.edit-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;background:#f8fafc;border-radius:12px;padding:12px}.edit-summary div{display:grid;gap:3px}.edit-summary span{font-size:.75rem;color:#64748b}.edit-warning{display:block;color:#64748b;line-height:1.45}.abono-btn{border:0;border-radius:9px;padding:7px 10px;background:#101828;color:#fff;font-weight:700;cursor:pointer}.payment-backdrop{position:fixed;inset:0;background:#10182899;display:grid;place-items:center;z-index:1000;padding:20px}.payment-modal{width:min(430px,100%);background:#fff;border-radius:18px;padding:22px;display:grid;gap:15px;color:#101828}.payment-modal header,.payment-modal footer{display:flex;justify-content:space-between;align-items:center;gap:12px}.payment-modal header h3{margin:3px 0}.payment-modal header button{border:0;background:none;font-size:28px}.payment-modal label{display:grid;gap:6px}.payment-modal input,.payment-modal select,.payment-modal textarea{padding:11px;border:1px solid #d0d5dd;border-radius:9px}.sale-status-line{display:flex;justify-content:space-between;align-items:center;padding-top:10px;border-top:1px solid var(--ts-border,#e5e7eb);font-size:.86rem;color:var(--ts-muted,#64748b)}.status-chip{padding:6px 10px;border-radius:999px;background:#eef2ff;color:#3730a3;font-weight:800}.sale-items{display:grid;gap:8px}.sale-item-line{display:flex;justify-content:space-between;gap:16px;align-items:center;padding:10px 12px;background:var(--ts-surface-soft,#f8fafc);border-radius:12px}.sale-item-line>div{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.line-status{min-width:180px;border:1px solid var(--ts-border,#d7dce5);border-radius:9px;padding:8px;background:var(--ts-surface,#fff);color:inherit}.delivered-label{font-size:.8rem;font-weight:800;color:#15803d}.sale-notes{margin:0;color:var(--ts-muted,#64748b);font-size:.88rem}@media(max-width:900px){.item-editor{grid-template-columns:1fr 1fr}.item-wide{grid-column:1/-1}}@media(max-width:640px){.edit-grid,.edit-summary{grid-template-columns:1fr}.edit-item-row{grid-template-columns:1fr 80px 110px}.edit-item-row strong{grid-column:1/-1}.cliente-grid,.checkout-grid,.item-editor{grid-template-columns:1fr}.item-wide,.checkout-notes{grid-column:auto}.cart-row{grid-template-columns:1fr auto}.cart-row>.type-pill{grid-column:1}.cart-row>div{grid-column:1/-1}.totals-card{grid-template-columns:1fr}.sale-head,.sale-item-line{align-items:flex-start;flex-direction:column}.sale-money{text-align:left}.line-status{width:100%}}
</style>
