<script setup>
import { computed, onMounted, ref } from 'vue'
import { cargarAnalitica, descargarCsv } from '../services/reportes.service'

const loading = ref(true)
const error = ref('')
const data = ref({ kpis: {}, estados: {}, serviciosTop: [], ultimos7: [], productos: [], ordenes: [] })
const periodo = ref('mes')
const mxn = value => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(value || 0))

const maxGrafica = computed(() => Math.max(1, ...data.value.ultimos7.flatMap(x => [x.ingresos, x.salidas])))
const stockBajo = computed(() => data.value.productos.filter(x => Number(x.stock || 0) <= Number(x.stock_minimo || 0)).slice(0, 10))
const estadoRows = computed(() => Object.entries(data.value.estados).sort((a, b) => b[1] - a[1]))

async function cargar() {
  loading.value = true
  error.value = ''
  try { data.value = await cargarAnalitica() }
  catch (e) { error.value = e.message || 'No se pudieron cargar los reportes.' }
  finally { loading.value = false }
}

function exportarResumen() {
  const k = data.value.kpis
  descargarCsv(`techsoul-resumen-${new Date().toISOString().slice(0, 10)}.csv`, [
    ['Métrica', 'Valor'],
    ['Ventas hoy', k.ventasHoy], ['Ventas semana', k.ventasSemana], ['Ventas mes', k.ventasMes],
    ['Gastos mes', k.gastosMes], ['Flujo mes', k.flujoMes], ['Utilidad estimada', k.utilidadEstimada],
    ['Saldo pendiente', k.saldoPendiente], ['Órdenes abiertas', k.ordenesAbiertas],
    ['Órdenes listas', k.ordenesListas], ['Garantías activas', k.garantiasActivas],
    ['Inventario crítico', k.inventarioCritico], ['Ticket promedio', k.ticketPromedio]
  ])
}

function exportarOrdenes() {
  descargarCsv(`techsoul-ordenes-${new Date().toISOString().slice(0, 10)}.csv`, [
    ['Folio', 'Estado', 'Total', 'Anticipo', 'Saldo', 'Fecha'],
    ...data.value.ordenes.map(x => [x.folio || x.id, x.estado, x.costo_total, x.anticipo, Math.max(0, Number(x.costo_total || 0) - Number(x.anticipo || 0)), x.fecha_ingreso || x.created_at])
  ])
}

onMounted(cargar)
</script>

<template>
  <section class="reports-page">
    <header class="page-header">
      <div>
        <span>ANALÍTICA DEL NEGOCIO</span>
        <h2>Reportes y rentabilidad</h2>
        <p>Consulta ingresos, gastos, flujo, órdenes, servicios e inventario en un solo lugar.</p>
      </div>
      <div class="actions">
        <button class="secondary" @click="exportarOrdenes">Exportar órdenes</button>
        <button class="primary" @click="exportarResumen">Exportar resumen CSV</button>
      </div>
    </header>

    <div v-if="error" class="alert">{{ error }} <button @click="cargar">Reintentar</button></div>
    <div v-if="loading" class="loading">Cargando información…</div>

    <template v-else>
      <div class="kpi-grid">
        <article><span>Ventas hoy</span><strong>{{ mxn(data.kpis.ventasHoy) }}</strong><small>Entradas registradas hoy</small></article>
        <article><span>Ventas esta semana</span><strong>{{ mxn(data.kpis.ventasSemana) }}</strong><small>Desde el lunes</small></article>
        <article><span>Ventas del mes</span><strong>{{ mxn(data.kpis.ventasMes) }}</strong><small>Entradas acumuladas</small></article>
        <article><span>Gastos del mes</span><strong>{{ mxn(data.kpis.gastosMes) }}</strong><small>Salidas acumuladas</small></article>
        <article><span>Flujo neto</span><strong :class="{ negative: data.kpis.flujoMes < 0 }">{{ mxn(data.kpis.flujoMes) }}</strong><small>Ingresos menos salidas</small></article>
        <article><span>Saldo pendiente</span><strong>{{ mxn(data.kpis.saldoPendiente) }}</strong><small>Por cobrar en órdenes</small></article>
        <article><span>Ticket promedio</span><strong>{{ mxn(data.kpis.ticketPromedio) }}</strong><small>Promedio por orden</small></article>
        <article><span>Inventario crítico</span><strong>{{ data.kpis.inventarioCritico }}</strong><small>Productos en mínimo</small></article>
      </div>

      <div class="content-grid">
        <article class="panel chart-panel">
          <div class="panel-title"><div><span>ÚLTIMOS 7 DÍAS</span><h3>Ingresos contra salidas</h3></div></div>
          <div class="chart">
            <div v-for="day in data.ultimos7" :key="day.fecha" class="chart-day">
              <div class="bars">
                <span class="income" :style="{ height: `${Math.max(3, day.ingresos / maxGrafica * 100)}%` }" :title="`Ingresos ${mxn(day.ingresos)}`"></span>
                <span class="expense" :style="{ height: `${Math.max(3, day.salidas / maxGrafica * 100)}%` }" :title="`Salidas ${mxn(day.salidas)}`"></span>
              </div>
              <small>{{ day.label }}</small>
            </div>
          </div>
          <div class="legend"><span><i class="income-dot"></i>Ingresos</span><span><i class="expense-dot"></i>Salidas</span></div>
        </article>

        <article class="panel">
          <div class="panel-title"><div><span>OPERACIÓN</span><h3>Órdenes por estado</h3></div></div>
          <div class="list">
            <div v-for="([estado, cantidad]) in estadoRows" :key="estado"><span>{{ estado }}</span><strong>{{ cantidad }}</strong></div>
            <p v-if="!estadoRows.length">No hay órdenes registradas.</p>
          </div>
        </article>

        <article class="panel">
          <div class="panel-title"><div><span>DEMANDA</span><h3>Servicios más vendidos</h3></div></div>
          <div class="list">
            <div v-for="item in data.serviciosTop.slice(0, 8)" :key="item.nombre"><span>{{ item.nombre }}</span><strong>{{ item.cantidad }} · {{ mxn(item.importe) }}</strong></div>
            <p v-if="!data.serviciosTop.length">Aún no hay servicios registrados.</p>
          </div>
        </article>

        <article class="panel">
          <div class="panel-title"><div><span>INVENTARIO</span><h3>Productos por reponer</h3></div><router-link to="/inventario">Ver inventario</router-link></div>
          <div class="list">
            <div v-for="item in stockBajo" :key="item.id"><span>{{ item.nombre }}</span><strong>{{ item.stock || 0 }} / mín. {{ item.stock_minimo || 0 }}</strong></div>
            <p v-if="!stockBajo.length">No hay alertas de stock.</p>
          </div>
        </article>
      </div>
    </template>
  </section>
</template>

<style scoped>
.reports-page{max-width:1500px;margin:0 auto}.page-header{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;margin-bottom:22px}.page-header span,.panel-title span{font-size:10px;font-weight:800;letter-spacing:.12em;color:var(--ts-primary);text-transform:uppercase}.page-header h2{margin:5px 0 7px;font-size:32px;letter-spacing:-.04em}.page-header p{margin:0;color:var(--ts-muted)}.actions{display:flex;gap:10px}.actions button,.alert button{border:0;border-radius:11px;padding:12px 15px;font-weight:700}.primary{background:var(--ts-primary);color:#fff}.secondary{background:var(--ts-surface);border:1px solid var(--ts-border)!important;color:var(--ts-text)}.kpi-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:13px}.kpi-grid article,.panel{background:var(--ts-surface);border:1px solid var(--ts-border);box-shadow:var(--ts-shadow-sm);border-radius:16px}.kpi-grid article{padding:18px;display:flex;flex-direction:column}.kpi-grid span{font-size:12px;color:var(--ts-muted)}.kpi-grid strong{margin:7px 0 8px;font-size:24px;letter-spacing:-.035em}.kpi-grid small{color:var(--ts-muted);font-size:10px}.negative{color:var(--ts-danger)}.content-grid{display:grid;grid-template-columns:1.35fr .85fr;gap:15px;margin-top:15px}.panel{padding:21px}.panel-title{display:flex;justify-content:space-between;align-items:start;margin-bottom:18px}.panel-title h3{margin:4px 0 0;font-size:17px}.panel-title a{font-size:12px;font-weight:700;color:var(--ts-primary)}.chart{height:245px;display:flex;align-items:end;gap:18px;border-bottom:1px solid var(--ts-border);padding:18px 10px 0}.chart-day{height:100%;flex:1;display:flex;flex-direction:column;justify-content:end;text-align:center}.bars{height:calc(100% - 27px);display:flex;align-items:end;justify-content:center;gap:5px}.bars span{display:block;width:15px;min-height:3px;border-radius:5px 5px 0 0}.bars .income{background:var(--ts-primary)}.bars .expense{background:#f59e0b}.chart-day small{padding:8px 0;color:var(--ts-muted);text-transform:capitalize}.legend{display:flex;gap:18px;margin-top:13px;color:var(--ts-muted);font-size:11px}.legend i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px}.income-dot{background:var(--ts-primary)}.expense-dot{background:#f59e0b}.list{display:grid}.list div{display:flex;justify-content:space-between;gap:15px;padding:12px 0;border-top:1px solid var(--ts-border)}.list div:first-child{border-top:0}.list span{font-size:12px}.list strong{font-size:11px;text-align:right}.list p,.loading{color:var(--ts-muted);text-align:center;padding:25px}.alert{padding:14px;border-radius:12px;background:#fef2f2;color:#b91c1c;margin-bottom:15px}.alert button{float:right;padding:4px 8px}@media(max-width:1050px){.kpi-grid{grid-template-columns:repeat(2,1fr)}.content-grid{grid-template-columns:1fr}}@media(max-width:650px){.reports-page{max-width:none}.page-header{align-items:stretch;flex-direction:column;gap:16px}.page-header h2{font-size:2rem;color:var(--ts-text)}.page-header p{font-size:.95rem;line-height:1.5}.actions{display:grid;grid-template-columns:1fr;gap:8px}.actions button{min-height:48px;font-size:.95rem}.kpi-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.kpi-grid article{padding:14px;min-height:112px}.kpi-grid strong{font-size:1.35rem}.content-grid{gap:10px}.panel{padding:16px}.panel-title{margin-bottom:12px}.chart{gap:6px;height:210px;padding-inline:0}.bars span{width:9px}.legend{flex-wrap:wrap;gap:10px}.list div{align-items:flex-start}.list span,.list strong{font-size:.82rem}}
:global(:root[data-theme='dark']) .page-header h2,:global(:root[data-theme='dark']) .panel-title h3,:global(:root[data-theme='dark']) .kpi-grid strong,:global(:root[data-theme='dark']) .list span,:global(:root[data-theme='dark']) .list strong{color:var(--ts-text)!important}:global(:root[data-theme='dark']) .kpi-grid article,:global(:root[data-theme='dark']) .panel{background:var(--ts-surface)!important;border-color:var(--ts-border)!important}:global(:root[data-theme='dark']) .secondary{background:var(--ts-surface-2)!important;color:var(--ts-text)!important}
</style>
