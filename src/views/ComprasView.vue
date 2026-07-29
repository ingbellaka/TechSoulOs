<script setup>
import { computed, onMounted, ref } from 'vue'
import { supabase } from '../lib/supabase'
import { recibirOrdenCompra, registrarMovimientoCaja } from '../services/integracion.service'

const proveedores = ref([])
const ordenesCompra = ref([])
const productos = ref([])
const cargando = ref(true)
const guardando = ref(false)
const vista = ref('ordenes')
const busqueda = ref('')
const estadoFiltro = ref('Todos')
const mostrarProveedor = ref(false)
const mostrarOrden = ref(false)

const formProveedor = ref({ nombre: '', telefono: '', whatsapp: '', notas: '' })
const ordenCompra = ref({ proveedor_id: '', estado: 'Pendiente', metodo_pago: 'Efectivo', notas: '' })
const itemInicial = () => ({ producto_id: '', descripcion: '', cantidad: 1, costo_unitario: 0 })
const items = ref([itemInicial()])

function moneda(valor) { return Number(valor || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }) }
function fecha(valor) { return valor ? new Date(valor).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Sin fecha' }
function normalizar(valor) { return String(valor || '').toLocaleLowerCase('es-MX').normalize('NFD').replace(/[\u0300-\u036f]/g, '') }
function totalOrden() { return items.value.reduce((sum, item) => sum + Number(item.cantidad || 0) * Number(item.costo_unitario || 0), 0) }
function agregarItem() { items.value.push(itemInicial()) }
function seleccionarProducto(item) {
  const producto = productos.value.find(p => p.id == item.producto_id)
  if (!producto) return
  item.descripcion = producto.nombre
  item.costo_unitario = Number(producto.costo || 0)
}
function quitarItem(index) { if (items.value.length > 1) items.value.splice(index, 1) }

const ordenesFiltradas = computed(() => {
  const q = normalizar(busqueda.value)
  return ordenesCompra.value.filter(oc => {
    const coincide = !q || [oc.folio, oc.proveedores?.nombre, oc.estado, oc.notas].some(v => normalizar(v).includes(q))
    return coincide && (estadoFiltro.value === 'Todos' || oc.estado === estadoFiltro.value)
  })
})
const proveedoresFiltrados = computed(() => {
  const q = normalizar(busqueda.value)
  return proveedores.value.filter(p => !q || [p.nombre, p.telefono, p.whatsapp, p.notas].some(v => normalizar(v).includes(q)))
})
const pendientes = computed(() => ordenesCompra.value.filter(o => o.estado === 'Pendiente').length)
const recibidas = computed(() => ordenesCompra.value.filter(o => o.estado === 'Recibida').length)
const montoPendiente = computed(() => ordenesCompra.value.filter(o => o.estado === 'Pendiente').reduce((s, o) => s + Number(o.total || 0), 0))
const compradoTotal = computed(() => ordenesCompra.value.filter(o => o.estado === 'Recibida').reduce((s, o) => s + Number(o.total || 0), 0))

async function cargar() {
  cargando.value = true
  const [{ data: provs, error: errorProv }, { data: ocs, error: errorOcs }, { data: prods }] = await Promise.all([
    supabase.from('proveedores').select('*').order('nombre'),
    supabase.from('ordenes_compra').select('*, proveedores(nombre)').order('id', { ascending: false }),
    supabase.from('productos').select('*').order('nombre')
  ])
  if (errorProv) alert(errorProv.message)
  if (errorOcs) alert(errorOcs.message)
  proveedores.value = provs || []
  ordenesCompra.value = ocs || []
  productos.value = prods || []
  cargando.value = false
}

async function guardarProveedor() {
  if (!formProveedor.value.nombre.trim()) return alert('El nombre del proveedor es obligatorio')
  guardando.value = true
  const { error } = await supabase.from('proveedores').insert({ ...formProveedor.value })
  guardando.value = false
  if (error) return alert(error.message)
  formProveedor.value = { nombre: '', telefono: '', whatsapp: '', notas: '' }
  mostrarProveedor.value = false
  await cargar()
}

async function generarFolioOC() {
  const year = new Date().getFullYear()
  const { count } = await supabase.from('ordenes_compra').select('*', { count: 'exact', head: true })
  return `OC-${year}-${String((count || 0) + 1).padStart(5, '0')}`
}

async function crearOrdenCompra() {
  const itemsValidos = items.value.filter(i => i.descripcion.trim())
  if (!itemsValidos.length) return alert('Agrega al menos un producto')
  guardando.value = true
  const folio = await generarFolioOC()
  const total = totalOrden()
  const { data: nuevaOC, error: errorOC } = await supabase.from('ordenes_compra').insert({
    folio,
    proveedor_id: ordenCompra.value.proveedor_id || null,
    estado: ordenCompra.value.estado,
    metodo_pago: ordenCompra.value.metodo_pago,
    subtotal: total,
    total,
    notas: ordenCompra.value.notas
  }).select().single()
  if (errorOC) { guardando.value = false; return alert(errorOC.message) }
  const { error: errorDetalle } = await supabase.from('ordenes_compra_detalle').insert(itemsValidos.map(i => ({
    orden_compra_id: nuevaOC.id,
    producto_id: i.producto_id || null,
    descripcion: i.descripcion,
    cantidad: Number(i.cantidad || 1),
    costo_unitario: Number(i.costo_unitario || 0)
  })))
  if (errorDetalle) { guardando.value = false; return alert(errorDetalle.message) }
  if (ordenCompra.value.estado === 'Recibida') await recibirOrdenCompra({ ...nuevaOC, estado: 'Pendiente' }, itemsValidos)
  ordenCompra.value = { proveedor_id: '', estado: 'Pendiente', metodo_pago: 'Efectivo', notas: '' }
  items.value = [itemInicial()]
  mostrarOrden.value = false
  guardando.value = false
  await cargar()
}

async function registrarSalidaCaja(oc) {
  return registrarMovimientoCaja({
    tipo: 'Salida', concepto: `Orden de compra ${oc.folio}`, monto: Number(oc.total || totalOrden()),
    metodoPago: oc.metodo_pago || ordenCompra.value.metodo_pago,
    referenciaTipo: 'orden_compra', referenciaId: oc.id, notas: oc.notas || ordenCompra.value.notas
  })
}

async function marcarRecibida(oc) {
  if (!confirm(`¿Recibir ${oc.folio}? Esto aumentará existencias y registrará la salida de caja.`)) return
  const { data: detalle, error } = await supabase.from('ordenes_compra_detalle').select('*').eq('orden_compra_id', oc.id)
  if (error) return alert(error.message)
  try {
    await recibirOrdenCompra(oc, detalle || [])
    await cargar()
  } catch (e) { alert(e.message) }
}

function whatsappLink(proveedor) {
  const numero = String(proveedor.whatsapp || proveedor.telefono || '').replace(/\D/g, '')
  return numero ? `https://wa.me/${numero}` : ''
}

function claseEstado(estado) {
  if (estado === 'Recibida') return 'ts-stock-success'
  if (estado === 'Cancelada') return 'ts-stock-danger'
  return 'ts-stock-warning'
}

onMounted(cargar)
</script>

<template>
  <section class="ts-module-page">
    <header class="ts-module-header">
      <div><span class="ts-eyebrow">Abastecimiento</span><h2>Compras y proveedores</h2><p>Organiza pedidos, costos y contactos desde un solo lugar.</p></div>
      <div class="ts-header-actions">
        <button class="ts-action-secondary" type="button" @click="mostrarProveedor = !mostrarProveedor">Nuevo proveedor</button>
        <button class="ts-action-primary" type="button" @click="mostrarOrden = !mostrarOrden"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>Nueva compra</button>
      </div>
    </header>

    <div class="ts-metric-strip ts-metric-strip-four">
      <article class="ts-mini-metric"><span>Pendientes</span><strong>{{ pendientes }}</strong><small>Órdenes por recibir</small></article>
      <article class="ts-mini-metric"><span>Recibidas</span><strong>{{ recibidas }}</strong><small>Compras completadas</small></article>
      <article class="ts-mini-metric"><span>Por pagar / recibir</span><strong>{{ moneda(montoPendiente) }}</strong><small>Monto comprometido</small></article>
      <article class="ts-mini-metric"><span>Comprado</span><strong>{{ moneda(compradoTotal) }}</strong><small>Órdenes recibidas</small></article>
    </div>

    <Transition name="ts-slide-fade">
      <article v-if="mostrarProveedor" class="ts-panel ts-form-panel">
        <div class="ts-panel-heading"><div><span class="ts-panel-kicker">Directorio</span><h3>Registrar proveedor</h3></div></div>
        <form class="ts-smart-form" @submit.prevent="guardarProveedor">
          <label class="ts-field ts-field-wide"><span>Nombre *</span><input v-model="formProveedor.nombre" placeholder="Nombre o empresa"></label>
          <label class="ts-field"><span>Teléfono</span><input v-model="formProveedor.telefono" placeholder="667 000 0000"></label>
          <label class="ts-field"><span>WhatsApp</span><input v-model="formProveedor.whatsapp" placeholder="52667..."></label>
          <label class="ts-field ts-field-full"><span>Notas</span><textarea v-model="formProveedor.notas" rows="2" placeholder="Qué productos maneja, horarios, entregas..."></textarea></label>
          <div class="ts-form-actions ts-field-full"><button class="ts-action-secondary" type="button" @click="mostrarProveedor = false">Cancelar</button><button class="ts-action-primary" :disabled="guardando">Guardar proveedor</button></div>
        </form>
      </article>
    </Transition>

    <Transition name="ts-slide-fade">
      <article v-if="mostrarOrden" class="ts-panel ts-form-panel">
        <div class="ts-panel-heading"><div><span class="ts-panel-kicker">Orden de compra</span><h3>Crear nuevo pedido</h3></div><strong class="ts-live-total">{{ moneda(totalOrden()) }}</strong></div>
        <div class="ts-purchase-meta">
          <label class="ts-field"><span>Proveedor</span><select v-model="ordenCompra.proveedor_id"><option value="">Sin proveedor registrado</option><option v-for="p in proveedores" :key="p.id" :value="p.id">{{ p.nombre }}</option></select></label>
          <label class="ts-field"><span>Estado inicial</span><select v-model="ordenCompra.estado"><option>Pendiente</option><option>Recibida</option><option>Cancelada</option></select></label>
          <label class="ts-field"><span>Método de pago</span><select v-model="ordenCompra.metodo_pago"><option>Efectivo</option><option>Transferencia</option><option>Tarjeta</option><option>Mercado Pago</option></select></label>
        </div>
        <div class="ts-purchase-items">
          <div v-for="(item, index) in items" :key="index" class="ts-purchase-row">
            <label class="ts-field"><span>Vincular inventario</span><select v-model="item.producto_id" @change="seleccionarProducto(item)"><option value="">Sin vincular</option><option v-for="p in productos" :key="p.id" :value="p.id">{{ p.nombre }}</option></select></label><label class="ts-field ts-purchase-description"><span>Producto o refacción</span><input v-model="item.descripcion" placeholder="Descripción"></label>
            <label class="ts-field"><span>Cantidad</span><input v-model.number="item.cantidad" min="1" type="number"></label>
            <label class="ts-field"><span>Costo unitario</span><input v-model.number="item.costo_unitario" min="0" step="0.01" type="number"></label>
            <div class="ts-line-total"><span>Subtotal</span><strong>{{ moneda(Number(item.cantidad || 0) * Number(item.costo_unitario || 0)) }}</strong></div>
            <button class="ts-remove-row" type="button" @click="quitarItem(index)">×</button>
          </div>
        </div>
        <button class="ts-action-secondary ts-action-compact" type="button" @click="agregarItem">+ Agregar producto</button>
        <label class="ts-field ts-field-full ts-notes-field"><span>Notas</span><textarea v-model="ordenCompra.notas" rows="2" placeholder="Detalles del pedido, entrega o referencia..."></textarea></label>
        <div class="ts-form-actions"><button class="ts-action-secondary" type="button" @click="mostrarOrden = false">Cancelar</button><button class="ts-action-primary" type="button" :disabled="guardando" @click="crearOrdenCompra">{{ guardando ? 'Creando...' : 'Crear orden' }}</button></div>
      </article>
    </Transition>

    <article class="ts-panel">
      <div class="ts-purchase-tabs"><button :class="{ active: vista === 'ordenes' }" @click="vista = 'ordenes'">Órdenes de compra <span>{{ ordenesCompra.length }}</span></button><button :class="{ active: vista === 'proveedores' }" @click="vista = 'proveedores'">Proveedores <span>{{ proveedores.length }}</span></button></div>
      <div class="ts-orders-toolbar">
        <label class="ts-search-control ts-search-grow"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input v-model="busqueda" :placeholder="vista === 'ordenes' ? 'Buscar folio o proveedor...' : 'Buscar proveedor o teléfono...' "></label>
        <select v-if="vista === 'ordenes'" v-model="estadoFiltro" class="ts-filter-select"><option>Todos</option><option>Pendiente</option><option>Recibida</option><option>Cancelada</option></select>
      </div>

      <div v-if="cargando" class="ts-empty-state"><div class="ts-spinner"></div><strong>Cargando compras</strong></div>
      <template v-else-if="vista === 'ordenes'">
        <div v-if="!ordenesFiltradas.length" class="ts-empty-state"><div class="ts-empty-icon"><svg viewBox="0 0 24 24"><path d="M10 17h4V5H2v12h3m9-8h4l4 4v4h-3"/></svg></div><strong>No hay órdenes para mostrar</strong><p>Crea un pedido o cambia los filtros.</p></div>
        <div v-else class="ts-purchase-list">
          <article v-for="oc in ordenesFiltradas" :key="oc.id" class="ts-purchase-card">
            <div class="ts-purchase-main"><div class="ts-purchase-icon"><svg viewBox="0 0 24 24"><path d="M10 17h4V5H2v12h3m9-8h4l4 4v4h-3m-14 0a2 2 0 1 0 4 0m10 0a2 2 0 1 0 4 0"/></svg></div><div><span>{{ oc.folio }}</span><h3>{{ oc.proveedores?.nombre || 'Proveedor no registrado' }}</h3><small>{{ fecha(oc.fecha_orden) }} · {{ oc.metodo_pago || 'Sin método' }}</small></div></div>
            <span class="ts-stock-pill" :class="claseEstado(oc.estado)">{{ oc.estado }}</span>
            <div class="ts-purchase-amount"><span>Total</span><strong>{{ moneda(oc.total) }}</strong></div>
            <div class="ts-purchase-actions"><router-link class="ts-action-secondary ts-action-compact" :to="`/compras/${oc.id}`">Ver / PDF</router-link><button v-if="oc.estado === 'Pendiente'" class="ts-action-primary ts-action-compact" @click="marcarRecibida(oc)">Marcar recibida</button></div>
          </article>
        </div>
      </template>
      <template v-else>
        <div v-if="!proveedoresFiltrados.length" class="ts-empty-state"><div class="ts-empty-icon"><svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8"/></svg></div><strong>No hay proveedores</strong><p>Registra los contactos con los que compras refacciones y accesorios.</p></div>
        <div v-else class="ts-provider-grid">
          <article v-for="proveedor in proveedoresFiltrados" :key="proveedor.id" class="ts-provider-card">
            <div class="ts-provider-avatar">{{ proveedor.nombre?.slice(0, 2).toUpperCase() }}</div><div class="ts-provider-copy"><h3>{{ proveedor.nombre }}</h3><span>{{ proveedor.telefono || proveedor.whatsapp || 'Sin teléfono' }}</span><p>{{ proveedor.notas || 'Sin notas registradas.' }}</p></div>
            <a v-if="whatsappLink(proveedor)" class="ts-whatsapp-button" :href="whatsappLink(proveedor)" target="_blank" rel="noopener">WhatsApp</a>
          </article>
        </div>
      </template>
    </article>
  </section>
</template>
