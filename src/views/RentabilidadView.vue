<script setup>
import { computed, onMounted, ref } from 'vue'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const cargando = ref(true)
const guardando = ref(false)
const gastos = ref([])
const pagos = ref([])
const movimientos = ref([])
const config = ref({ id: 1, meta_utilidad_neta: 20000, margen_contribucion_objetivo: 60 })
const mostrarForm = ref(false)
const mostrarConfig = ref(false)
const mesSeleccionado = ref(new Date().toISOString().slice(0, 7))
const form = ref(nuevoGasto())

function nuevoGasto() {
  return { categoria: 'Renta', descripcion: '', monto: 0, periodicidad: 'Mensual', dia_pago: 1, notas: '' }
}

const categorias = ['Renta', 'Sueldos', 'Servicios', 'Software', 'Publicidad', 'Contabilidad', 'Limpieza', 'Seguros', 'Telefonía', 'Otros']
const periodicidades = ['Semanal', 'Mensual', 'Trimestral', 'Semestral', 'Anual']

function moneda(v) {
  return Number(v || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })
}

function rangoMes() {
  const [y, m] = mesSeleccionado.value.split('-').map(Number)
  const inicio = new Date(y, m - 1, 1)
  const fin = new Date(y, m, 1)
  return { inicio, fin }
}

function periodoSQL() {
  return `${mesSeleccionado.value}-01`
}

function mensualizar(gasto) {
  const monto = Number(gasto.monto || 0)
  return ({ Semanal: monto * 52 / 12, Mensual: monto, Trimestral: monto / 3, Semestral: monto / 6, Anual: monto / 12 })[gasto.periodicidad] ?? monto
}

const gastosActivos = computed(() => gastos.value.filter(g => g.activo !== false))
const gastosFijosMensuales = computed(() => gastosActivos.value.reduce((s, g) => s + mensualizar(g), 0))
const pagosPeriodo = computed(() => pagos.value.filter(p => String(p.periodo || '').slice(0, 7) === mesSeleccionado.value))
const pagosIds = computed(() => new Set(pagosPeriodo.value.map(p => String(p.gasto_fijo_id))))
const gastosPagados = computed(() => pagosPeriodo.value.reduce((s, p) => s + Number(p.monto || 0), 0))

const movimientosMes = computed(() => {
  const { inicio, fin } = rangoMes()
  return movimientos.value.filter(m => {
    const d = new Date(m.fecha_movimiento || m.created_at || 0)
    return d >= inicio && d < fin
  })
})
const ingresosMes = computed(() => movimientosMes.value.filter(m => m.tipo === 'Entrada').reduce((s, m) => s + Number(m.monto || 0), 0))
const salidasFijasRegistradas = computed(() => movimientosMes.value.filter(m => m.tipo === 'Salida' && m.referencia_tipo === 'gasto_fijo').reduce((s, m) => s + Number(m.monto || 0), 0))
const otrasSalidas = computed(() => movimientosMes.value.filter(m => m.tipo === 'Salida' && m.referencia_tipo !== 'gasto_fijo').reduce((s, m) => s + Number(m.monto || 0), 0))
const utilidadEstimada = computed(() => ingresosMes.value - otrasSalidas.value - gastosFijosMensuales.value)
const margenObjetivo = computed(() => Math.max(1, Number(config.value.margen_contribucion_objetivo || 60)) / 100)
const puntoEquilibrio = computed(() => gastosFijosMensuales.value / margenObjetivo.value)
const metaUtilidad = computed(() => Number(config.value.meta_utilidad_neta || 0))
const metaVentas = computed(() => (gastosFijosMensuales.value + metaUtilidad.value) / margenObjetivo.value)
const avanceMeta = computed(() => metaVentas.value ? Math.min(100, Math.round((ingresosMes.value / metaVentas.value) * 100)) : 0)
const faltanteVentas = computed(() => Math.max(0, metaVentas.value - ingresosMes.value))
const diasMes = computed(() => {
  const [y, m] = mesSeleccionado.value.split('-').map(Number)
  return new Date(y, m, 0).getDate()
})
const diasTranscurridos = computed(() => {
  const now = new Date()
  const [y, m] = mesSeleccionado.value.split('-').map(Number)
  if (now.getFullYear() !== y || now.getMonth() + 1 !== m) return diasMes.value
  return now.getDate()
})
const diasRestantes = computed(() => Math.max(1, diasMes.value - diasTranscurridos.value + 1))
const metaDiariaRestante = computed(() => faltanteVentas.value / diasRestantes.value)
const rentable = computed(() => utilidadEstimada.value >= metaUtilidad.value)
const progresoGastos = computed(() => gastosFijosMensuales.value ? Math.round((gastosPagados.value / gastosFijosMensuales.value) * 100) : 0)

const movimientosRecientes = computed(() => [...movimientosMes.value].sort((a, b) => new Date(b.fecha_movimiento || b.created_at) - new Date(a.fecha_movimiento || a.created_at)).slice(0, 7))

function barrasSemanas() {
  const { inicio, fin } = rangoMes()
  const semanas = [0, 0, 0, 0, 0]
  movimientos.value.forEach(m => {
    if (m.tipo !== 'Entrada') return
    const d = new Date(m.fecha_movimiento || m.created_at || 0)
    if (d < inicio || d >= fin) return
    const idx = Math.min(4, Math.floor((d.getDate() - 1) / 7))
    semanas[idx] += Number(m.monto || 0)
  })
  const max = Math.max(...semanas, 1)
  return semanas.map((v, i) => ({ label: i === 4 ? '29–31' : `${i * 7 + 1}–${Math.min((i + 1) * 7, diasMes.value)}`, valor: v, alto: Math.max(8, Math.round(v / max * 100)) }))
}
const semanas = computed(barrasSemanas)

async function cargar() {
  cargando.value = true
  const [rGastos, rPagos, rMov, rConfig] = await Promise.all([
    supabase.from('gastos_fijos').select('*').order('activo', { ascending: false }).order('categoria'),
    supabase.from('gastos_fijos_pagos').select('*').order('fecha_pago', { ascending: false }),
    supabase.from('movimientos_caja').select('*').order('fecha_movimiento', { ascending: false }),
    supabase.from('rentabilidad_config').select('*').eq('id', 1).maybeSingle()
  ])
  const error = rGastos.error || rPagos.error || rMov.error || rConfig.error
  if (error) alert(`Rentabilidad: ${error.message}`)
  gastos.value = rGastos.data || []
  pagos.value = rPagos.data || []
  movimientos.value = rMov.data || []
  if (rConfig.data) config.value = { ...config.value, ...rConfig.data }
  cargando.value = false
}

async function agregarGasto() {
  if (!form.value.descripcion.trim()) return alert('Escribe una descripción')
  if (Number(form.value.monto || 0) <= 0) return alert('El monto debe ser mayor a cero')
  guardando.value = true
  const { error } = await supabase.from('gastos_fijos').insert({
    ...form.value,
    descripcion: form.value.descripcion.trim(),
    monto: Number(form.value.monto || 0),
    dia_pago: form.value.dia_pago ? Number(form.value.dia_pago) : null,
    notas: form.value.notas?.trim() || null
  })
  guardando.value = false
  if (error) return alert(error.message)
  form.value = nuevoGasto()
  mostrarForm.value = false
  await cargar()
}

async function toggleGasto(gasto) {
  const { error } = await supabase.from('gastos_fijos').update({ activo: !gasto.activo, updated_at: new Date().toISOString() }).eq('id', gasto.id)
  if (error) return alert(error.message)
  await cargar()
}

async function eliminarGasto(gasto) {
  if (!confirm(`¿Eliminar “${gasto.descripcion}”?`)) return
  const { error } = await supabase.from('gastos_fijos').delete().eq('id', gasto.id)
  if (error) return alert(error.message)
  await cargar()
}

async function marcarPagado(gasto) {
  if (pagosIds.value.has(String(gasto.id))) return
  const montoMes = mensualizar(gasto)
  guardando.value = true
  const { data: pago, error: pagoError } = await supabase.from('gastos_fijos_pagos').insert({
    gasto_fijo_id: gasto.id,
    periodo: periodoSQL(),
    monto: montoMes,
    notas: `Pago ${gasto.descripcion}`
  }).select().single()
  if (pagoError) { guardando.value = false; return alert(pagoError.message) }

  const { data: mov, error: movError } = await supabase.from('movimientos_caja').insert({
    tipo: 'Salida',
    concepto: `Gasto fijo · ${gasto.descripcion}`,
    monto: montoMes,
    metodo_pago: 'Transferencia',
    referencia_tipo: 'gasto_fijo',
    referencia_id: gasto.id,
    notas: `Periodo ${mesSeleccionado.value}`,
    fecha_movimiento: new Date().toISOString()
  }).select().single()

  if (movError) {
    await supabase.from('gastos_fijos_pagos').delete().eq('id', pago.id)
    guardando.value = false
    return alert(movError.message)
  }

  await supabase.from('gastos_fijos_pagos').update({ movimiento_caja_id: mov.id }).eq('id', pago.id)
  guardando.value = false
  await cargar()
}

async function guardarConfig() {
  guardando.value = true
  const { error } = await supabase.from('rentabilidad_config').upsert({
    id: 1,
    meta_utilidad_neta: Number(config.value.meta_utilidad_neta || 0),
    margen_contribucion_objetivo: Number(config.value.margen_contribucion_objetivo || 60),
    updated_at: new Date().toISOString()
  })
  guardando.value = false
  if (error) return alert(error.message)
  mostrarConfig.value = false
}

onMounted(async () => {
  if (!auth.user) await auth.initialize()
  await cargar()
})
</script>

<template>
  <section class="rent-page">
    <header class="rent-header">
      <div>
        <span class="eyebrow">Finanzas · Solo administradores</span>
        <h1>Rentabilidad</h1>
        <p>Controla gastos fijos, punto de equilibrio y la meta de utilidad de TechSoul.</p>
      </div>
      <label class="month-picker"><span>Periodo</span><input v-model="mesSeleccionado" type="month"></label>
    </header>

    <div v-if="cargando" class="panel loading">Cargando información financiera…</div>

    <template v-else>
      <div class="kpi-grid">
        <article class="kpi green"><span>Ingresos del mes</span><strong>{{ moneda(ingresosMes) }}</strong><small>Entradas registradas en caja</small></article>
        <article class="kpi red"><span>Otros egresos</span><strong>{{ moneda(otrasSalidas) }}</strong><small>Refacciones, compras y salidas variables</small></article>
        <article class="kpi blue"><span>Gastos fijos mensuales</span><strong>{{ moneda(gastosFijosMensuales) }}</strong><small>{{ progresoGastos }}% marcado como pagado</small></article>
        <article class="kpi purple"><span>Utilidad neta estimada</span><strong>{{ moneda(utilidadEstimada) }}</strong><small>Ingresos − variables − gastos fijos</small></article>
      </div>

      <div class="top-grid">
        <article class="panel chart-card">
          <div class="panel-head"><div><span class="eyebrow">Comportamiento del mes</span><h2>Ingresos por semana</h2></div></div>
          <div class="chart-wrap">
            <div v-for="bar in semanas" :key="bar.label" class="bar-column">
              <div class="bar-value">{{ moneda(bar.valor) }}</div>
              <div class="bar-track"><div class="bar" :style="{ height: `${bar.alto}%` }"></div></div>
              <span>{{ bar.label }}</span>
            </div>
          </div>
        </article>

        <article class="panel goal-card">
          <div class="panel-head"><div><span class="eyebrow">Meta del mes</span><h2>Avance hacia rentabilidad</h2></div><button class="link-btn" @click="mostrarConfig = true">Editar meta</button></div>
          <div class="goal-money"><strong>{{ moneda(ingresosMes) }}</strong><span>/ {{ moneda(metaVentas) }}</span></div>
          <div class="progress"><i :style="{ width: `${avanceMeta}%` }"></i></div>
          <div class="goal-percent">{{ avanceMeta }}%</div>
          <div class="goal-mini-grid">
            <div><span>Meta de utilidad</span><strong>{{ moneda(metaUtilidad) }}</strong></div>
            <div class="danger"><span>Ventas faltantes</span><strong>{{ moneda(faltanteVentas) }}</strong></div>
            <div><span>Meta diaria restante</span><strong>{{ moneda(metaDiariaRestante) }}</strong></div>
            <div><span>Días restantes</span><strong>{{ diasRestantes }}</strong></div>
          </div>
        </article>

        <article class="panel health-card" :class="{ good: rentable }">
          <span class="health-icon">{{ rentable ? '✓' : '↗' }}</span>
          <h2>{{ rentable ? 'Meta alcanzada' : '¿Es rentable?' }}</h2>
          <p v-if="rentable">Ya alcanzaste la utilidad neta objetivo configurada para este mes.</p>
          <p v-else>Para alcanzar {{ moneda(metaUtilidad) }} de utilidad, necesitas aproximadamente {{ moneda(faltanteVentas) }} más en ventas al margen objetivo.</p>
          <div class="health-note">Punto de equilibrio: <strong>{{ moneda(puntoEquilibrio) }}</strong></div>
        </article>
      </div>

      <div class="bottom-grid">
        <article class="panel expenses-card">
          <div class="panel-head"><div><span class="eyebrow">Plan mensual</span><h2>Gastos fijos</h2></div><button class="primary-small" @click="mostrarForm = true">+ Agregar gasto</button></div>
          <div class="expense-list">
            <div v-if="!gastos.length" class="empty">Aún no has registrado gastos fijos.</div>
            <div v-for="gasto in gastos" :key="gasto.id" class="expense-row" :class="{ muted: !gasto.activo }">
              <div class="expense-main"><span class="expense-dot"></span><div><strong>{{ gasto.categoria }}</strong><small>{{ gasto.descripcion }} · {{ gasto.periodicidad }}</small></div></div>
              <div class="expense-amount"><strong>{{ moneda(mensualizar(gasto)) }}</strong><small>/ mes</small></div>
              <button v-if="gasto.activo && !pagosIds.has(String(gasto.id))" class="pay-btn" @click="marcarPagado(gasto)">Marcar pagado</button>
              <span v-else-if="gasto.activo" class="paid-pill">Pagado</span>
              <button class="icon-btn" :title="gasto.activo ? 'Desactivar' : 'Activar'" @click="toggleGasto(gasto)">{{ gasto.activo ? '◉' : '○' }}</button>
              <button class="icon-btn danger-text" title="Eliminar" @click="eliminarGasto(gasto)">×</button>
            </div>
          </div>
          <div class="expense-total"><span>Total mensual planeado</span><strong>{{ moneda(gastosFijosMensuales) }}</strong></div>
        </article>

        <article class="panel equilibrium-card">
          <div class="panel-head"><div><span class="eyebrow">Planeación</span><h2>Meta y punto de equilibrio</h2></div></div>
          <dl>
            <div><dt>Gastos fijos mensuales</dt><dd>{{ moneda(gastosFijosMensuales) }}</dd></div>
            <div><dt>Margen de contribución objetivo</dt><dd>{{ config.margen_contribucion_objetivo }}%</dd></div>
            <div class="highlight"><dt>Punto de equilibrio</dt><dd>{{ moneda(puntoEquilibrio) }}</dd></div>
            <div class="profit"><dt>Meta de utilidad neta</dt><dd>{{ moneda(metaUtilidad) }}</dd></div>
            <div class="target"><dt>Meta total de ventas</dt><dd>{{ moneda(metaVentas) }}</dd></div>
          </dl>
          <p class="formula-note">Con el margen configurado, necesitas vender aprox. <strong>{{ moneda(metaVentas) }}</strong> para cubrir gastos y dejar {{ moneda(metaUtilidad) }} de utilidad neta.</p>
        </article>

        <article class="panel movements-card">
          <div class="panel-head"><div><span class="eyebrow">Caja</span><h2>Movimientos recientes</h2></div><router-link to="/caja">Ver caja →</router-link></div>
          <div class="movement-list">
            <div v-if="!movimientosRecientes.length" class="empty">Sin movimientos en este periodo.</div>
            <div v-for="m in movimientosRecientes" :key="m.id" class="movement-row">
              <div><strong>{{ m.concepto || 'Movimiento' }}</strong><small>{{ new Date(m.fecha_movimiento || m.created_at).toLocaleDateString('es-MX', { day:'2-digit', month:'short' }) }}</small></div>
              <span :class="m.tipo === 'Entrada' ? 'income' : 'outcome'">{{ m.tipo === 'Entrada' ? '+' : '−' }}{{ moneda(m.monto) }}</span>
            </div>
          </div>
        </article>
      </div>
    </template>

    <div v-if="mostrarForm" class="modal-backdrop" @click.self="mostrarForm = false">
      <form class="modal-card" @submit.prevent="agregarGasto">
        <div class="modal-head"><div><span class="eyebrow">Nuevo</span><h2>Gasto fijo</h2></div><button type="button" @click="mostrarForm=false">×</button></div>
        <div class="form-grid">
          <label><span>Categoría</span><select v-model="form.categoria"><option v-for="c in categorias" :key="c">{{ c }}</option></select></label>
          <label><span>Descripción</span><input v-model="form.descripcion" placeholder="Ej. Renta local Santa Fe"></label>
          <label><span>Monto</span><input v-model.number="form.monto" type="number" min="0" step="0.01"></label>
          <label><span>Periodicidad</span><select v-model="form.periodicidad"><option v-for="p in periodicidades" :key="p">{{ p }}</option></select></label>
          <label><span>Día de pago</span><input v-model.number="form.dia_pago" type="number" min="1" max="31"></label>
          <label class="full"><span>Notas</span><textarea v-model="form.notas" rows="3" placeholder="Opcional"></textarea></label>
        </div>
        <div class="modal-actions"><button type="button" class="secondary" @click="mostrarForm=false">Cancelar</button><button class="primary" :disabled="guardando">{{ guardando ? 'Guardando…' : 'Guardar gasto' }}</button></div>
      </form>
    </div>

    <div v-if="mostrarConfig" class="modal-backdrop" @click.self="mostrarConfig = false">
      <form class="modal-card small" @submit.prevent="guardarConfig">
        <div class="modal-head"><div><span class="eyebrow">Objetivos</span><h2>Configurar meta</h2></div><button type="button" @click="mostrarConfig=false">×</button></div>
        <div class="form-grid one">
          <label><span>Utilidad neta deseada al mes</span><input v-model.number="config.meta_utilidad_neta" type="number" min="0" step="500"></label>
          <label><span>Margen de contribución objetivo (%)</span><input v-model.number="config.margen_contribucion_objetivo" type="number" min="1" max="100" step="1"></label>
        </div>
        <p class="help-text">Puedes empezar con $15,000–$20,000 de utilidad y ajustar el margen cuando tengas más meses de datos reales.</p>
        <div class="modal-actions"><button type="button" class="secondary" @click="mostrarConfig=false">Cancelar</button><button class="primary" :disabled="guardando">Guardar meta</button></div>
      </form>
    </div>
  </section>
</template>

<style scoped>
.rent-page{max-width:1680px;margin:0 auto;padding-bottom:36px;color:var(--ts-text,#0f172a)}.rent-header{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin-bottom:22px}.eyebrow{display:block;margin-bottom:6px;color:#2563eb;font-size:11px;font-weight:850;letter-spacing:.12em;text-transform:uppercase}.rent-header h1{margin:0;font-size:clamp(30px,3vw,42px);letter-spacing:-.04em}.rent-header p{margin:8px 0 0;color:#64748b;font-size:15px}.month-picker{min-width:220px}.month-picker span,label>span{display:block;margin-bottom:6px;color:#64748b;font-size:12px;font-weight:750}.month-picker input,.form-grid input,.form-grid select,.form-grid textarea{width:100%;border:1px solid #dbe3ee;border-radius:12px;background:#fff;color:#0f172a;padding:12px 13px;font:inherit;outline:none}.month-picker input:focus,.form-grid input:focus,.form-grid select:focus,.form-grid textarea:focus{border-color:#60a5fa;box-shadow:0 0 0 3px rgba(37,99,235,.1)}.panel,.kpi{background:#fff;border:1px solid #dfe6ef;border-radius:18px;box-shadow:0 8px 24px rgba(15,23,42,.045)}.loading{padding:50px;text-align:center;color:#64748b}.kpi-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.kpi{padding:20px 22px;min-height:132px;display:flex;flex-direction:column;justify-content:center;border-top-width:3px}.kpi>span{font-size:13px;font-weight:800}.kpi strong{margin-top:8px;font-size:clamp(26px,2.3vw,36px);letter-spacing:-.04em}.kpi small{margin-top:8px;color:#64748b;font-size:11px}.kpi.green{border-top-color:#10b981;background:linear-gradient(180deg,#fff,#f7fffb)}.kpi.red{border-top-color:#fb7185;background:linear-gradient(180deg,#fff,#fff9fa)}.kpi.blue{border-top-color:#3b82f6;background:linear-gradient(180deg,#fff,#f8fbff)}.kpi.purple{border-top-color:#8b5cf6;background:linear-gradient(180deg,#fff,#fbf9ff)}.top-grid{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(360px,.95fr) minmax(250px,.5fr);gap:14px;margin-top:14px}.bottom-grid{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(320px,.9fr) minmax(300px,.9fr);gap:14px;margin-top:14px}.panel{padding:20px}.panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:16px}.panel-head h2{margin:0;font-size:18px;letter-spacing:-.02em}.panel-head a,.link-btn{border:0;background:transparent;color:#2563eb;font-size:12px;font-weight:800;cursor:pointer}.chart-wrap{height:260px;display:flex;align-items:flex-end;justify-content:space-around;gap:12px;padding:18px 10px 0;border-top:1px solid #eef2f7}.bar-column{height:100%;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:7px;min-width:0}.bar-value{font-size:10px;color:#64748b;white-space:nowrap}.bar-track{height:170px;width:min(48px,60%);display:flex;align-items:flex-end;border-radius:10px;background:#f1f5f9;overflow:hidden}.bar{width:100%;min-height:8px;border-radius:10px 10px 0 0;background:linear-gradient(180deg,#60a5fa,#2563eb)}.bar-column>span{font-size:10px;color:#64748b}.goal-money{display:flex;align-items:baseline;gap:7px}.goal-money strong{font-size:30px;letter-spacing:-.04em}.goal-money span{color:#64748b}.progress{height:12px;margin-top:14px;border-radius:999px;background:#e8f5ef;overflow:hidden}.progress i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#10b981,#22c55e)}.goal-percent{text-align:right;margin-top:5px;color:#059669;font-weight:850}.goal-mini-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}.goal-mini-grid div{padding:13px;border-radius:13px;background:#f8fafc}.goal-mini-grid span{display:block;color:#64748b;font-size:10px}.goal-mini-grid strong{display:block;margin-top:4px;font-size:16px}.goal-mini-grid .danger{background:#fff1f2}.goal-mini-grid .danger strong{color:#e11d48}.health-card{background:linear-gradient(145deg,#faf7ff,#fff);border-color:#e9d5ff}.health-card.good{background:linear-gradient(145deg,#f0fdf4,#fff);border-color:#bbf7d0}.health-icon{width:45px;height:45px;border-radius:14px;display:grid;place-items:center;background:#ede9fe;color:#7c3aed;font-size:22px;font-weight:900}.health-card.good .health-icon{background:#dcfce7;color:#16a34a}.health-card h2{margin:16px 0 8px;font-size:20px}.health-card p{margin:0;color:#475569;line-height:1.6;font-size:13px}.health-note{margin-top:18px;padding:12px;border-radius:12px;background:rgba(255,255,255,.75);font-size:12px}.expense-list,.movement-list{display:grid}.expense-row{min-height:68px;display:grid;grid-template-columns:minmax(0,1fr) 105px 115px 34px 34px;align-items:center;gap:10px;border-top:1px solid #edf2f7}.expense-row:first-child{border-top:0}.expense-row.muted{opacity:.48}.expense-main{display:flex;align-items:center;gap:11px;min-width:0}.expense-dot{width:10px;height:10px;border-radius:50%;background:#2563eb;flex:none}.expense-main strong{display:block;font-size:13px}.expense-main small{display:block;margin-top:3px;color:#64748b;font-size:10.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.expense-amount{text-align:right}.expense-amount strong{display:block}.expense-amount small{color:#94a3b8;font-size:9px}.pay-btn,.paid-pill{justify-self:end;padding:7px 9px;border-radius:999px;font-size:10px;font-weight:800}.pay-btn{border:1px solid #bfdbfe;background:#eff6ff;color:#1d4ed8;cursor:pointer}.paid-pill{color:#15803d;background:#dcfce7}.icon-btn{width:30px;height:30px;border:1px solid #e2e8f0;border-radius:9px;background:#fff;color:#64748b;cursor:pointer}.danger-text{color:#dc2626}.expense-total{margin-top:12px;padding-top:15px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center}.expense-total span{color:#64748b}.expense-total strong{font-size:20px}.equilibrium-card dl{margin:0;display:grid}.equilibrium-card dl>div{display:flex;justify-content:space-between;gap:12px;padding:13px 0;border-bottom:1px solid #edf2f7}.equilibrium-card dt{color:#475569;font-size:12px}.equilibrium-card dd{margin:0;font-weight:850}.equilibrium-card .highlight,.equilibrium-card .profit,.equilibrium-card .target{margin:8px -8px 0;padding:13px 8px;border:0;border-radius:12px}.equilibrium-card .highlight{background:#eff6ff}.equilibrium-card .profit{background:#f0fdf4}.equilibrium-card .profit dd{color:#15803d}.equilibrium-card .target{background:#f8fafc}.formula-note{margin:14px 0 0;padding:12px;border-radius:11px;background:#eff6ff;color:#1d4ed8;font-size:11px;line-height:1.5}.movement-row{min-height:56px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-top:1px solid #edf2f7}.movement-row:first-child{border-top:0}.movement-row strong{display:block;font-size:12px}.movement-row small{display:block;margin-top:3px;color:#94a3b8;font-size:10px}.movement-row>span{font-weight:850;font-size:12px}.income{color:#16a34a}.outcome{color:#dc2626}.empty{padding:28px 8px;text-align:center;color:#94a3b8;font-size:12px}.primary-small,.primary,.secondary{border-radius:11px;font-weight:800;cursor:pointer}.primary-small{border:0;background:#2563eb;color:#fff;padding:9px 12px;font-size:11px}.modal-backdrop{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:18px;background:rgba(15,23,42,.55);backdrop-filter:blur(3px)}.modal-card{width:min(680px,100%);max-height:90vh;overflow:auto;padding:24px;border-radius:20px;background:#fff;box-shadow:0 28px 70px rgba(15,23,42,.3)}.modal-card.small{width:min(500px,100%)}.modal-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:20px}.modal-head h2{margin:0;font-size:24px}.modal-head>button{border:0;background:transparent;font-size:28px;color:#64748b;cursor:pointer}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.form-grid.one{grid-template-columns:1fr}.form-grid .full{grid-column:1/-1}.form-grid textarea{resize:vertical}.modal-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:20px}.primary,.secondary{min-height:42px;padding:0 15px}.primary{border:0;background:#2563eb;color:#fff}.secondary{border:1px solid #dbe3ee;background:#fff;color:#334155}.help-text{color:#64748b;font-size:12px;line-height:1.55}.primary:disabled{opacity:.6;cursor:not-allowed}@media(max-width:1200px){.top-grid{grid-template-columns:1fr 1fr}.health-card{grid-column:1/-1}.bottom-grid{grid-template-columns:1fr 1fr}.movements-card{grid-column:1/-1}}@media(max-width:900px){.rent-header{align-items:stretch;flex-direction:column}.month-picker{min-width:0}.kpi-grid{grid-template-columns:1fr 1fr}.top-grid,.bottom-grid{grid-template-columns:1fr}.health-card,.movements-card{grid-column:auto}.chart-wrap{height:220px}.expense-row{grid-template-columns:minmax(0,1fr) 90px 34px 34px}.expense-row .pay-btn,.expense-row .paid-pill{grid-column:1/3;justify-self:start}.goal-mini-grid{grid-template-columns:1fr 1fr}}@media(max-width:600px){.rent-page{padding:0 2px 28px}.rent-header h1{font-size:30px}.rent-header p{font-size:13px}.kpi-grid{grid-template-columns:1fr}.kpi{min-height:108px;padding:16px 18px}.panel{padding:16px;border-radius:15px}.top-grid,.bottom-grid{gap:10px;margin-top:10px}.chart-wrap{height:190px;padding-left:0;padding-right:0}.bar-value{display:none}.bar-track{width:60%}.goal-mini-grid{grid-template-columns:1fr}.expense-row{padding:12px 0;grid-template-columns:1fr auto auto}.expense-main{grid-column:1/-1}.expense-amount{text-align:left}.expense-row .pay-btn,.expense-row .paid-pill{grid-column:auto;justify-self:start}.form-grid{grid-template-columns:1fr}.form-grid .full{grid-column:auto}.modal-card{padding:18px}.modal-actions{display:grid;grid-template-columns:1fr 1fr}.primary,.secondary{width:100%}}
</style>
