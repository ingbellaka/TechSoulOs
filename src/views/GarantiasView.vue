<script setup>
import { computed, onMounted, ref } from 'vue'
import { supabase } from '../lib/supabase'

const garantias = ref([])
const reclamaciones = ref([])
const firmasRemotas = ref([])
const enviandoFirmaId = ref(null)
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
  const [{ data: gs, error: eg }, { data: rs, error: er }, { data: fr }] = await Promise.all([
    supabase.from('garantias').select('*, ordenes(*, clientes(*), equipos(*))').order('id', { ascending: false }),
    supabase.from('reclamaciones_garantia').select('*').order('id', { ascending: false }),
    supabase.from('garantia_firmas_remotas').select('id,garantia_id,token,firmado_en,firmante_nombre').order('id', { ascending: false })
  ])
  if (eg) alert(eg.message)
  if (er && !String(er.message).includes('reclamaciones_garantia')) alert(er.message)
  garantias.value = gs || []
  reclamaciones.value = rs || []
  firmasRemotas.value = fr || []
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

function firmaDe(g) { return firmasRemotas.value.find(f => Number(f.garantia_id) === Number(g.id)) || null }
function telefonoWhatsApp(v) {
  let n = String(v || '').replace(/\D/g, '')
  if (n.length === 10) n = `52${n}`
  return n
}
async function enviarFirmaWhatsApp(g) {
  const tel = telefonoWhatsApp(g.ordenes?.clientes?.telefono)
  if (!tel) return alert('Este cliente no tiene un teléfono registrado.')
  enviandoFirmaId.value = g.id
  let firma = firmaDe(g)
  if (!firma || firma.firmado_en) {
    const token = crypto.randomUUID()
    const equipo = [g.ordenes?.equipos?.marca, g.ordenes?.equipos?.modelo].filter(Boolean).join(' ') || 'Equipo'
    const payload = {
      garantia_id:g.id, orden_id:g.orden_id, token,
      folio_garantia:`GAR-${String(g.id).padStart(4,'0')}`,
      cliente_nombre:g.ordenes?.clientes?.nombre || '', cliente_telefono:g.ordenes?.clientes?.telefono || '',
      equipo, serie:g.ordenes?.equipos?.serie || g.ordenes?.equipos?.numero_serie || null,
      servicio:g.tipo_servicio || 'Servicio realizado', dias_garantia:Number(g.dias_garantia || 0),
      condiciones:g.condiciones || '', fecha_emision:g.created_at || new Date().toISOString()
    }
    const { data, error } = await supabase.from('garantia_firmas_remotas').insert(payload).select('id,garantia_id,token,firmado_en,firmante_nombre').single()
    if (error) { enviandoFirmaId.value=null; return alert(`No se pudo crear el enlace: ${error.message}`) }
    firma = data; firmasRemotas.value.unshift(data)
  }
  const link = `${window.location.origin}/firma-garantia/${firma.token}`
  const cliente = g.ordenes?.clientes?.nombre?.split(' ')[0] || ''
  const mensaje = `Hola${cliente ? ` ${cliente}` : ''} 👋 Somos TechSoul.\n\nTe compartimos la garantía correspondiente a tu equipo. Por favor revisa las condiciones y firma de conformidad en el siguiente enlace:\n\n${link}\n\n¡Gracias por confiar en TechSoul! 💙`
  window.open(`https://wa.me/${tel}?text=${encodeURIComponent(mensaje)}`, '_blank', 'noopener,noreferrer')
  enviandoFirmaId.value=null
}

onMounted(cargar)
</script>

<template>
<section class="ts-module-page">
  <header class="ts-module-header"><div><span class="ts-eyebrow">Postventa</span><h2>Garantías</h2><p>Vigencias reales, reclamaciones e historial por orden.</p></div><button class="ts-action-primary" @click="mostrarFormulario = !mostrarFormulario">{{ mostrarFormulario ? 'Cerrar' : 'Registrar reclamación' }}</button></header>
  <div class="ts-metric-strip ts-metric-strip-four"><article class="ts-mini-metric"><span>Activas</span><strong>{{ activas }}</strong><small>Con más de 30 días</small></article><article class="ts-mini-metric"><span>Por vencer</span><strong>{{ porVencer }}</strong><small>Próximos 30 días</small></article><article class="ts-mini-metric"><span>Vencidas</span><strong>{{ vencidas }}</strong><small>Fuera de vigencia</small></article><article class="ts-mini-metric"><span>Reclamaciones</span><strong>{{ abiertas }}</strong><small>Abiertas o en revisión</small></article></div>
  <section v-if="mostrarFormulario" class="ts-panel ts-form-panel"><div class="ts-panel-heading"><div><span class="ts-panel-kicker">Seguimiento</span><h3>Nueva reclamación</h3></div></div><form class="ts-smart-form" @submit.prevent="guardarReclamacion"><label class="ts-field ts-field-wide"><span>Garantía *</span><select v-model="form.garantia_id"><option value="">Selecciona</option><option v-for="g in filas.filter(x => ['Activa','Por vencer'].includes(x.estado_calculado))" :key="g.id" :value="g.id">{{ g.ordenes?.folio }} · {{ g.tipo_servicio }}</option></select></label><label class="ts-field ts-field-wide"><span>Motivo *</span><input v-model="form.motivo" placeholder="Describe la falla reportada"></label><label class="ts-field"><span>Estado</span><select v-model="form.estado"><option>En revisión</option><option>Aprobada</option><option>Rechazada</option><option>Resuelta</option></select></label><label class="ts-field ts-field-full"><span>Notas</span><textarea v-model="form.notas" rows="3"></textarea></label><div class="ts-form-actions ts-field-full"><button class="ts-action-secondary" type="button" @click="mostrarFormulario=false">Cancelar</button><button class="ts-action-primary" :disabled="guardando">{{ guardando ? 'Guardando…' : 'Guardar reclamación' }}</button></div></form></section>
  <div class="ts-panel"><div class="ts-orders-toolbar"><label class="ts-search-control ts-search-grow"><input v-model="busqueda" placeholder="Buscar por cliente, folio, equipo o servicio"></label><select v-model="filtro" class="ts-filter-select"><option>Todas</option><option>Activa</option><option>Por vencer</option><option>Vencida</option><option>Inactiva</option></select></div><div v-if="cargando" class="ts-empty-state"><span class="ts-spinner"></span><p>Cargando garantías…</p></div><div v-else-if="!filtradas.length" class="ts-empty-state"><strong>No hay garantías</strong><p>Las garantías creadas desde las órdenes aparecerán aquí.</p></div><div v-else class="ts-data-table"><div class="ts-data-row ts-data-head"><span>Orden</span><span>Cliente / equipo</span><span>Servicio</span><span>Vencimiento</span><span>Estado</span><span>Reclamos / firma</span></div><div v-for="g in filtradas" :key="g.id" class="ts-data-row"><strong>{{ g.ordenes?.folio || `#${g.orden_id}` }}</strong><span><b>{{ g.ordenes?.clientes?.nombre || 'Sin cliente' }}</b><small>{{ g.ordenes?.equipos?.marca }} {{ g.ordenes?.equipos?.modelo }}</small></span><span>{{ g.tipo_servicio }}</span><span>{{ fecha(g.vence) }}</span><span><i class="ts-stock-pill" :class="claseEstado(g.estado_calculado)">{{ g.estado_calculado }}</i></span><span class="warranty-actions"><small>{{ reclamaciones.filter(r => r.garantia_id == g.id).length }} reclamo(s)</small><b v-if="firmaDe(g)?.firmado_en" class="signed-ok">✓ Firmada</b><button v-else class="whatsapp-btn" :disabled="enviandoFirmaId === g.id" @click="enviarFirmaWhatsApp(g)">{{ enviandoFirmaId === g.id ? 'Generando…' : 'WhatsApp · Firmar' }}</button></span></div></div></div>
</section>
</template>

<style scoped>
.warranty-actions{display:flex!important;flex-direction:column;align-items:flex-start;gap:6px}.warranty-actions small{color:#64748b}.whatsapp-btn{border:0;border-radius:9px;background:#dcfce7;color:#087a3c;padding:7px 9px;font-size:.68rem;font-weight:850;cursor:pointer;white-space:nowrap}.whatsapp-btn:disabled{opacity:.6}.signed-ok{font-size:.72rem;color:#087a3c;background:#dcfce7;padding:6px 8px;border-radius:999px;white-space:nowrap}

@media (max-width: 900px){
  .ts-metric-strip-four{grid-template-columns:repeat(2,minmax(0,1fr))!important}
  .ts-orders-toolbar{display:grid!important;grid-template-columns:1fr 180px!important;gap:10px!important}
  .ts-data-table{overflow:visible!important}
  .ts-data-row{grid-template-columns:110px minmax(180px,1.4fr) minmax(130px,1fr) 120px 100px minmax(140px,.9fr)!important}
}
@media (max-width: 680px){
  .ts-module-header{align-items:stretch!important;gap:14px!important}
  .ts-module-header .ts-action-primary{width:100%!important}
  .ts-metric-strip-four{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px!important}
  .ts-mini-metric{min-width:0!important;padding:14px!important}
  .ts-orders-toolbar{grid-template-columns:1fr!important}
  .ts-filter-select,.ts-search-control,.ts-search-control input{width:100%!important;min-width:0!important}
  .ts-data-table{display:grid!important;gap:12px!important;background:transparent!important;border:0!important;overflow:visible!important}
  .ts-data-head{display:none!important}
  .ts-data-row:not(.ts-data-head){display:grid!important;grid-template-columns:1fr auto!important;gap:8px 12px!important;padding:16px!important;border:1px solid var(--ts-border,#dbe3ee)!important;border-radius:16px!important;background:var(--ts-surface,#fff)!important;box-shadow:0 8px 22px rgba(15,23,42,.06)!important}
  .ts-data-row:not(.ts-data-head)>strong{grid-column:1;font-size:.86rem!important}
  .ts-data-row:not(.ts-data-head)>span:nth-child(2){grid-column:1/-1;display:flex!important;flex-direction:column!important;gap:2px!important;font-size:1rem!important}
  .ts-data-row:not(.ts-data-head)>span:nth-child(3){grid-column:1/-1;color:var(--ts-muted,#64748b)!important}
  .ts-data-row:not(.ts-data-head)>span:nth-child(3)::before{content:'Servicio: ';font-weight:800;color:var(--ts-text,#0f172a)}
  .ts-data-row:not(.ts-data-head)>span:nth-child(4){grid-column:1;color:var(--ts-muted,#64748b)!important}
  .ts-data-row:not(.ts-data-head)>span:nth-child(4)::before{content:'Vence: ';font-weight:800;color:var(--ts-text,#0f172a)}
  .ts-data-row:not(.ts-data-head)>span:nth-child(5){grid-column:2;grid-row:1;justify-self:end}
  .warranty-actions{grid-column:1/-1!important;border-top:1px solid var(--ts-border,#e2e8f0);padding-top:10px;margin-top:2px;width:100%;display:grid!important;grid-template-columns:1fr auto!important;align-items:center!important}
  .whatsapp-btn{min-height:42px;padding:9px 12px!important;font-size:.76rem!important}
}
@media (max-width: 390px){.ts-metric-strip-four{grid-template-columns:1fr!important}.warranty-actions{grid-template-columns:1fr!important}.whatsapp-btn{width:100%}}
</style>
