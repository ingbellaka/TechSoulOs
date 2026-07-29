<script setup>
import { ref, onMounted, computed } from 'vue'
import { supabase } from '../lib/supabase'

const movimientos = ref([])
const busqueda = ref('')
const tipoFiltro = ref('Todos')
const mostrarFormulario = ref(false)
const guardando = ref(false)
const cargando = ref(true)
const form = ref({ tipo: 'Entrada', concepto: '', monto: 0, metodo_pago: 'Efectivo', notas: '' })

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
  const { data, error } = await supabase.from('movimientos_caja').select('*').order('id', { ascending: false })
  if (error) alert(error.message)
  movimientos.value = data || []
  cargando.value = false
}

async function guardarMovimiento() {
  const concepto = form.value.concepto.trim()
  const monto = Number(form.value.monto || 0)
  if (!concepto || monto <= 0) return alert('Concepto y monto mayor a cero son obligatorios')

  guardando.value = true
  const { error } = await supabase.from('movimientos_caja').insert({ ...form.value, concepto, monto, notas: form.value.notas.trim() })
  guardando.value = false
  if (error) return alert(error.message)
  form.value = { tipo: 'Entrada', concepto: '', monto: 0, metodo_pago: 'Efectivo', notas: '' }
  mostrarFormulario.value = false
  await cargarMovimientos()
}

onMounted(cargarMovimientos)
</script>

<template>
  <div class="ts-module-page">
    <header class="ts-module-header">
      <div><span class="ts-eyebrow">Finanzas</span><h2>Caja</h2><p>Control centralizado de entradas, salidas y flujo de efectivo.</p></div>
      <button class="ts-action-primary" type="button" @click="mostrarFormulario = !mostrarFormulario"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>{{ mostrarFormulario ? 'Cerrar movimiento' : 'Nuevo movimiento' }}</button>
    </header>

    <section class="ts-metric-strip ts-metric-strip-four">
      <article class="ts-mini-metric ts-metric-positive"><span>Ingresos</span><strong>{{ moneda(ingresos) }}</strong><small>Entradas acumuladas</small></article>
      <article class="ts-mini-metric ts-metric-negative"><span>Salidas</span><strong>{{ moneda(salidas) }}</strong><small>Egresos acumulados</small></article>
      <article class="ts-mini-metric"><span>Saldo estimado</span><strong>{{ moneda(caja) }}</strong><small>Ingresos menos salidas</small></article>
      <article class="ts-mini-metric"><span>Movimiento de hoy</span><strong>{{ moneda(saldoHoy) }}</strong><small>{{ movimientosHoy.length }} operaciones</small></article>
    </section>

    <section v-if="mostrarFormulario" class="ts-panel ts-form-panel">
      <div class="ts-panel-heading"><div><span class="ts-panel-kicker">Registro manual</span><h3>Nuevo movimiento de caja</h3></div><span class="ts-required-note">Se refleja inmediatamente en el saldo</span></div>
      <div class="ts-smart-form">
        <label class="ts-field"><span>Tipo</span><select v-model="form.tipo" class="ts-filter-select ts-select-full"><option>Entrada</option><option>Salida</option></select></label>
        <label class="ts-field ts-field-wide"><span>Concepto *</span><input v-model="form.concepto" placeholder="Ej. Pago de renta, venta, anticipo…"></label>
        <label class="ts-field"><span>Monto *</span><input v-model.number="form.monto" min="0" step="0.01" type="number" placeholder="0.00"></label>
        <label class="ts-field"><span>Método de pago</span><select v-model="form.metodo_pago" class="ts-filter-select ts-select-full"><option>Efectivo</option><option>Transferencia</option><option>Tarjeta</option><option>Mercado Pago</option></select></label>
        <label class="ts-field ts-field-full"><span>Notas</span><textarea v-model="form.notas" rows="2" placeholder="Detalles opcionales"></textarea></label>
        <div class="ts-form-actions ts-field-full"><button class="ts-action-secondary" type="button" @click="mostrarFormulario = false">Cancelar</button><button class="ts-action-primary" type="button" :disabled="guardando" @click="guardarMovimiento">{{ guardando ? 'Guardando…' : 'Guardar movimiento' }}</button></div>
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
        </article>
      </div>
    </section>
  </div>
</template>
