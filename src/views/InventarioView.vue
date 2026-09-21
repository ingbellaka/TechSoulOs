<script setup>
import { computed, onMounted, ref } from 'vue'
import { supabase } from '../lib/supabase'
import { ajustarExistencia, registrarMovimientoInventario } from '../services/integracion.service'

const DRAFT_KEY = 'techsoul_inventory_draft_v1'

const productos = ref([])
const movimientos = ref([])
const cargando = ref(true)
const guardando = ref(false)
const mostrarFormulario = ref(false)
const editandoId = ref(null)
const busqueda = ref('')
const categoriaFiltro = ref('Todas')
const estadoFiltro = ref('Todos')
const mostrarMovimientos = ref(false)

const formInicial = () => ({
  nombre: '',
  categoria: 'Refacciones',
  tipo_producto: 'Pantalla',
  marca: '',
  compatible_con: '',
  calidad: '',
  modalidad: 'stock',
  costo: 0,
  precio_venta: 0,
  stock: 0,
  stock_minimo: 0,
  proveedor: '',
  ubicacion: '',
  notas: ''
})

const form = ref(formInicial())

function moneda(valor) {
  return Number(valor || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
}
function normalizar(valor) {
  return String(valor || '').toLocaleLowerCase('es-MX').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}
function formatoFecha(fecha) {
  return new Date(fecha).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })
}

const categorias = computed(() => ['Todas', ...new Set(productos.value.map(p => p.categoria).filter(Boolean))])
const productosFiltrados = computed(() => {
  const q = normalizar(busqueda.value)
  return productos.value.filter((producto) => {
    const coincideBusqueda = !q || [producto.nombre, producto.categoria, producto.tipo_producto, producto.compatible_con, producto.proveedor, producto.marca, producto.calidad]
      .some(valor => normalizar(valor).includes(q))
    const coincideCategoria = categoriaFiltro.value === 'Todas' || producto.categoria === categoriaFiltro.value
    const bajoPedido = producto.modalidad === 'bajo_pedido'
    const bajo = !bajoPedido && Number(producto.stock || 0) <= Number(producto.stock_minimo || 0)
    const agotado = !bajoPedido && Number(producto.stock || 0) <= 0
    const coincideEstado = estadoFiltro.value === 'Todos'
      || (estadoFiltro.value === 'Bajo pedido' && bajoPedido)
      || (estadoFiltro.value === 'Stock bajo' && bajo && !agotado)
      || (estadoFiltro.value === 'Agotado' && agotado)
      || (estadoFiltro.value === 'Disponible' && !bajoPedido && !bajo)
    return coincideBusqueda && coincideCategoria && coincideEstado
  })
})
const totalProductos = computed(() => productos.value.length)
const unidadesTotales = computed(() => productos.value.reduce((sum, p) => sum + (p.modalidad === 'bajo_pedido' ? 0 : Number(p.stock || 0)), 0))
const stockBajo = computed(() => productos.value.filter(p => p.modalidad !== 'bajo_pedido' && Number(p.stock || 0) <= Number(p.stock_minimo || 0)).length)
const bajoPedido = computed(() => productos.value.filter(p => p.modalidad === 'bajo_pedido').length)
const valorInventario = computed(() => productos.value.reduce((sum, p) => sum + (p.modalidad === 'bajo_pedido' ? 0 : Number(p.stock || 0) * Number(p.costo || 0)), 0))

async function cargarProductos() {
  cargando.value = true
  const { data, error } = await supabase.from('productos').select('*').order('id', { ascending: false })
  if (error) alert(error.message)
  productos.value = data || []
  cargando.value = false
}
function abrirNuevo() {
  editandoId.value = null
  form.value = formInicial()
  mostrarFormulario.value = true
}
function editarProducto(producto) {
  editandoId.value = producto.id
  form.value = { ...formInicial(), ...producto }
  mostrarFormulario.value = true
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
function cancelarFormulario() {
  mostrarFormulario.value = false
  editandoId.value = null
  form.value = formInicial()
  localStorage.removeItem(DRAFT_KEY)
}
async function guardarProducto() {
  if (!form.value.nombre.trim()) return alert('El nombre de la refacción es obligatorio')
  guardando.value = true
  const payload = {
    ...form.value,
    costo: Number(form.value.costo || 0), precio_venta: Number(form.value.precio_venta || 0),
    stock: form.value.modalidad === 'bajo_pedido' ? 0 : Number(form.value.stock || 0),
    stock_minimo: form.value.modalidad === 'bajo_pedido' ? 0 : Number(form.value.stock_minimo || 0),
    actualizado_en: new Date().toISOString()
  }
  let error
  if (editandoId.value) {
    ;({ error } = await supabase.from('productos').update(payload).eq('id', editandoId.value))
  } else {
    const result = await supabase.from('productos').insert(payload).select('*')
    error = result.error
    const creado = result.data?.[0]
    if (!error && creado && Number(creado.stock || 0) > 0) await registrarMovimientoInventario({ producto: creado, tipo: 'Entrada inicial', cantidad: Number(creado.stock), stockAnterior: 0, stockNuevo: Number(creado.stock), nota: 'Alta de refacción' })
  }
  guardando.value = false
  if (error) return alert(error.message)
  cancelarFormulario()
  await cargarProductos()
}
async function ajustarStock(producto, cambio, motivo = '') {
  try {
    const nuevoStock = await ajustarExistencia(producto, cambio, { nota: motivo || 'Ajuste rápido' })
    producto.stock = nuevoStock
    await cargarMovimientos()
  } catch (error) { alert(error.message) }
}

async function cargarMovimientos() {
  const { data, error } = await supabase.from('movimientos_inventario').select('*').order('id', { ascending: false })
  if (!error) movimientos.value = data || []
}

async function entradaRapida(producto) {
  const cantidad = Number(prompt('¿Cuántas unidades entraron?', '1'))
  if (!Number.isFinite(cantidad) || cantidad <= 0) return
  await ajustarStock(producto, cantidad, 'Entrada manual')
}
async function salidaRapida(producto) {
  const cantidad = Number(prompt('¿Cuántas unidades se utilizaron o salieron?', '1'))
  if (!Number.isFinite(cantidad) || cantidad <= 0) return
  await ajustarStock(producto, -cantidad, 'Salida manual')
}
function estadoProducto(producto) {
  if (producto.modalidad === 'bajo_pedido') return { texto: 'Bajo pedido', clase: 'ts-stock-info' }
  const stock = Number(producto.stock || 0), minimo = Number(producto.stock_minimo || 0)
  if (stock <= 0) return { texto: 'Agotado', clase: 'ts-stock-danger' }
  if (stock <= minimo) return { texto: 'Stock bajo', clase: 'ts-stock-warning' }
  return { texto: 'Disponible', clase: 'ts-stock-success' }
}
function margen(producto) {
  const costo = Number(producto.costo || 0), venta = Number(producto.precio_venta || 0)
  return venta ? Math.round(((venta - costo) / venta) * 100) : 0
}
function cargarBorradorCotizador() {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null')
    if (!draft) return
    form.value = { ...formInicial(), ...draft }
    mostrarFormulario.value = true
    localStorage.removeItem(DRAFT_KEY)
  } catch { /* sin borrador */ }
}

onMounted(async () => { await Promise.all([cargarProductos(), cargarMovimientos()]); cargarBorradorCotizador() })
</script>

<template>
  <section class="ts-module-page">
    <header class="ts-module-header">
      <div><span class="ts-eyebrow">Inventario progresivo</span><h2>Refacciones y piezas bajo pedido</h2><p>No necesitas crear un catálogo completo: agrega cada pieza conforme la compras o la cotizas.</p></div>
      <div class="inv-header-actions"><button class="ts-action-secondary" type="button" @click="mostrarMovimientos = !mostrarMovimientos">{{ mostrarMovimientos ? 'Ocultar movimientos' : 'Ver movimientos' }}</button><button class="ts-action-primary" type="button" @click="abrirNuevo">+ Nueva refacción</button></div>
    </header>

    <div class="ts-metric-strip inv-metrics">
      <article class="ts-mini-metric"><span>Refacciones</span><strong>{{ totalProductos }}</strong><small>Catálogo construido con el uso</small></article>
      <article class="ts-mini-metric"><span>Unidades físicas</span><strong>{{ unidadesTotales }}</strong><small>Existencia disponible</small></article>
      <article class="ts-mini-metric"><span>Bajo pedido</span><strong>{{ bajoPedido }}</strong><small>Sin stock obligatorio</small></article>
      <article class="ts-mini-metric"><span>Por reponer</span><strong>{{ stockBajo }}</strong><small>En mínimo o agotadas</small></article>
      <article class="ts-mini-metric"><span>Valor a costo</span><strong>{{ moneda(valorInventario) }}</strong><small>Capital en piezas físicas</small></article>
    </div>

    <Transition name="ts-slide-fade">
      <article v-if="mostrarFormulario" class="ts-panel ts-form-panel">
        <div class="ts-panel-heading"><div><span class="ts-panel-kicker">{{ editandoId ? 'Edición' : 'Alta rápida' }}</span><h3>{{ editandoId ? 'Editar refacción' : 'Agregar refacción al usarla' }}</h3></div><span class="ts-required-note">* Campo obligatorio</span></div>
        <form class="ts-smart-form" @submit.prevent="guardarProducto">
          <label class="ts-field ts-field-wide"><span>Nombre *</span><input v-model="form.nombre" placeholder="Ej. Pantalla Samsung A55 OLED"></label>
          <label class="ts-field"><span>Marca</span><input v-model="form.marca" placeholder="Samsung, Apple..."></label>
          <label class="ts-field"><span>Modelo / compatibilidad</span><input v-model="form.compatible_con" placeholder="A55, iPhone 14 Pro Max..."></label>
          <label class="ts-field"><span>Tipo de pieza</span><select v-model="form.tipo_producto"><option>Pantalla</option><option>Batería</option><option>Centro de carga</option><option>Tapa</option><option>Cámara</option><option>Bocina</option><option>Micrófono</option><option>Flex</option><option>Accesorio</option><option>Otra</option></select></label>
          <label class="ts-field"><span>Calidad / variante</span><input v-model="form.calidad" placeholder="OLED, INCELL, alta capacidad..."></label>
          <label class="ts-field"><span>Modalidad</span><select v-model="form.modalidad"><option value="stock">La tengo en inventario</option><option value="bajo_pedido">La compro bajo pedido</option></select></label>
          <label class="ts-field"><span>Costo de compra</span><input v-model.number="form.costo" min="0" step="0.01" type="number"></label>
          <label class="ts-field"><span>Precio de venta opcional</span><input v-model.number="form.precio_venta" min="0" step="0.01" type="number"></label>
          <template v-if="form.modalidad === 'stock'"><label class="ts-field"><span>Existencia inicial</span><input v-model.number="form.stock" min="0" type="number"></label><label class="ts-field"><span>Stock mínimo</span><input v-model.number="form.stock_minimo" min="0" type="number"></label></template>
          <label class="ts-field"><span>Proveedor</span><input v-model="form.proveedor" placeholder="Opcional"></label>
          <label class="ts-field"><span>Ubicación física</span><input v-model="form.ubicacion" placeholder="Cajón 2, vitrina..."></label>
          <label class="ts-field ts-field-full"><span>Notas</span><textarea v-model="form.notas" rows="2" placeholder="Detalles, garantía del proveedor o compatibilidades adicionales"></textarea></label>
          <div class="ts-form-actions ts-field-full"><button class="ts-action-secondary" type="button" @click="cancelarFormulario">Cancelar</button><button class="ts-action-primary" type="submit" :disabled="guardando">{{ guardando ? 'Guardando...' : (editandoId ? 'Guardar cambios' : 'Agregar refacción') }}</button></div>
        </form>
      </article>
    </Transition>

    <article class="ts-panel">
      <div class="ts-orders-toolbar"><label class="ts-search-control ts-search-grow"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input v-model="busqueda" placeholder="Buscar pieza, modelo, calidad o proveedor..."></label><select v-model="categoriaFiltro" class="ts-filter-select"><option v-for="categoria in categorias" :key="categoria">{{ categoria }}</option></select><select v-model="estadoFiltro" class="ts-filter-select"><option>Todos</option><option>Disponible</option><option>Stock bajo</option><option>Agotado</option><option>Bajo pedido</option></select></div>
      <div v-if="cargando" class="ts-empty-state"><div class="ts-spinner"></div><strong>Cargando inventario</strong></div>
      <div v-else-if="!productosFiltrados.length" class="ts-empty-state"><div class="ts-empty-icon"><svg viewBox="0 0 24 24"><path d="m21 8-9 5-9-5 9-5zM3 8v8l9 5 9-5V8M12 13v8"/></svg></div><strong>Empieza con la primera pieza real</strong><p>Registra una pieza en existencia o una refacción que normalmente compras bajo pedido.</p><button class="ts-action-primary" type="button" @click="abrirNuevo">Agregar primera refacción</button></div>
      <div v-else class="ts-inventory-grid">
        <article v-for="producto in productosFiltrados" :key="producto.id" class="ts-product-card">
          <div class="ts-product-card-head"><div class="ts-product-icon"><svg viewBox="0 0 24 24"><path d="m21 8-9 5-9-5 9-5zM3 8v8l9 5 9-5V8M12 13v8"/></svg></div><span class="ts-stock-pill" :class="estadoProducto(producto).clase">{{ estadoProducto(producto).texto }}</span></div>
          <div class="ts-product-copy"><span>{{ producto.tipo_producto || producto.categoria || 'Refacción' }} · {{ producto.calidad || 'General' }}</span><h3>{{ producto.nombre }}</h3><p>{{ [producto.marca, producto.compatible_con].filter(Boolean).join(' · ') || 'Compatibilidad pendiente' }}</p></div>
          <dl class="ts-product-data"><div><dt>Costo</dt><dd>{{ moneda(producto.costo) }}</dd></div><div><dt>Venta</dt><dd>{{ producto.precio_venta ? moneda(producto.precio_venta) : 'Sin tarifa' }}</dd></div><div><dt>Margen</dt><dd>{{ producto.precio_venta ? margen(producto) + '%' : '—' }}</dd></div></dl>
          <div v-if="producto.modalidad !== 'bajo_pedido'" class="ts-stock-control"><div class="inv-stock-info"><span>Existencia</span><strong>{{ producto.stock }}</strong><small>Mínimo: {{ producto.stock_minimo || 0 }} · {{ producto.ubicacion || 'Sin ubicación' }}</small><p v-if="producto.notas" class="inv-product-notes"><b>Notas:</b> {{ producto.notas }}</p></div><div class="inv-stock-actions"><button type="button" @click="salidaRapida(producto)">Salida</button><button type="button" @click="entradaRapida(producto)">Entrada</button></div></div>
          <div v-else class="inv-order-box"><strong>Se compra cuando se autoriza</strong><span>Costo estimado: {{ moneda(producto.costo) }}</span></div>
          <div class="ts-product-footer"><span>{{ producto.proveedor || 'Sin proveedor asignado' }}</span><button class="inv-edit-button" type="button" @click="editarProducto(producto)">Editar</button></div>
        </article>
      </div>
    </article>

    <Transition name="ts-slide-fade">
      <article v-if="mostrarMovimientos" class="ts-panel ts-history-panel">
        <div class="ts-panel-heading">
          <div><span class="ts-panel-kicker">Kardex local</span><h3>Historial de movimientos</h3></div>
          <button class="ts-action-secondary" type="button" @click="mostrarMovimientos = false">Ocultar historial</button>
        </div>
        <div class="inv-movement-list">
          <div v-for="mov in movimientos.slice(0,40)" :key="mov.id">
            <div><strong>{{ mov.producto }}</strong><span>{{ mov.tipo }} · {{ formatoFecha(mov.creado_en) }}</span></div>
            <div class="inv-movement-amount" :class="mov.tipo === 'Salida' ? 'is-out' : 'is-in'"><strong>{{ mov.tipo === 'Salida' ? '−' : '+' }}{{ mov.cantidad }}</strong><span>{{ mov.stock_anterior }} → {{ mov.stock_nuevo }}</span></div>
          </div>
          <p v-if="!movimientos.length" class="ts-empty-inline">Todavía no hay movimientos de inventario.</p>
        </div>
      </article>
    </Transition>
  </section>
</template>

<style scoped>
.inv-header-actions{display:flex;gap:10px;flex-wrap:wrap}.inv-metrics{grid-template-columns:repeat(5,minmax(0,1fr))}.ts-stock-info{background:#e8efff;color:#3156a8}.inv-stock-info{min-width:0;flex:1}.inv-product-notes{margin:7px 0 0;font-size:.82rem;line-height:1.35;color:#475467;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}.inv-product-notes b{color:#344054;font-weight:700}.inv-stock-actions{display:flex;gap:8px;flex-shrink:0}.inv-stock-actions button,.inv-edit-button{border:1px solid #d9e0ea;background:#fff;border-radius:10px;padding:8px 12px;font-weight:700;color:#344054}.inv-stock-actions button:last-child{background:#eef8f2;color:#157347;border-color:#cce8d7}.inv-order-box{padding:14px;border-radius:14px;background:#f6f8fc;display:flex;flex-direction:column;gap:4px}.inv-order-box span{font-size:.84rem;color:#667085}.inv-edit-button{cursor:pointer}.inv-movement-list>div{display:flex;justify-content:space-between;align-items:center;padding:13px 0;border-bottom:1px solid #edf0f5}.inv-movement-list>div>div{display:flex;flex-direction:column}.inv-movement-list span{font-size:.82rem;color:#667085}.inv-movement-amount{text-align:right}.inv-movement-amount.is-in strong{color:#16865a}.inv-movement-amount.is-out strong{color:#d04444}@media(max-width:1100px){.inv-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:700px){.inv-metrics{grid-template-columns:1fr}.inv-header-actions{width:100%}.inv-header-actions button{flex:1}}
</style>
