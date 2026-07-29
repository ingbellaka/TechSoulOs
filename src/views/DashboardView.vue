<script setup>
import { computed, ref, onMounted } from 'vue'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const loading = ref(true)
const resumen = ref({ clientes: 0, ordenes: 0, activas: 0, listas: 0, ingresos: 0, salidas: 0, caja: 0 })
const recientes = ref([])

const firstName = computed(() => (auth.perfil?.nombre || 'Yuliana').split(' ')[0])
const hour = new Date().getHours()
const greeting = computed(() => hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches')

function moneda(valor) {
  return Number(valor || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })
}

function statusClass(status) {
  const value = (status || '').toLowerCase()
  if (value.includes('listo') || value.includes('entregado')) return 'success'
  if (value.includes('cancel')) return 'danger'
  if (value.includes('espera') || value.includes('pendiente')) return 'warning'
  return 'info'
}

async function cargarDashboard() {
  loading.value = true
  const [{ count: clientes }, { data: ordenes }, { data: caja }] = await Promise.all([
    supabase.from('clientes').select('*', { count: 'exact', head: true }),
    supabase.from('ordenes').select('*, clientes(nombre), equipos(tipo_equipo, marca, modelo)').order('id', { ascending: false }),
    supabase.from('movimientos_caja').select('*')
  ])

  const ingresos = (caja || []).filter(m => m.tipo === 'Entrada').reduce((sum, m) => sum + Number(m.monto || 0), 0)
  const salidas = (caja || []).filter(m => m.tipo === 'Salida').reduce((sum, m) => sum + Number(m.monto || 0), 0)

  resumen.value = {
    clientes: clientes || 0,
    ordenes: (ordenes || []).length,
    activas: (ordenes || []).filter(o => !['Entregado', 'Cancelado'].includes(o.estado)).length,
    listas: (ordenes || []).filter(o => o.estado === 'Listo').length,
    ingresos,
    salidas,
    caja: ingresos - salidas
  }

  recientes.value = (ordenes || []).slice(0, 6)
  loading.value = false
}

onMounted(async () => {
  if (!auth.user) await auth.cargarSesion()
  await cargarDashboard()
})
</script>

<template>
  <section class="dashboard-page">
    <div class="dashboard-hero">
      <div>
        <p class="dashboard-kicker">Centro de operaciones</p>
        <h2>{{ greeting }}, {{ firstName }} <span aria-hidden="true">👋</span></h2>
        <p>Esto es lo más importante de TechSoul en este momento.</p>
      </div>
      <div class="hero-actions">
        <router-link to="/ordenes" class="secondary-action">Ver órdenes</router-link>
        <router-link to="/nueva-orden" class="primary-action">Crear nueva orden</router-link>
      </div>
    </div>

    <div class="metrics-grid" :class="{ 'is-loading': loading }">
      <article class="metric-card">
        <div class="metric-icon blue"><svg viewBox="0 0 24 24"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M9 9h6M9 13h6M9 17h4"/></svg></div>
        <div><span>Órdenes activas</span><strong>{{ resumen.activas }}</strong><small>{{ resumen.ordenes }} órdenes totales</small></div>
      </article>
      <article class="metric-card">
        <div class="metric-icon green"><svg viewBox="0 0 24 24"><path d="M20 7 9 18l-5-5"/></svg></div>
        <div><span>Listas para entregar</span><strong>{{ resumen.listas }}</strong><small>Requieren seguimiento</small></div>
      </article>
      <article class="metric-card">
        <div class="metric-icon violet"><svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8m13 10v-2a4 4 0 0 0-3-3.87"/></svg></div>
        <div><span>Clientes registrados</span><strong>{{ resumen.clientes }}</strong><small>Base total de clientes</small></div>
      </article>
      <article class="metric-card">
        <div class="metric-icon amber"><svg viewBox="0 0 24 24"><path d="M3 6h16a2 2 0 0 1 2 2v11H5a2 2 0 0 1-2-2zM3 6l14-3v3m1 6h3"/></svg></div>
        <div><span>Caja estimada</span><strong class="money-value">{{ moneda(resumen.caja) }}</strong><small>Entradas menos salidas</small></div>
      </article>
    </div>

    <div class="dashboard-layout">
      <div class="dashboard-main-column">
        <article class="panel-card finance-card">
          <div class="panel-heading">
            <div><span class="panel-eyebrow">Flujo financiero</span><h3>Resumen de caja</h3></div>
            <router-link to="/caja">Abrir caja</router-link>
          </div>
          <div class="finance-grid">
            <div class="finance-stat income"><span>Ingresos registrados</span><strong>{{ moneda(resumen.ingresos) }}</strong><small>Movimientos de entrada</small></div>
            <div class="finance-stat expense"><span>Salidas registradas</span><strong>{{ moneda(resumen.salidas) }}</strong><small>Compras y gastos</small></div>
            <div class="finance-stat balance"><span>Balance estimado</span><strong>{{ moneda(resumen.caja) }}</strong><small>Disponible según registros</small></div>
          </div>
        </article>

        <article class="panel-card recent-orders-card">
          <div class="panel-heading">
            <div><span class="panel-eyebrow">Actividad reciente</span><h3>Últimas órdenes</h3></div>
            <router-link to="/ordenes">Ver todas</router-link>
          </div>

          <div v-if="loading" class="empty-dashboard">Cargando información…</div>
          <div v-else-if="recientes.length === 0" class="empty-dashboard">Aún no hay órdenes registradas.</div>
          <div v-else class="orders-list">
            <router-link v-for="orden in recientes" :key="orden.id" :to="`/ordenes/${orden.id}`" class="order-row">
              <div class="order-avatar">{{ (orden.equipos?.marca || 'TS').slice(0, 2).toUpperCase() }}</div>
              <div class="order-copy">
                <div class="order-main-line"><strong>{{ orden.folio || `Orden #${orden.id}` }}</strong><span class="status-pill" :class="statusClass(orden.estado)">{{ orden.estado || 'Sin estado' }}</span></div>
                <span>{{ orden.clientes?.nombre || 'Cliente sin nombre' }}</span>
                <small>{{ [orden.equipos?.tipo_equipo, orden.equipos?.marca, orden.equipos?.modelo].filter(Boolean).join(' ') || 'Equipo sin especificar' }}</small>
              </div>
              <svg class="row-arrow" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>
            </router-link>
          </div>
        </article>
      </div>

      <aside class="dashboard-side-column">
        <article class="ai-card">
          <div class="ai-orb"><svg viewBox="0 0 24 24"><path d="M12 2a7 7 0 0 0-4 12.74V18h8v-3.26A7 7 0 0 0 12 2zM9 22h6M9 18h6"/></svg></div>
          <span class="ai-badge">Próximamente</span>
          <h3>TechSoul AI</h3>
          <p>Tu asistente para cotizaciones, seguimiento a clientes y búsqueda de refacciones.</p>
          <ul>
            <li>Atención automática 24/7</li>
            <li>Cotizaciones inteligentes</li>
            <li>Consulta de proveedores</li>
          </ul>
          <button type="button" disabled>En preparación</button>
        </article>

        <article class="panel-card quick-actions-card">
          <div class="panel-heading compact"><div><span class="panel-eyebrow">Accesos directos</span><h3>Trabaja más rápido</h3></div></div>
          <div class="quick-links">
            <router-link to="/nueva-orden"><span class="quick-icon blue">+</span><div><strong>Nueva orden</strong><small>Recibir un equipo</small></div></router-link>
            <router-link to="/clientes"><span class="quick-icon violet">C</span><div><strong>Nuevo cliente</strong><small>Administrar clientes</small></div></router-link>
            <router-link to="/ventas"><span class="quick-icon green">$</span><div><strong>Registrar venta</strong><small>Accesorios y servicios</small></div></router-link>
            <router-link to="/compras"><span class="quick-icon amber">P</span><div><strong>Nueva compra</strong><small>Proveedor o refacción</small></div></router-link>
          </div>
        </article>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.dashboard-page { max-width: 1500px; margin: 0 auto; }
.dashboard-hero { margin-bottom: 24px; display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; }
.dashboard-kicker, .panel-eyebrow { margin: 0 0 6px; color: var(--ts-primary); font-size: 10px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
.dashboard-hero h2 { margin: 0; color: var(--ts-text); font-size: clamp(26px, 3vw, 36px); line-height: 1.1; letter-spacing: -.04em; }
.dashboard-hero > div > p:last-child { margin: 9px 0 0; color: var(--ts-muted); font-size: 14px; }
.hero-actions { display: flex; gap: 10px; }
.primary-action, .secondary-action { min-height: 42px; padding: 0 15px; display: inline-flex; align-items: center; border-radius: 11px; font-size: 13px; font-weight: 700; }
.primary-action { background: var(--ts-primary); color: #fff; box-shadow: 0 8px 18px rgba(37,99,235,.18); }
.primary-action:hover { color: #fff; background: var(--ts-primary-hover); }
.secondary-action { color: var(--ts-text); background: var(--ts-surface); border: 1px solid var(--ts-border); }
.metrics-grid { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 14px; }
.metric-card, .panel-card { background: var(--ts-surface); border: 1px solid var(--ts-border); box-shadow: var(--ts-shadow-sm); }
.metric-card { min-height: 128px; padding: 20px; display: flex; align-items: flex-start; gap: 15px; border-radius: var(--ts-radius-lg); transition: transform .18s, box-shadow .18s; }
.metric-card:hover { transform: translateY(-2px); box-shadow: var(--ts-shadow-md); }
.metric-icon { width: 42px; height: 42px; flex: 0 0 42px; border-radius: 13px; display: grid; place-items: center; }
.metric-icon svg { width: 20px; height: 20px; }
.metric-icon.blue, .quick-icon.blue { color: #2563eb; background: #eff6ff; }
.metric-icon.green, .quick-icon.green { color: #16a34a; background: #f0fdf4; }
.metric-icon.violet, .quick-icon.violet { color: #7c3aed; background: #f5f3ff; }
.metric-icon.amber, .quick-icon.amber { color: #d97706; background: #fffbeb; }
.metric-card > div:last-child { min-width: 0; display: flex; flex-direction: column; }
.metric-card span { color: var(--ts-muted); font-size: 12px; font-weight: 650; }
.metric-card strong { margin-top: 5px; color: var(--ts-text); font-size: 28px; line-height: 1; letter-spacing: -.04em; }
.metric-card strong.money-value { font-size: clamp(20px, 2.1vw, 27px); }
.metric-card small { margin-top: 10px; color: var(--ts-muted); font-size: 10px; }
.dashboard-layout { margin-top: 16px; display: grid; grid-template-columns: minmax(0, 1.8fr) minmax(290px, .72fr); gap: 16px; align-items: start; }
.dashboard-main-column, .dashboard-side-column { display: grid; gap: 16px; }
.panel-card { border-radius: var(--ts-radius-lg); padding: 22px; }
.panel-heading { margin-bottom: 18px; display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.panel-heading.compact { margin-bottom: 12px; }
.panel-heading h3 { margin: 0; color: var(--ts-text); font-size: 17px; letter-spacing: -.02em; }
.panel-heading > a { color: var(--ts-primary); font-size: 12px; font-weight: 700; }
.finance-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; }
.finance-stat { padding: 17px; border-radius: 14px; background: var(--ts-surface-2); border: 1px solid var(--ts-border); display: flex; flex-direction: column; }
.finance-stat span { color: var(--ts-muted); font-size: 11px; font-weight: 650; }
.finance-stat strong { margin-top: 8px; font-size: 22px; letter-spacing: -.035em; }
.finance-stat small { margin-top: 6px; color: var(--ts-muted); font-size: 9.5px; }
.finance-stat.income strong { color: var(--ts-success); }
.finance-stat.expense strong { color: var(--ts-danger); }
.orders-list { display: grid; }
.order-row { min-height: 74px; padding: 11px 4px; display: flex; align-items: center; gap: 12px; color: var(--ts-text); border-top: 1px solid var(--ts-border); }
.order-row:first-child { border-top: 0; }
.order-row:hover { color: var(--ts-text); }
.order-avatar { width: 42px; height: 42px; flex: 0 0 42px; border-radius: 13px; display: grid; place-items: center; color: #1d4ed8; background: var(--ts-primary-soft); font-size: 11px; font-weight: 800; }
.order-copy { min-width: 0; flex: 1; display: flex; flex-direction: column; }
.order-main-line { display: flex; align-items: center; gap: 8px; }
.order-copy strong { font-size: 12.5px; }
.order-copy > span { margin-top: 3px; color: var(--ts-text); font-size: 11.5px; }
.order-copy small { margin-top: 2px; color: var(--ts-muted); font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.status-pill { padding: 3px 7px; border-radius: 999px; font-size: 8.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; }
.status-pill.info { color: #1d4ed8; background: #dbeafe; }.status-pill.success { color: #15803d; background: #dcfce7; }.status-pill.warning { color: #b45309; background: #fef3c7; }.status-pill.danger { color: #b91c1c; background: #fee2e2; }
.row-arrow { width: 17px; height: 17px; color: var(--ts-muted); }
.empty-dashboard { padding: 36px 10px; color: var(--ts-muted); text-align: center; font-size: 13px; }
.ai-card { position: relative; overflow: hidden; padding: 24px; border-radius: var(--ts-radius-lg); color: #fff; background: radial-gradient(circle at top right, rgba(96,165,250,.45), transparent 35%), linear-gradient(145deg, #111827, #172554 58%, #312e81); box-shadow: 0 18px 44px rgba(15,23,42,.2); }
.ai-card::after { content: ''; position: absolute; width: 170px; height: 170px; right: -80px; bottom: -90px; border-radius: 50%; border: 1px solid rgba(255,255,255,.12); }
.ai-orb { width: 46px; height: 46px; display: grid; place-items: center; border-radius: 15px; color: #bfdbfe; background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.12); }
.ai-badge { position: absolute; top: 24px; right: 24px; padding: 5px 9px; border-radius: 999px; background: rgba(255,255,255,.12); color: #dbeafe; font-size: 8px; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; }
.ai-card h3 { margin: 18px 0 7px; font-size: 21px; letter-spacing: -.03em; }
.ai-card p { margin: 0; color: #cbd5e1; font-size: 12px; line-height: 1.6; }
.ai-card ul { margin: 18px 0; padding: 0; list-style: none; display: grid; gap: 9px; }
.ai-card li { color: #e2e8f0; font-size: 11px; }
.ai-card li::before { content: '✓'; margin-right: 8px; color: #93c5fd; font-weight: 800; }
.ai-card button { width: 100%; height: 39px; border: 1px solid rgba(255,255,255,.15); border-radius: 11px; color: #cbd5e1; background: rgba(255,255,255,.08); font-size: 11px; font-weight: 700; }
.quick-links { display: grid; }
.quick-links a { min-height: 61px; padding: 10px 0; display: flex; align-items: center; gap: 11px; color: var(--ts-text); border-top: 1px solid var(--ts-border); }
.quick-links a:first-child { border-top: 0; }
.quick-links a:hover { color: var(--ts-primary); }
.quick-icon { width: 36px; height: 36px; flex: 0 0 36px; display: grid; place-items: center; border-radius: 11px; font-size: 12px; font-weight: 900; }
.quick-links div { display: flex; flex-direction: column; }
.quick-links strong { font-size: 11.5px; }.quick-links small { margin-top: 3px; color: var(--ts-muted); font-size: 9.5px; }
:global([data-theme='dark']) .metric-icon.blue, :global([data-theme='dark']) .quick-icon.blue { background: rgba(37,99,235,.16); }
:global([data-theme='dark']) .metric-icon.green, :global([data-theme='dark']) .quick-icon.green { background: rgba(22,163,74,.15); }
:global([data-theme='dark']) .metric-icon.violet, :global([data-theme='dark']) .quick-icon.violet { background: rgba(124,58,237,.16); }
:global([data-theme='dark']) .metric-icon.amber, :global([data-theme='dark']) .quick-icon.amber { background: rgba(217,119,6,.14); }
@media (max-width: 1200px) { .metrics-grid { grid-template-columns: repeat(2,1fr); }.dashboard-layout { grid-template-columns: 1fr; }.dashboard-side-column { grid-template-columns: repeat(2,minmax(0,1fr)); } }
@media (max-width: 720px) { .dashboard-hero { align-items: flex-start; flex-direction: column; }.hero-actions { width: 100%; }.hero-actions a { flex: 1; justify-content: center; }.metrics-grid, .finance-grid, .dashboard-side-column { grid-template-columns: 1fr; }.metric-card { min-height: 112px; }.panel-card { padding: 18px; } }
</style>
