<script setup>
import { computed, onMounted, ref } from 'vue'
import { supabase } from '../lib/supabase'

const garantias = ref([])
const reclamaciones = ref([])
const cargando = ref(true)
const busqueda = ref('')
const filtro = ref('Todas')
const mostrarFormulario = ref(false)
const guardando = ref(false)
const form = ref({ garantia_id: '', motivo: '', diagnostico: '', resolucion: '', estado: 'En revisión', notas: '' })

function fecha(v) { return v ? new Date(v).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Sin fecha' }
function vencimiento(g) {
  const base = new Date(g.created_at || Date.now())
  base.setDate(base.getDate() + Number(g.dias_garantia || 0))
  return base
}
function estadoGarantia(g) {
  if (!g.activa) return 'Inactiva'
  const dias = Math.ceil((vencimiento(g) - new Date()) / 86400000)
  if (dias < 0) return 'Vencida'
  if (dias <= 30) return 'Por vencer'
  return 'Activa'
}
function claseEstado(e) {
  if (e === 'Activa' || e === 'Resuelta') return 'ts-stock-success'
  if (e === 'Por vencer' || e === 'En revisión') return 'ts-stock-warning'
  return 'ts-stock-danger'
}
const filas = computed(() => garantias.value.map(g => ({ ...g, estado_calculado: estadoGarantia(g), vence: vencimiento(g) })))
const filtradas = computed(() => {
  const q = busqueda.value.toLowerCase().trim()
  return filas.value.filter(g => {
    const texto = [g.ordenes?.folio, g.ordenes?.clientes?.nombre, g.ordenes?.equipos?.modelo, g.tipo_servicio].filter(Boolean).join(' ').toLowerCase()
    return (!q || texto.includes(q)) && (filtro.value === 'Todas' || g.estado_calculado === filtro.value)
  })
})
const activas = computed(() => filas.value.filter(g => g.estado_calculado === 'Activa').length)
const porVencer = computed(() => filas.value.filter(g => g.estado_calculado === 'Por vencer').length)
const vencidas = computed(() => filas.value.filter(g => g.estado_calculado === 'Vencida').length)
const abiertas = computed(() => reclamaciones.value.filter(r => !['Resuelta', 'Rechazada'].includes(r.estado)).length)

async function cargar() {
  cargando.value = true
  const [{ data: gs, error: eg }, { data: rs, error: er }] = await Promise.all([
    supabase.from('garantias').select('*, ordenes(*, clientes(*), equipos(*))').order('id', { ascending: false }),
    supabase.from('reclamaciones_garantia').select('*').order('id', { ascending: false })
  ])
  if (eg) alert(eg.message)
  if (er && !String(er.message).includes('reclamaciones_garantia')) alert(er.message)
  garantias.value = gs || []
  reclamaciones.value = rs || []
  cargando.value = false
}
async function guardarReclamacion() {
  if (!form.value.garantia_id || !form.value.motivo.trim()) return alert('Selecciona una garantía y escribe el motivo')
  guardando.value = true
  const { error } = await supabase.from('reclamaciones_garantia').insert({ ...form.value, garantia_id: Number(form.value.garantia_id), fecha_reclamacion: new Date().toISOString() })
  guardando.value = false
  if (error) return alert(error.message)
  form.value = { garantia_id: '', motivo: '', diagnostico: '', resolucion: '', estado: 'En revisión', notas: '' }
  mostrarFormulario.value = false
  await cargar()
}
onMounted(cargar)
</script>

<template>
<section class="ts-module-page">
  <header class="ts-module-header"><div><span class="ts-eyebrow">Postventa</span><h2>Garantías</h2><p>Vigencias reales, reclamaciones e historial por orden.</p></div><button class="ts-action-primary" @click="mostrarFormulario = !mostrarFormulario">{{ mostrarFormulario ? 'Cerrar' : 'Registrar reclamación' }}</button></header>
  <div class="ts-metric-strip ts-metric-strip-four"><article class="ts-mini-metric"><span>Activas</span><strong>{{ activas }}</strong><small>Con más de 30 días</small></article><article class="ts-mini-metric"><span>Por vencer</span><strong>{{ porVencer }}</strong><small>Próximos 30 días</small></article><article class="ts-mini-metric"><span>Vencidas</span><strong>{{ vencidas }}</strong><small>Fuera de vigencia</small></article><article class="ts-mini-metric"><span>Reclamaciones</span><strong>{{ abiertas }}</strong><small>Abiertas o en revisión</small></article></div>
  <section v-if="mostrarFormulario" class="ts-panel ts-form-panel"><div class="ts-panel-heading"><div><span class="ts-panel-kicker">Seguimiento</span><h3>Nueva reclamación</h3></div></div><form class="ts-smart-form" @submit.prevent="guardarReclamacion"><label class="ts-field ts-field-wide"><span>Garantía *</span><select v-model="form.garantia_id"><option value="">Selecciona</option><option v-for="g in filas.filter(x => ['Activa','Por vencer'].includes(x.estado_calculado))" :key="g.id" :value="g.id">{{ g.ordenes?.folio }} · {{ g.tipo_servicio }}</option></select></label><label class="ts-field ts-field-wide"><span>Motivo *</span><input v-model="form.motivo" placeholder="Describe la falla reportada"></label><label class="ts-field"><span>Estado</span><select v-model="form.estado"><option>En revisión</option><option>Aprobada</option><option>Rechazada</option><option>Resuelta</option></select></label><label class="ts-field ts-field-full"><span>Notas</span><textarea v-model="form.notas" rows="3"></textarea></label><div class="ts-form-actions ts-field-full"><button class="ts-action-secondary" type="button" @click="mostrarFormulario=false">Cancelar</button><button class="ts-action-primary" :disabled="guardando">{{ guardando ? 'Guardando…' : 'Guardar reclamación' }}</button></div></form></section>
  <div class="ts-panel"><div class="ts-orders-toolbar"><label class="ts-search-control ts-search-grow"><input v-model="busqueda" placeholder="Buscar por cliente, folio, equipo o servicio"></label><select v-model="filtro" class="ts-filter-select"><option>Todas</option><option>Activa</option><option>Por vencer</option><option>Vencida</option><option>Inactiva</option></select></div><div v-if="cargando" class="ts-empty-state"><span class="ts-spinner"></span><p>Cargando garantías…</p></div><div v-else-if="!filtradas.length" class="ts-empty-state"><strong>No hay garantías</strong><p>Las garantías creadas desde las órdenes aparecerán aquí.</p></div><div v-else class="ts-data-table"><div class="ts-data-row ts-data-head"><span>Orden</span><span>Cliente / equipo</span><span>Servicio</span><span>Vencimiento</span><span>Estado</span><span>Reclamos</span></div><div v-for="g in filtradas" :key="g.id" class="ts-data-row"><strong>{{ g.ordenes?.folio || `#${g.orden_id}` }}</strong><span><b>{{ g.ordenes?.clientes?.nombre || 'Sin cliente' }}</b><small>{{ g.ordenes?.equipos?.marca }} {{ g.ordenes?.equipos?.modelo }}</small></span><span>{{ g.tipo_servicio }}</span><span>{{ fecha(g.vence) }}</span><span><i class="ts-stock-pill" :class="claseEstado(g.estado_calculado)">{{ g.estado_calculado }}</i></span><span>{{ reclamaciones.filter(r => r.garantia_id == g.id).length }}</span></div></div></div>
</section>
</template>
