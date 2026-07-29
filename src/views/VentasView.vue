<script setup>
import { computed, onMounted, ref } from 'vue'
import { supabase } from '../lib/supabase'
import { registrarAbonoVenta } from '../services/flujo-operativo.service'

const productos = ref([])
const ventas = ref([])
const detalles = ref([])
const busqueda = ref('')
const estadoFiltro = ref('Todos')
const mostrarVenta = ref(false)
const procesando = ref(false)
const cargando = ref(true)
const ventaAbono = ref(null)
const abono = ref({ monto: 0, metodo_pago: 'Efectivo', notas: '' })

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
  const [{ data: prods, error: errorProductos }, { data: vtas, error: errorVentas }, { data: dets, error: errorDetalles }] = await Promise.all([
    supabase.from('productos').select('*').order('nombre'),
    supabase.from('ventas').select('*').order('id', { ascending: false }),
    supabase.from('detalle_ventas').select('*').order('id', { ascending: false })
  ])
  const error = errorProductos || errorVentas || errorDetalles
  if (error) alert(error.message)
  productos.value = prods || []
  ventas.value = (vtas || []).map(v => ({
    ...v,
    pagado: Number(v.pagado ?? v.anticipo ?? v.total ?? 0),
    saldo: Number(v.saldo ?? Math.max(0, Number(v.total || 0) - Number(v.anticipo ?? v.total ?? 0))),
    estado_entrega: v.estado_entrega || 'Entregado'
  }))
  detalles.value = dets || []
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

onMounted(cargar)
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
          <div class="sale-status-line"><span class="status-chip">{{ venta.estado_entrega }}</span><div class="sale-line-actions"><span>{{ itemsVenta(venta.id).length }} concepto(s)</span><button v-if="venta.saldo > 0" class="abono-btn" @click="abrirAbono(venta)">Registrar abono</button></div></div>
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
.venta-builder{display:grid;gap:22px}.cliente-grid,.checkout-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.tipo-tabs{display:flex;gap:8px;flex-wrap:wrap;padding:6px;background:var(--ts-surface-soft,#f5f7fb);border-radius:14px}.tipo-tabs button{border:0;background:transparent;padding:10px 14px;border-radius:10px;font-weight:700;cursor:pointer;color:inherit}.tipo-tabs button.active{background:var(--ts-surface,#fff);box-shadow:0 4px 16px rgba(15,23,42,.08);color:var(--ts-primary,#2563eb)}.item-editor{display:grid;grid-template-columns:2fr repeat(3,minmax(130px,1fr));gap:14px;align-items:end;padding:18px;border:1px solid var(--ts-border,#e5e7eb);border-radius:16px}.item-wide{grid-column:span 2}.item-add{display:flex;align-items:center;justify-content:space-between;gap:12px;grid-column:1/-1;padding-top:4px}.cart-list{display:grid;gap:10px}.cart-row{display:grid;grid-template-columns:auto 1fr auto auto;align-items:center;gap:14px;padding:14px 16px;border:1px solid var(--ts-border,#e5e7eb);border-radius:14px}.cart-row div{display:grid;gap:3px}.cart-row small,.sale-head small,.sale-item-line small{color:var(--ts-muted,#64748b)}.cart-empty{padding:24px;text-align:center;border:1px dashed var(--ts-border,#d6dae3);border-radius:14px;color:var(--ts-muted,#64748b)}.type-pill{display:inline-flex;width:max-content;padding:5px 9px;border-radius:999px;font-size:.72rem;font-weight:800;background:#e2e8f0}.type-encargo{background:#fef3c7;color:#92400e}.type-servicio{background:#dbeafe;color:#1d4ed8}.type-libre{background:#ede9fe;color:#6d28d9}.type-inventario{background:#dcfce7;color:#166534}.remove-line{width:30px;height:30px;border:0;border-radius:50%;font-size:22px;cursor:pointer;background:#fee2e2;color:#b91c1c}.checkout-notes{grid-column:1/-1}.totals-card{grid-column:1/-1;display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:16px;border-radius:14px;background:var(--ts-surface-soft,#f5f7fb)}.totals-card div{display:grid;gap:5px}.totals-card .balance strong{font-size:1.2rem}.smart-sales-list{display:grid;gap:14px}.smart-sale-card{border:1px solid var(--ts-border,#e5e7eb);border-radius:16px;padding:18px;display:grid;gap:14px}.sale-head{display:flex;justify-content:space-between;gap:20px}.sale-head>div:first-child{display:grid;gap:4px}.sale-money{text-align:right;display:grid;gap:4px}.sale-money>strong{font-size:1.25rem}.sale-line-actions{display:flex;align-items:center;gap:10px}.abono-btn{border:0;border-radius:9px;padding:7px 10px;background:#101828;color:#fff;font-weight:700;cursor:pointer}.payment-backdrop{position:fixed;inset:0;background:#10182899;display:grid;place-items:center;z-index:1000;padding:20px}.payment-modal{width:min(430px,100%);background:#fff;border-radius:18px;padding:22px;display:grid;gap:15px;color:#101828}.payment-modal header,.payment-modal footer{display:flex;justify-content:space-between;align-items:center;gap:12px}.payment-modal header h3{margin:3px 0}.payment-modal header button{border:0;background:none;font-size:28px}.payment-modal label{display:grid;gap:6px}.payment-modal input,.payment-modal select,.payment-modal textarea{padding:11px;border:1px solid #d0d5dd;border-radius:9px}.sale-status-line{display:flex;justify-content:space-between;align-items:center;padding-top:10px;border-top:1px solid var(--ts-border,#e5e7eb);font-size:.86rem;color:var(--ts-muted,#64748b)}.status-chip{padding:6px 10px;border-radius:999px;background:#eef2ff;color:#3730a3;font-weight:800}.sale-items{display:grid;gap:8px}.sale-item-line{display:flex;justify-content:space-between;gap:16px;align-items:center;padding:10px 12px;background:var(--ts-surface-soft,#f8fafc);border-radius:12px}.sale-item-line>div{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.line-status{min-width:180px;border:1px solid var(--ts-border,#d7dce5);border-radius:9px;padding:8px;background:var(--ts-surface,#fff);color:inherit}.delivered-label{font-size:.8rem;font-weight:800;color:#15803d}.sale-notes{margin:0;color:var(--ts-muted,#64748b);font-size:.88rem}@media(max-width:900px){.item-editor{grid-template-columns:1fr 1fr}.item-wide{grid-column:1/-1}}@media(max-width:640px){.cliente-grid,.checkout-grid,.item-editor{grid-template-columns:1fr}.item-wide,.checkout-notes{grid-column:auto}.cart-row{grid-template-columns:1fr auto}.cart-row>.type-pill{grid-column:1}.cart-row>div{grid-column:1/-1}.totals-card{grid-template-columns:1fr}.sale-head,.sale-item-line{align-items:flex-start;flex-direction:column}.sale-money{text-align:left}.line-status{width:100%}}
</style>
