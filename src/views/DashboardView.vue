<script setup>
import { computed, onMounted, ref } from 'vue'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const loading = ref(true)
const ordenes = ref([])
const citas = ref([])
const movimientos = ref([])

const firstName = computed(() => (auth.perfil?.nombre || 'Yuliana').trim().split(/\s+/)[0])

function moneda(valor) {
  return Number(valor || 0).toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0
  })
}

function hoyLocal() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function inicioDia(fecha = hoyLocal()) {
  return new Date(`${fecha}T00:00:00`)
}

function finDia(fecha = hoyLocal()) {
  const d = inicioDia(fecha)
  d.setDate(d.getDate() + 1)
  return d
}

function mananaISO() {
  const d = new Date(`${hoyLocal()}T12:00:00`)
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

function mismoDia(valor, fecha = hoyLocal()) {
  if (!valor) return false
  const d = new Date(valor)
  return d >= inicioDia(fecha) && d < finDia(fecha)
}

function produccionDe(orden) {
  return Array.isArray(orden.orden_produccion)
    ? orden.orden_produccion[0]
    : orden.orden_produccion
}

function prioridadEfectiva(orden) {
  if (['Entregado', 'Cancelado'].includes(orden.estado)) return 'normal'
  const fecha = orden.fecha_programada
  if (fecha) {
    const d = new Date(fecha)
    if (d < finDia(hoyLocal())) return 'urgente'
    if (mismoDia(fecha, mananaISO())) return 'alta'
  }
  return produccionDe(orden)?.prioridad || 'normal'
}

function prioridadLabel(orden) {
  const p = prioridadEfectiva(orden)
  if (p === 'urgente') return 'Urgente'
  if (p === 'alta') return 'Prioridad alta'
  return orden.estado || 'Pendiente'
}

function equipoNombre(orden) {
  return [orden.equipos?.marca, orden.equipos?.modelo]
    .filter(Boolean)
    .join(' ') || orden.equipos?.tipo_equipo || 'Equipo'
}

function horaCorta(valor) {
  if (!valor) return 'Sin fecha'
  return new Date(valor).toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

function fechaEntrega(orden) {
  if (!orden.fecha_programada) return 'Sin fecha'
  if (mismoDia(orden.fecha_programada)) return `Hoy, ${horaCorta(orden.fecha_programada)}`
  if (mismoDia(orden.fecha_programada, mananaISO())) return `Mañana, ${horaCorta(orden.fecha_programada)}`
  return new Date(orden.fecha_programada).toLocaleDateString('es-MX', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
  })
}

function normalizarMetodo(valor) {
  const v = String(valor || '').toLowerCase()
  if (v.includes('efect')) return 'Efectivo'
  if (v.includes('transfer')) return 'Transferencia'
  if (v.includes('tarjeta') || v.includes('mercado') || v.includes('clip')) return 'Tarjeta'
  return 'Otro'
}

const activas = computed(() => ordenes.value.filter(o => !['Entregado', 'Cancelado'].includes(o.estado)))
const pendientes = computed(() => activas.value.filter(o => !['Diagnóstico', 'En reparación', 'Listo'].includes(o.estado)).length)
const enProceso = computed(() => activas.value.filter(o => ['Diagnóstico', 'En reparación'].includes(o.estado)).length)
const listas = computed(() => ordenes.value.filter(o => o.estado === 'Listo').length)
const urgentes = computed(() => activas.value.filter(o => prioridadEfectiva(o) === 'urgente').length)

const agendaHoy = computed(() => {
  const citasDirectas = citas.value
    .filter(c => mismoDia(c.inicio) && !['Cancelada', 'Cancelado'].includes(c.estado))
    .map(c => ({
      id: `c-${c.id}`,
      inicio: c.inicio,
      cliente: c.nombre_cliente || 'Cliente',
      equipo: c.equipo || 'Equipo',
      servicio: c.servicio || 'Cita',
      tipo: 'Cita'
    }))

  const ordenesConCita = new Set(
    citas.value.filter(c => c.orden_id).map(c => Number(c.orden_id))
  )

  const ordenesProgramadas = ordenes.value
    .filter(o => mismoDia(o.fecha_programada) && !ordenesConCita.has(Number(o.id)) && !['Entregado', 'Cancelado'].includes(o.estado))
    .map(o => ({
      id: `o-${o.id}`,
      inicio: o.fecha_programada,
      cliente: o.clientes?.nombre || 'Cliente',
      equipo: equipoNombre(o),
      servicio: o.trabajo_realizado || o.falla_reportada || 'Reparación',
      tipo: 'Orden'
    }))

  return [...citasDirectas, ...ordenesProgramadas]
    .sort((a, b) => new Date(a.inicio) - new Date(b.inicio))
    .slice(0, 5)
})

const ordenesPrioritarias = computed(() => {
  const peso = { urgente: 4, alta: 3, normal: 2, baja: 1 }
  return [...activas.value]
    .sort((a, b) => {
      const pa = peso[prioridadEfectiva(a)] || 0
      const pb = peso[prioridadEfectiva(b)] || 0
      if (pb !== pa) return pb - pa
      const fa = a.fecha_programada ? new Date(a.fecha_programada).getTime() : Number.MAX_SAFE_INTEGER
      const fb = b.fecha_programada ? new Date(b.fecha_programada).getTime() : Number.MAX_SAFE_INTEGER
      if (fa !== fb) return fa - fb
      return Number(b.id) - Number(a.id)
    })
    .slice(0, 4)
})

const listosEntrega = computed(() => ordenes.value.filter(o => o.estado === 'Listo').slice(0, 5))

const movimientosHoy = computed(() => movimientos.value.filter(m => mismoDia(m.fecha_movimiento || m.created_at)))
const ventasDia = computed(() => movimientosHoy.value.filter(m => m.tipo === 'Entrada').reduce((s, m) => s + Number(m.monto || 0), 0))
const efectivoDia = computed(() => movimientosHoy.value.filter(m => m.tipo === 'Entrada' && normalizarMetodo(m.metodo_pago) === 'Efectivo').reduce((s, m) => s + Number(m.monto || 0), 0))
const transferenciaDia = computed(() => movimientosHoy.value.filter(m => m.tipo === 'Entrada' && normalizarMetodo(m.metodo_pago) === 'Transferencia').reduce((s, m) => s + Number(m.monto || 0), 0))
const tarjetaDia = computed(() => movimientosHoy.value.filter(m => m.tipo === 'Entrada' && normalizarMetodo(m.metodo_pago) === 'Tarjeta').reduce((s, m) => s + Number(m.monto || 0), 0))
const cajaActual = computed(() => movimientos.value.reduce((s, m) => s + (m.tipo === 'Salida' ? -Number(m.monto || 0) : Number(m.monto || 0)), 0))

async function cargarDashboard() {
  loading.value = true
  const [ordenesRes, citasRes, cajaRes] = await Promise.all([
    supabase
      .from('ordenes')
      .select('id,folio,estado,falla_reportada,trabajo_realizado,fecha_programada,fecha_ingreso,created_at,updated_at,clientes(nombre,telefono),equipos(tipo_equipo,marca,modelo),orden_produccion(prioridad)')
      .order('id', { ascending: false })
      .limit(250),
    supabase
      .from('citas_agenda')
      .select('id,orden_id,nombre_cliente,equipo,servicio,inicio,estado')
      .order('inicio', { ascending: true }),
    supabase
      .from('movimientos_caja')
      .select('id,tipo,monto,metodo_pago,fecha_movimiento,created_at')
      .order('id', { ascending: false })
  ])

  if (ordenesRes.error) console.warn('Dashboard órdenes:', ordenesRes.error.message)
  if (citasRes.error) console.warn('Dashboard agenda:', citasRes.error.message)
  if (cajaRes.error) console.warn('Dashboard caja:', cajaRes.error.message)

  ordenes.value = ordenesRes.data || []
  citas.value = citasRes.data || []
  movimientos.value = cajaRes.data || []
  loading.value = false
}

onMounted(async () => {
  if (!auth.user) await auth.cargarSesion()
  await cargarDashboard()
})
</script>

<template>
  <section class="op-dashboard" :class="{ 'is-loading': loading }">
    <header class="dashboard-header">
      <div>
        <h2>Hola, {{ firstName }} <span aria-hidden="true">👋</span></h2>
        <p>Aquí está el estado actual de tu taller.</p>
      </div>
      <div class="dashboard-actions">
        <router-link to="/ventas?nueva=1" class="action-btn secondary">
          <svg viewBox="0 0 24 24"><path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13h8M9 17h5"/></svg>
          Nueva venta
        </router-link>
        <router-link to="/nueva-orden" class="action-btn primary">
          <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
          Nueva orden
        </router-link>
      </div>
    </header>

    <section class="kpi-grid">
      <article class="kpi-card neutral">
        <span class="kpi-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></span>
        <div><span>Pendientes</span><strong>{{ pendientes }}</strong></div>
      </article>
      <article class="kpi-card danger">
        <span class="kpi-icon"><svg viewBox="0 0 24 24"><path d="M12 3 2.7 19h18.6z"/><path d="M12 9v4m0 3h.01"/></svg></span>
        <div><span>Urgentes</span><strong>{{ urgentes }}</strong></div>
      </article>
      <article class="kpi-card info">
        <span class="kpi-icon"><svg viewBox="0 0 24 24"><path d="m14.7 6.3 3-3a4.2 4.2 0 0 1-5.4 5.4l-6.6 6.6a2.1 2.1 0 1 0 3 3l6.6-6.6a4.2 4.2 0 0 1 5.4-5.4l-3 3z"/></svg></span>
        <div><span>En proceso</span><strong>{{ enProceso }}</strong></div>
      </article>
      <article class="kpi-card success">
        <span class="kpi-icon"><svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg></span>
        <div><span>Listos</span><strong>{{ listas }}</strong></div>
      </article>
      <article class="kpi-card violet">
        <span class="kpi-icon"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg></span>
        <div><span>Citas hoy</span><strong>{{ agendaHoy.length }}</strong></div>
      </article>
    </section>

    <section class="main-grid">
      <article class="panel priority-panel">
        <header class="panel-title">
          <div class="title-with-icon danger-title">
            <svg viewBox="0 0 24 24"><path d="M12 3 2.7 19h18.6z"/><path d="M12 9v4m0 3h.01"/></svg>
            <h3>Órdenes prioritarias</h3>
            <span class="count-bubble danger-bubble">{{ urgentes }}</span>
          </div>
          <router-link to="/taller">Ver todas →</router-link>
        </header>

        <div v-if="!ordenesPrioritarias.length" class="empty-state">No hay órdenes activas pendientes.</div>
        <div v-else class="priority-list">
          <router-link v-for="orden in ordenesPrioritarias" :key="orden.id" :to="`/ordenes/${orden.id}`" class="priority-row" :class="`priority-${prioridadEfectiva(orden)}`">
            <div class="priority-device">
              <span>{{ orden.folio || `TS-${orden.id}` }}</span>
              <strong>{{ equipoNombre(orden) }}</strong>
            </div>
            <div class="priority-client">
              <strong>{{ orden.clientes?.nombre || 'Cliente' }}</strong>
              <small>{{ orden.falla_reportada || orden.trabajo_realizado || 'Sin detalle' }}</small>
            </div>
            <span class="priority-pill" :class="prioridadEfectiva(orden)">{{ prioridadLabel(orden) }}</span>
            <div class="priority-date">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
              <strong>{{ fechaEntrega(orden) }}</strong>
            </div>
            <svg class="chevron" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>
          </router-link>
        </div>
      </article>

      <article class="panel agenda-panel">
        <header class="panel-title">
          <div class="title-with-icon">
            <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>
            <h3>Agenda de hoy</h3>
          </div>
          <router-link to="/agenda">Ver agenda →</router-link>
        </header>

        <div v-if="!agendaHoy.length" class="agenda-empty">
          <svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/></svg>
          <strong>No hay citas programadas hoy.</strong>
          <span>Cuando tengas citas, las verás aquí.</span>
          <router-link to="/agenda">Ir a agenda</router-link>
        </div>
        <div v-else class="agenda-list">
          <div v-for="evento in agendaHoy" :key="evento.id" class="agenda-row">
            <strong class="agenda-time">{{ horaCorta(evento.inicio) }}</strong>
            <div><strong>{{ evento.equipo }}</strong><small>{{ evento.servicio }}</small></div>
            <span class="agenda-client">{{ evento.cliente }}</span>
          </div>
        </div>
      </article>
    </section>

    <section class="finance-grid">
      <article class="panel sales-panel">
        <header class="panel-title compact">
          <div class="title-with-icon"><svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg><h3>Ventas del día</h3></div>
          <router-link to="/ventas">Ver ventas →</router-link>
        </header>
        <strong class="big-money">{{ moneda(ventasDia) }}</strong>
        <div class="payment-strip">
          <div><span class="payment-dot cash"></span><span>Efectivo</span><strong>{{ moneda(efectivoDia) }}</strong></div>
          <div><span class="payment-dot transfer"></span><span>Transferencia</span><strong>{{ moneda(transferenciaDia) }}</strong></div>
          <div><span class="payment-dot card"></span><span>Tarjeta</span><strong>{{ moneda(tarjetaDia) }}</strong></div>
        </div>
      </article>

      <article class="panel cash-panel">
        <header class="panel-title compact">
          <div class="title-with-icon"><svg viewBox="0 0 24 24"><path d="M3 6h16a2 2 0 0 1 2 2v11H5a2 2 0 0 1-2-2zM3 6l14-3v3m1 6h3"/></svg><h3>Caja actual</h3></div>
          <router-link to="/caja">Ver caja →</router-link>
        </header>
        <strong class="big-money">{{ moneda(cajaActual) }}</strong>
        <span class="cash-subtitle">Balance según movimientos registrados</span>
      </article>

      <article class="panel quick-panel">
        <header class="panel-title compact">
          <div class="title-with-icon"><svg viewBox="0 0 24 24"><path d="M13 2 3 14h8l-1 8 10-12h-8z"/></svg><h3>Acciones rápidas</h3></div>
        </header>
        <div class="quick-grid">
          <router-link to="/nueva-orden"><svg viewBox="0 0 24 24"><path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13h8M9 17h5"/></svg><div><strong>Nueva orden</strong><span>Registrar equipo al taller</span></div></router-link>
          <router-link to="/ventas?nueva=1"><svg viewBox="0 0 24 24"><circle cx="9" cy="20" r="1"/><circle cx="19" cy="20" r="1"/><path d="M3 3h2l2.4 11.5a2 2 0 0 0 2 1.5h8.8a2 2 0 0 0 2-1.6L22 7H6"/></svg><div><strong>Nueva venta</strong><span>Registrar una venta</span></div></router-link>
          <router-link to="/clientes"><svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="4"/><path d="M2 21v-2a7 7 0 0 1 14 0v2M17 11h5M19.5 8.5v5"/></svg><div><strong>Buscar cliente</strong><span>Por nombre o teléfono</span></div></router-link>
          <router-link to="/cotizador"><svg viewBox="0 0 24 24"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01"/></svg><div><strong>Cotizador</strong><span>Consultar precios rápidos</span></div></router-link>
        </div>
      </article>
    </section>

    <article class="panel ready-panel">
      <header class="panel-title compact">
        <div class="title-with-icon success-title"><svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg><h3>Equipos listos por entregar</h3><span class="count-bubble success-bubble">{{ listas }}</span></div>
        <router-link to="/taller">Ver todos →</router-link>
      </header>
      <div v-if="!listosEntrega.length" class="ready-empty">
        <svg viewBox="0 0 24 24"><path d="m21 8-9 5-9-5 9-5zM3 8v8l9 5 9-5V8M12 13v8"/></svg>
        <strong>No hay equipos listos pendientes de entrega.</strong>
        <span>Cuando un equipo esté listo, aparecerá aquí.</span>
      </div>
      <div v-else class="ready-list">
        <router-link v-for="orden in listosEntrega" :key="orden.id" :to="`/ordenes/${orden.id}`" class="ready-row">
          <span>{{ orden.folio }}</span>
          <strong>{{ equipoNombre(orden) }}</strong>
          <span>{{ orden.clientes?.nombre || 'Cliente' }}</span>
          <span class="ready-status">Listo</span>
          <svg class="chevron" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>
        </router-link>
      </div>
    </article>
  </section>
</template>

<style scoped>
.op-dashboard { width: 100%; max-width: 1760px; margin: 0 auto; display: grid; gap: 20px; color: var(--ts-text); }
.op-dashboard.is-loading { opacity: .72; pointer-events: none; }
.dashboard-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; }
.dashboard-header h2 { margin: 0; font-size: clamp(32px, 2.6vw, 44px); line-height: 1; letter-spacing: -.045em; font-weight: 800; }
.dashboard-header p { margin: 9px 0 0; color: var(--ts-muted); font-size: 16px; }
.dashboard-actions { display: flex; gap: 12px; }
.action-btn { min-height: 52px; padding: 0 22px; display: inline-flex; align-items: center; justify-content: center; gap: 10px; border-radius: 13px; font-size: 15px; font-weight: 800; border: 1px solid #b9d0ff; }
.action-btn svg { width: 20px; height: 20px; }
.action-btn.primary { color: #fff; background: #0b5cff; border-color: #0b5cff; box-shadow: 0 9px 24px rgba(11,92,255,.20); }
.action-btn.secondary { color: #0757e6; background: var(--ts-surface); }

.kpi-grid { display: grid; grid-template-columns: repeat(5, minmax(0,1fr)); gap: 16px; }
.kpi-card { min-height: 116px; padding: 20px 22px; display: flex; align-items: center; gap: 18px; border: 1px solid var(--ts-border); border-radius: 16px; background: var(--ts-surface); box-shadow: 0 8px 22px rgba(15,23,42,.045); }
.kpi-icon { width: 56px; height: 56px; flex: 0 0 56px; display: grid; place-items: center; border-radius: 50%; }
.kpi-icon svg { width: 27px; height: 27px; stroke-width: 2.1; }
.kpi-card > div { display: grid; gap: 4px; }
.kpi-card span:not(.kpi-icon) { font-size: 15px; font-weight: 800; }
.kpi-card strong { font-size: 34px; line-height: 1; letter-spacing: -.04em; }
.kpi-card.neutral .kpi-icon { color: #476caa; background: #eaf1fb; }
.kpi-card.danger { border-color: #ffd1d1; background: linear-gradient(135deg,#fff,#fff5f5); }.kpi-card.danger .kpi-icon { color:#ef2b2d;background:#ffe1e1 }.kpi-card.danger span:not(.kpi-icon),.kpi-card.danger strong{color:#e11d24}
.kpi-card.info { border-color:#cee0ff;background:linear-gradient(135deg,#fff,#f4f8ff) }.kpi-card.info .kpi-icon{color:#1265e9;background:#deebff}.kpi-card.info span:not(.kpi-icon){color:#0757e6}
.kpi-card.success { border-color:#cfeedd;background:linear-gradient(135deg,#fff,#f2fcf7) }.kpi-card.success .kpi-icon{color:#0c9e5b;background:#d9f5e7}.kpi-card.success span:not(.kpi-icon){color:#087a46}
.kpi-card.violet { border-color:#ded5ff;background:linear-gradient(135deg,#fff,#f8f5ff) }.kpi-card.violet .kpi-icon{color:#6f32ea;background:#eadfff}.kpi-card.violet span:not(.kpi-icon){color:#6422da}

.main-grid { display: grid; grid-template-columns: minmax(0, 1.9fr) minmax(360px, .9fr); gap: 18px; align-items: stretch; }
.finance-grid { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(260px, .62fr) minmax(360px, .9fr); gap: 18px; }
.panel { min-width: 0; padding: 20px; border: 1px solid var(--ts-border); border-radius: 17px; background: var(--ts-surface); box-shadow: 0 8px 24px rgba(15,23,42,.045); }
.panel-title { min-height: 34px; margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.panel-title.compact { margin-bottom: 12px; }
.panel-title > a { color: #0757e6; font-size: 13px; font-weight: 800; white-space: nowrap; }
.title-with-icon { display: flex; align-items: center; gap: 10px; min-width: 0; }
.title-with-icon > svg { width: 24px; height: 24px; color: #0757e6; stroke-width: 2.1; }
.title-with-icon h3 { margin: 0; font-size: 20px; letter-spacing: -.025em; }
.danger-title > svg { color: #ef2929; }.success-title > svg { color: #0aa765; }
.count-bubble { min-width: 25px; height: 25px; padding: 0 7px; border-radius: 999px; display: grid; place-items: center; font-size: 12px; font-weight: 900; }
.danger-bubble{color:#e11d24;background:#ffe1e1}.success-bubble{color:#067647;background:#dff7e9}

.priority-list { display: grid; gap: 9px; }
.priority-row { min-height: 79px; padding: 14px 16px; display: grid; grid-template-columns: minmax(180px,1.15fr) minmax(190px,1fr) 135px 155px 20px; align-items: center; gap: 14px; color: var(--ts-text); border-radius: 13px; border-left: 4px solid #d5dbea; background: #fbfcfe; }
.priority-row:hover { color: var(--ts-text); transform: translateX(2px); }
.priority-row.priority-urgente { border-left-color:#ff2d2d;background:linear-gradient(90deg,#fff4f4,#fffafa); }
.priority-row.priority-alta { border-left-color:#f59e0b;background:linear-gradient(90deg,#fff9e8,#fffdf7); }
.priority-device,.priority-client { min-width:0; display:grid;gap:4px }.priority-device span{color:#0757e6;font-size:13px;font-weight:900}.priority-device strong,.priority-client strong{font-size:15px}.priority-client small{color:var(--ts-muted);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.priority-pill { justify-self:start; padding:8px 13px; border-radius:999px; font-size:12px; font-weight:900; white-space:nowrap; }.priority-pill.urgente{color:#df2027;background:#ffdede}.priority-pill.alta{color:#b96b00;background:#ffedc7}.priority-pill.normal,.priority-pill.baja{color:#1557b0;background:#e2edff}
.priority-date { display:flex;align-items:center;gap:8px;font-size:12px }.priority-date svg{width:19px;height:19px;color:#ef2929}.priority-date strong{line-height:1.3}.chevron{width:19px;height:19px;color:#64748b}

.agenda-panel { min-height: 100%; }
.agenda-list { display:grid; }
.agenda-row { min-height: 62px; display:grid; grid-template-columns: 92px 1fr 110px; align-items:center; gap:12px; border-top:1px solid var(--ts-border); }
.agenda-row:first-child{border-top:0}.agenda-time{font-size:14px}.agenda-row>div{display:grid;gap:2px}.agenda-row>div strong{font-size:14px}.agenda-row small,.agenda-client{color:var(--ts-muted);font-size:12px}.agenda-client{text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.agenda-empty,.ready-empty { min-height: 210px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:9px; text-align:center; color:var(--ts-muted); }
.agenda-empty svg,.ready-empty svg{width:48px;height:48px;color:#9eb0ca}.agenda-empty strong,.ready-empty strong{color:#345079;font-size:15px}.agenda-empty span,.ready-empty span{font-size:12px}.agenda-empty a{margin-top:9px;padding:10px 16px;border:1px solid #cbd9ee;border-radius:11px;color:#0757e6;font-size:13px;font-weight:800}

.big-money { display:block; margin-top:8px; font-size:38px; line-height:1; letter-spacing:-.045em; }
.payment-strip { margin-top:18px; display:grid; grid-template-columns:repeat(3,1fr); background:var(--ts-surface-2); border-radius:13px; padding:13px; }
.payment-strip>div{padding:0 13px;display:grid;grid-template-columns:auto 1fr;gap:2px 8px;border-left:1px solid var(--ts-border)}.payment-strip>div:first-child{border-left:0}.payment-strip span:not(.payment-dot){font-size:11px;color:var(--ts-muted)}.payment-strip strong{grid-column:2;font-size:15px}.payment-dot{width:9px;height:9px;border-radius:50%;margin-top:4px}.payment-dot.cash{background:#12b76a}.payment-dot.transfer{background:#2e78ff}.payment-dot.card{background:#7c3aed}
.cash-subtitle { display:block; margin-top:12px; color:var(--ts-muted); font-size:12px; }
.quick-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.quick-grid a{min-height:69px;padding:11px 12px;display:flex;align-items:center;gap:10px;border:1px solid var(--ts-border);border-radius:12px;color:var(--ts-text);background:var(--ts-surface)}.quick-grid a:hover{color:#0757e6;border-color:#a9c8ff;background:#f6f9ff}.quick-grid svg{width:24px;height:24px;flex:0 0 24px;color:#0757e6}.quick-grid div{display:grid;gap:2px}.quick-grid strong{font-size:13px}.quick-grid span{font-size:10.5px;color:var(--ts-muted)}

.ready-panel { padding-bottom: 16px; }
.ready-empty { min-height: 115px; background:linear-gradient(135deg,#f9fbff,#f5f8fd);border-radius:12px; }
.ready-list { display:grid; }
.ready-row { min-height:54px;display:grid;grid-template-columns:160px 1.2fr 1fr 95px 20px;align-items:center;gap:12px;color:var(--ts-text);border-top:1px solid var(--ts-border);font-size:13px}.ready-row:first-child{border-top:0}.ready-row>span:first-child{color:#0757e6;font-weight:900}.ready-status{justify-self:start;padding:6px 11px;border-radius:999px;color:#087a46;background:#dff7e9;font-weight:900}
.empty-state { min-height:180px;display:grid;place-items:center;color:var(--ts-muted);font-size:14px; }

@media (max-width: 1380px) {
  .priority-row { grid-template-columns: 1.15fr 1fr 120px 145px 18px; }
  .finance-grid { grid-template-columns: 1.2fr .7fr; }.quick-panel{grid-column:1/-1}.quick-grid{grid-template-columns:repeat(4,1fr)}
}
@media (max-width: 1120px) {
  .kpi-grid { grid-template-columns: repeat(3,1fr); }
  .main-grid { grid-template-columns:1fr; }.agenda-panel{min-height:auto}.finance-grid{grid-template-columns:1fr 1fr}.quick-panel{grid-column:1/-1}
  .priority-row{grid-template-columns:1.15fr 1fr 120px 145px 18px}
}
@media (max-width: 820px) {
  .dashboard-header{align-items:flex-start;flex-direction:column}.dashboard-actions{width:100%}.dashboard-actions a{flex:1}.kpi-grid{grid-template-columns:1fr 1fr}.finance-grid{grid-template-columns:1fr}.quick-panel{grid-column:auto}.quick-grid{grid-template-columns:1fr 1fr}.priority-row{grid-template-columns:1fr auto}.priority-client{grid-column:1}.priority-pill{grid-column:2;grid-row:1/3}.priority-date{grid-column:1}.priority-row>.chevron{grid-column:2;grid-row:3}.ready-row{grid-template-columns:1fr 1fr}.ready-row .chevron{display:none}
}
@media (max-width: 560px) {
  .dashboard-header h2{font-size:30px}.dashboard-header p{font-size:14px}.dashboard-actions{display:grid;grid-template-columns:1fr}.kpi-grid{grid-template-columns:1fr}.kpi-card{min-height:96px}.main-grid,.finance-grid{gap:12px}.panel{padding:16px}.title-with-icon h3{font-size:18px}.agenda-row{grid-template-columns:76px 1fr}.agenda-client{display:none}.quick-grid{grid-template-columns:1fr}.payment-strip{grid-template-columns:1fr;gap:10px}.payment-strip>div{border-left:0;border-top:1px solid var(--ts-border);padding:9px 0}.payment-strip>div:first-child{border-top:0}.ready-row{grid-template-columns:1fr}.ready-status{justify-self:start}
}
</style>
