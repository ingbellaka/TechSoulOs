<script setup>
import { ref, onMounted, computed } from 'vue'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/auth'
import TicketPreviewModal from '../components/tickets/TicketPreviewModal.vue'
import { buildReciboOrden, buildTicketVenta } from '../utils/tickets'

const authStore = useAuthStore()
const movimientos = ref([])
const negocio = ref({})
const ticketActual = ref(null)
const busqueda = ref('')
const tipoFiltro = ref('Todos')
const mostrarFormulario = ref(false)
const guardando = ref(false)
const cargando = ref(true)
const editandoId = ref(null)
const eliminandoId = ref(null)
const form = ref(nuevoFormulario())

const esAdministrador = computed(() => authStore.isAdmin)
const estaEditando = computed(() => Boolean(editandoId.value))

function nuevoFormulario() {
  return { tipo: 'Entrada', concepto: '', monto: 0, metodo_pago: 'Efectivo', notas: '' }
}

const ingresos = computed(() => movimientos.value.filter(m => m.tipo === 'Entrada').reduce((s, m) => s + Number(m.monto || 0), 0))
const salidas = computed(() => movimientos.value.filter(m => m.tipo === 'Salida').reduce((s, m) => s + Number(m.monto || 0), 0))
const caja = computed(() => ingresos.value - salidas.value)
const movimientosHoy = computed(() => {
  const hoy = new Date().toDateString()
  return movimientos.value.filter(m => m.fecha_movimiento && new Date(m.fecha_movimiento).toDateString() === hoy)
})
const saldoHoy = computed(() => movimientosHoy.value.reduce((s, m) => s + (m.tipo === 'Entrada' ? Number(m.monto || 0) : -Number(m.monto || 0)), 0))
const movimientosFiltrados = computed(() => {
  const termino = busqueda.value.trim().toLowerCase()
  return movimientos.value.filter(m => {
    const coincideTipo = tipoFiltro.value === 'Todos' || m.tipo === tipoFiltro.value
    const texto = [m.concepto, m.metodo_pago, m.notas, m.referencia_tipo, m.monto].filter(Boolean).join(' ').toLowerCase()
    return coincideTipo && (!termino || texto.includes(termino))
  })
})

function moneda(valor) { return Number(valor || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }) }
function fecha(valor) { return valor ? new Date(valor).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : 'Sin fecha' }

async function cargarMovimientos() {
  cargando.value = true
  const [{ data, error }, { data: config, error: errorConfig }] = await Promise.all([
    supabase.from('movimientos_caja').select('*').order('id', { ascending: false }),
    supabase.from('configuracion_negocio').select('*').order('id').limit(1).maybeSingle()
  ])
  if (error || errorConfig) alert((error || errorConfig).message)
  movimientos.value = data || []
  negocio.value = config || {}
  cargando.value = false
}

function puedeDocumento(movimiento) {
  return movimiento?.tipo === 'Entrada' && ['orden', 'venta'].includes(String(movimiento?.referencia_tipo || '').toLowerCase()) && movimiento?.referencia_id
}

async function abrirDocumentoMovimiento(movimiento) {
  if (!puedeDocumento(movimiento)) return
  const tipo = String(movimiento.referencia_tipo).toLowerCase()

  if (tipo === 'orden') {
    const [{ data: orden, error: errorOrden }, { data: pagos, error: errorPagos }] = await Promise.all([
      supabase.from('ordenes').select('*, clientes(*), equipos(*)').eq('id', movimiento.referencia_id).single(),
      supabase.from('movimientos_caja').select('*').eq('referencia_tipo', 'orden').eq('referencia_id', movimiento.referencia_id).eq('tipo', 'Entrada').order('id')
    ])
    if (errorOrden || errorPagos) return alert((errorOrden || errorPagos).message)
    const pagadoAnterior = (pagos || []).filter(p => Number(p.id) < Number(movimiento.id)).reduce((sum, p) => sum + Number(p.monto || 0), 0)
    ticketActual.value = buildReciboOrden({ movimiento, orden, negocio: negocio.value, pagadoAnterior })
    return
  }

  const [{ data: venta, error: errorVenta }, { data: items, error: errorItems }] = await Promise.all([
    supabase.from('ventas').select('*').eq('id', movimiento.referencia_id).single(),
    supabase.from('detalle_ventas').select('*').eq('venta_id', movimiento.referencia_id).order('id')
  ])
  if (errorVenta || errorItems) return alert((errorVenta || errorItems).message)
  ticketActual.value = buildTicketVenta({ venta, items: items || [], negocio: negocio.value })
}

function abrirNuevoMovimiento() {
  editandoId.value = null
  form.value = nuevoFormulario()
  mostrarFormulario.value = true
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function cancelarFormulario() {
  mostrarFormulario.value = false
  editandoId.value = null
  form.value = nuevoFormulario()
}

function editarMovimiento(movimiento) {
  if (!esAdministrador.value) return alert('Solo un administrador puede editar movimientos de caja.')

  editandoId.value = movimiento.id
  form.value = {
    tipo: movimiento.tipo || 'Entrada',
    concepto: movimiento.concepto || '',
    monto: Number(movimiento.monto || 0),
    metodo_pago: movimiento.metodo_pago || 'Efectivo',
    notas: movimiento.notas || ''
  }
  mostrarFormulario.value = true
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

async function guardarMovimiento() {
  const concepto = form.value.concepto.trim()
  const monto = Number(form.value.monto || 0)
  if (!concepto || monto <= 0) return alert('Concepto y monto mayor a cero son obligatorios')

  guardando.value = true
  const payload = {
    tipo: form.value.tipo,
    concepto,
    monto,
    metodo_pago: form.value.metodo_pago,
    notas: form.value.notas.trim()
  }

  let error = null
  if (estaEditando.value) {
    if (!esAdministrador.value) {
      guardando.value = false
      return alert('Solo un administrador puede editar movimientos de caja.')
    }
    const respuesta = await supabase.from('movimientos_caja').update(payload).eq('id', editandoId.value)
    error = respuesta.error
  } else {
    const respuesta = await supabase.from('movimientos_caja').insert(payload)
    error = respuesta.error
  }

  guardando.value = false
  if (error) return alert(error.message)

  cancelarFormulario()
  await cargarMovimientos()
}

async function eliminarMovimiento(movimiento) {
  if (!esAdministrador.value) return alert('Solo un administrador puede eliminar movimientos de caja.')

  const referencia = movimiento.referencia_tipo
    ? `\n\nEste movimiento está relacionado con ${movimiento.referencia_tipo} #${movimiento.referencia_id || ''}. Eliminarlo de Caja NO elimina ni modifica el registro de origen.`
    : ''

  const confirmar = window.confirm(
    `¿Eliminar este movimiento?\n\n${movimiento.tipo}: ${movimiento.concepto}\nMonto: ${moneda(movimiento.monto)}${referencia}\n\nEsta acción no se puede deshacer.`
  )
  if (!confirmar) return

  eliminandoId.value = movimiento.id
  const { error } = await supabase.from('movimientos_caja').delete().eq('id', movimiento.id)
  eliminandoId.value = null

  if (error) return alert(error.message)

  if (editandoId.value === movimiento.id) cancelarFormulario()
  await cargarMovimientos()
}

onMounted(cargarMovimientos)
</script>

<template>
  <div class="ts-module-page">
    <header class="ts-module-header">
      <div><span class="ts-eyebrow">Finanzas</span><h2>Caja</h2><p>Control centralizado de entradas, salidas y flujo de efectivo.</p></div>
      <button class="ts-action-primary" type="button" @click="mostrarFormulario ? cancelarFormulario() : abrirNuevoMovimiento()"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>{{ mostrarFormulario ? 'Cerrar movimiento' : 'Nuevo movimiento' }}</button>
    </header>

    <section class="ts-metric-strip ts-metric-strip-four">
      <article class="ts-mini-metric ts-metric-positive"><span>Ingresos</span><strong>{{ moneda(ingresos) }}</strong><small>Entradas acumuladas</small></article>
      <article class="ts-mini-metric ts-metric-negative"><span>Salidas</span><strong>{{ moneda(salidas) }}</strong><small>Egresos acumulados</small></article>
      <article class="ts-mini-metric"><span>Saldo estimado</span><strong>{{ moneda(caja) }}</strong><small>Ingresos menos salidas</small></article>
      <article class="ts-mini-metric"><span>Movimiento de hoy</span><strong>{{ moneda(saldoHoy) }}</strong><small>{{ movimientosHoy.length }} operaciones</small></article>
    </section>

    <section v-if="mostrarFormulario" class="ts-panel ts-form-panel">
      <div class="ts-panel-heading">
        <div><span class="ts-panel-kicker">{{ estaEditando ? 'Edición' : 'Registro manual' }}</span><h3>{{ estaEditando ? 'Editar movimiento de caja' : 'Nuevo movimiento de caja' }}</h3></div>
        <span class="ts-required-note">{{ estaEditando ? 'Los cambios se reflejan inmediatamente' : 'Se refleja inmediatamente en el saldo' }}</span>
      </div>
      <div class="ts-smart-form">
        <label class="ts-field"><span>Tipo</span><select v-model="form.tipo" class="ts-filter-select ts-select-full"><option>Entrada</option><option>Salida</option></select></label>
        <label class="ts-field ts-field-wide"><span>Concepto *</span><input v-model="form.concepto" placeholder="Ej. Pago de renta, venta, anticipo…"></label>
        <label class="ts-field"><span>Monto *</span><input v-model.number="form.monto" min="0" step="0.01" type="number" placeholder="0.00"></label>
        <label class="ts-field"><span>Método de pago</span><select v-model="form.metodo_pago" class="ts-filter-select ts-select-full"><option>Efectivo</option><option>Transferencia</option><option>Tarjeta</option><option>Mercado Pago</option></select></label>
        <label class="ts-field ts-field-full"><span>Notas</span><textarea v-model="form.notas" rows="2" placeholder="Detalles opcionales"></textarea></label>
        <div class="ts-form-actions ts-field-full"><button class="ts-action-secondary" type="button" @click="cancelarFormulario">Cancelar</button><button class="ts-action-primary" type="button" :disabled="guardando" @click="guardarMovimiento">{{ guardando ? 'Guardando…' : (estaEditando ? 'Guardar cambios' : 'Guardar movimiento') }}</button></div>
      </div>
    </section>

    <section class="ts-panel">
      <div class="ts-orders-toolbar">
        <div class="ts-search-control ts-search-grow"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input v-model="busqueda" placeholder="Buscar por concepto, método o referencia"></div>
        <select v-model="tipoFiltro" class="ts-filter-select"><option>Todos</option><option>Entrada</option><option>Salida</option></select>
      </div>

      <div v-if="cargando" class="ts-empty-state"><span class="ts-spinner"></span><p>Cargando movimientos…</p></div>
      <div v-else-if="!movimientosFiltrados.length" class="ts-empty-state"><span class="ts-empty-icon"><svg viewBox="0 0 24 24"><path d="M3 6h16a2 2 0 0 1 2 2v11H5a2 2 0 0 1-2-2zM3 6l14-3v3m1 6h3"/></svg></span><strong>No hay movimientos</strong><p>Registra una entrada o salida para comenzar.</p></div>
      <div v-else class="ts-cash-list">
        <article v-for="movimiento in movimientosFiltrados" :key="movimiento.id" class="ts-cash-row">
          <span class="ts-cash-icon" :class="movimiento.tipo === 'Entrada' ? 'is-entry' : 'is-exit'"><svg v-if="movimiento.tipo === 'Entrada'" viewBox="0 0 24 24"><path d="M12 19V5m-6 6 6-6 6 6"/></svg><svg v-else viewBox="0 0 24 24"><path d="M12 5v14m6-6-6 6-6-6"/></svg></span>
          <div class="ts-cash-main"><span>{{ movimiento.tipo }}</span><strong>{{ movimiento.concepto }}</strong><small>{{ fecha(movimiento.fecha_movimiento) }} · {{ movimiento.metodo_pago || 'Sin método' }}</small></div>
          <span v-if="movimiento.referencia_tipo" class="ts-reference-pill">{{ movimiento.referencia_tipo }} #{{ movimiento.referencia_id }}</span>
          <strong class="ts-cash-amount" :class="movimiento.tipo === 'Entrada' ? 'is-entry' : 'is-exit'">{{ movimiento.tipo === 'Entrada' ? '+' : '−' }}{{ moneda(movimiento.monto) }}</strong>

          <div class="ts-cash-actions">
            <button v-if="puedeDocumento(movimiento)" class="ts-cash-action is-document" type="button" @click="abrirDocumentoMovimiento(movimiento)">
              {{ String(movimiento.referencia_tipo).toLowerCase() === 'orden' ? 'Recibo' : 'Ticket' }}
            </button>
            <button v-if="esAdministrador" class="ts-cash-action" type="button" title="Editar movimiento" @click="editarMovimiento(movimiento)">Editar</button>
            <button v-if="esAdministrador" class="ts-cash-action is-danger" type="button" title="Eliminar movimiento" :disabled="eliminandoId === movimiento.id" @click="eliminarMovimiento(movimiento)">{{ eliminandoId === movimiento.id ? 'Eliminando…' : 'Eliminar' }}</button>
          </div>
        </article>
      </div>
    </section>
    <TicketPreviewModal :ticket="ticketActual" @close="ticketActual = null" />
  </div>
</template>

<style scoped>
.ts-cash-actions{display:flex;align-items:center;gap:6px;margin-left:4px}
.ts-cash-action{border:1px solid var(--ts-border,#dbe3ee);background:var(--ts-surface,#fff);color:var(--ts-text,#334155);border-radius:9px;padding:7px 10px;font-size:.72rem;font-weight:750;cursor:pointer;transition:.15s ease}
.ts-cash-action:hover{background:var(--ts-soft,#f8fafc);border-color:#94a3b8}
.ts-cash-action.is-document{color:#175cff;border-color:#bfdbfe;background:#eff6ff}.ts-cash-action.is-document:hover{background:#dbeafe;border-color:#93c5fd}.ts-cash-action.is-danger{color:#b91c1c;border-color:#fecaca;background:#fff}
.ts-cash-action.is-danger:hover{background:#fef2f2;border-color:#fca5a5}
.ts-cash-action:disabled{opacity:.55;cursor:not-allowed}
@media (max-width:900px){.ts-cash-actions{width:100%;justify-content:flex-end;margin-left:0;padding-top:8px}}
@media(max-width:600px){.ts-metric-strip-four{grid-template-columns:repeat(2,minmax(0,1fr))!important}.ts-cash-list{padding:12px!important;gap:10px!important}.ts-cash-row{position:relative!important;display:grid!important;grid-template-columns:48px minmax(0,1fr)!important;gap:10px 12px!important;padding:15px!important}.ts-cash-icon{grid-row:1/span 2;width:48px!important;height:48px!important}.ts-cash-main{min-width:0}.ts-cash-main strong{font-size:1rem!important;white-space:normal!important;overflow-wrap:anywhere}.ts-cash-main small{font-size:.78rem!important;line-height:1.4}.ts-reference-pill{grid-column:2!important;justify-self:start!important}.ts-cash-amount{grid-column:2!important;justify-self:start!important;font-size:1.25rem!important;margin-top:2px}.ts-cash-actions{grid-column:1/-1!important;width:100%!important;display:grid!important;grid-template-columns:repeat(auto-fit,minmax(90px,1fr))!important;gap:8px!important;padding-top:10px!important;margin:0!important;border-top:1px solid var(--ts-border)}.ts-cash-action{width:100%;min-height:44px;font-size:.82rem!important}.ts-cash-action.is-danger{background:color-mix(in srgb,var(--ts-danger) 8%,var(--ts-surface))!important}.ts-orders-toolbar{padding:12px!important}.ts-orders-toolbar select,.ts-orders-toolbar input{font-size:16px!important}}
</style>
