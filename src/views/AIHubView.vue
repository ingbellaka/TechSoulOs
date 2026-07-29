<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getRates, getQuotes, money } from '../lib/pricing'
import { getBudgets, getBusinessSettings } from '../lib/business'
import { buildBudgetDraft, buildClientMessage, detectIntent, matchRates, uniqueRates } from '../lib/aiAssistant'

const router = useRouter()
const negocio = getBusinessSettings()
const rates = ref(uniqueRates(getRates()))
const quotes = ref(getQuotes())
const budgets = ref(getBudgets())
const prompt = ref('')
const respuesta = ref('')
const resultados = ref([])
const aviso = ref('')

const guided = ref({ marca: '', modelo: '', servicio: '', calidad: '' })
const sugerencias = [
  'Cotiza una pantalla para iPhone 13',
  'Redacta un mensaje para batería de iPhone 14 Pro',
  '¿Qué presupuestos necesitan seguimiento?',
  '¿Qué precios tengo para Samsung?'
]

const marcas = computed(() => [...new Set(rates.value.map((r) => r.marca).filter(Boolean))].sort())
const modelos = computed(() => [...new Set(rates.value.filter((r) => !guided.value.marca || r.marca === guided.value.marca).map((r) => r.modelo).filter(Boolean))].sort())
const servicios = computed(() => [...new Set(rates.value.filter((r) => !guided.value.modelo || r.modelo === guided.value.modelo).map((r) => r.servicio).filter(Boolean))].sort())
const calidades = computed(() => [...new Set(rates.value.filter((r) => (!guided.value.modelo || r.modelo === guided.value.modelo) && (!guided.value.servicio || r.servicio === guided.value.servicio)).map((r) => r.calidad).filter(Boolean))].sort())
const stats = computed(() => ({
  tarifas: rates.value.length,
  cotizaciones: quotes.value.length,
  presupuestos: budgets.value.length,
  pendientes: budgets.value.filter((x) => ['Borrador', 'Enviado'].includes(x.estado)).length
}))

function resetOutput() {
  respuesta.value = ''
  resultados.value = []
  aviso.value = ''
}

function generarDesdeTexto() {
  resetOutput()
  const text = prompt.value.trim()
  if (!text) return
  const intent = detectIntent(text, rates.value)

  if (intent.followUp) {
    const pending = budgets.value.filter((x) => ['Borrador', 'Enviado'].includes(x.estado))
    respuesta.value = pending.length
      ? `Hay ${pending.length} presupuesto(s) que requieren seguimiento:\n\n${pending.slice(0, 10).map((x) => `• ${x.folio} · ${x.cliente} · ${x.equipo} · ${money(x.total)} · ${x.estado}`).join('\n')}`
      : 'No hay presupuestos pendientes de seguimiento.'
    return
  }

  if (intent.samsungOverview) {
    const samsung = rates.value.filter((r) => String(r.marca).toLowerCase() === 'samsung').slice(0, 12)
    resultados.value = samsung
    respuesta.value = samsung.length
      ? buildClientMessage(samsung, negocio, money)
      : 'Todavía no hay tarifas de Samsung registradas. Agrégalas en Tarifario o usa el Cotizador inteligente para calcularlas.'
    return
  }

  const matches = matchRates(intent, rates.value)
  resultados.value = matches.slice(0, 8)
  if (resultados.value.length) {
    respuesta.value = buildClientMessage(resultados.value, negocio, money)
    return
  }

  const missing = []
  if (!intent.model) missing.push('modelo exacto')
  if (!intent.service) missing.push('servicio')
  aviso.value = missing.length ? `Falta identificar: ${missing.join(' y ')}.` : 'No encontré una coincidencia exacta en el tarifario.'
  respuesta.value = `No encontré un precio exacto para esa solicitud. ${aviso.value}\n\nPrueba escribiendo algo como “Pantalla OLED para iPhone 13” o agrega primero la tarifa correspondiente.`
}

function generarGuiado() {
  resetOutput()
  const intent = {
    raw: '', normalized: '',
    brand: guided.value.marca,
    model: guided.value.modelo,
    service: guided.value.servicio,
    quality: guided.value.calidad
  }
  resultados.value = matchRates(intent, rates.value).slice(0, 8)
  if (!resultados.value.length) {
    respuesta.value = 'No hay una tarifa que coincida con los filtros seleccionados.'
    return
  }
  respuesta.value = buildClientMessage(resultados.value, negocio, money)
}

function usar(text) {
  prompt.value = text
  generarDesdeTexto()
}

async function copiar() {
  await navigator.clipboard?.writeText(respuesta.value)
  aviso.value = 'Respuesta copiada.'
}

function crearPresupuesto() {
  const draft = buildBudgetDraft(resultados.value, negocio)
  if (!draft) return alert('Primero genera una cotización con resultados.')
  localStorage.setItem('techsoul_budget_draft_v1', JSON.stringify(draft))
  router.push('/presupuestos')
}

function irTarifario() { router.push('/tarifario') }
function irCotizador() { router.push('/cotizador') }
</script>

<template>
  <section class="ts-module-page">
    <header class="ts-module-header">
      <div>
        <span class="ts-eyebrow">Asistente local del negocio</span>
        <h2>TechSoul AI</h2>
        <p>Interpreta modelo, servicio y calidad; después consulta únicamente las tarifas reales del sistema.</p>
      </div>
    </header>

    <div class="ai-stats">
      <article><span>Tarifas activas</span><strong>{{ stats.tarifas }}</strong></article>
      <article><span>Cotizaciones</span><strong>{{ stats.cotizaciones }}</strong></article>
      <article><span>Presupuestos</span><strong>{{ stats.presupuestos }}</strong></article>
      <article><span>Seguimientos</span><strong>{{ stats.pendientes }}</strong></article>
    </div>

    <div class="guided ts-panel">
      <div class="guided-heading">
        <div><span class="ts-panel-kicker">Cotizador guiado</span><h3>Selecciona los datos exactos</h3></div>
        <button class="ts-action-primary" @click="generarGuiado">Generar cotización</button>
      </div>
      <div class="guided-grid">
        <label><span>Marca</span><select v-model="guided.marca"><option value="">Todas</option><option v-for="item in marcas" :key="item">{{ item }}</option></select></label>
        <label><span>Modelo</span><select v-model="guided.modelo"><option value="">Todos</option><option v-for="item in modelos" :key="item">{{ item }}</option></select></label>
        <label><span>Servicio</span><select v-model="guided.servicio"><option value="">Todos</option><option v-for="item in servicios" :key="item">{{ item }}</option></select></label>
        <label><span>Calidad</span><select v-model="guided.calidad"><option value="">Todas</option><option v-for="item in calidades" :key="item">{{ item }}</option></select></label>
      </div>
    </div>

    <div class="ai-layout">
      <article class="ts-panel input-panel">
        <h3>Escribe como normalmente cotizas</h3>
        <textarea v-model="prompt" rows="5" placeholder="Ej. Redacta un mensaje para batería de iPhone 14 Pro"></textarea>
        <div class="chips"><button v-for="item in sugerencias" :key="item" @click="usar(item)">{{ item }}</button></div>
        <button class="ts-action-primary" @click="generarDesdeTexto">Interpretar y buscar</button>
      </article>

      <article class="result">
        <div class="result-head"><span>RESPUESTA LISTA PARA EL CLIENTE</span><button v-if="respuesta" @click="copiar">Copiar</button></div>
        <pre>{{ respuesta || 'La respuesta aparecerá aquí.' }}</pre>
        <div v-if="resultados.length" class="result-actions">
          <button @click="crearPresupuesto">Crear presupuesto</button>
          <button @click="irTarifario">Abrir tarifario</button>
        </div>
        <div v-else class="result-actions"><button @click="irCotizador">Calcular precio nuevo</button><button @click="irTarifario">Agregar tarifa</button></div>
        <small>{{ aviso || 'Los precios se toman del tarifario local. El asistente no inventa importes ni envía datos a servicios externos.' }}</small>
      </article>
    </div>
  </section>
</template>

<style scoped>
.ts-module-page{width:100%;max-width:1560px;margin:0 auto;padding:28px 28px 42px;box-sizing:border-box}
.ts-module-header{margin-bottom:20px}
.ts-module-header>div{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}
.ts-module-header h2{margin:0;font-size:30px;line-height:1.15;letter-spacing:-.03em;color:#101828}
.ts-module-header p{margin:0;color:#667085;font-size:14px;line-height:1.5}
.ts-eyebrow,.ts-panel-kicker{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#2563eb}
.ai-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:18px}
.ai-stats article{min-width:0;background:#fff;border:1px solid #e4e7ec;border-radius:16px;padding:18px 20px;box-shadow:0 1px 2px rgba(16,24,40,.03)}
.ai-stats span{display:block;color:#667085;font-size:13px;margin-bottom:6px}
.ai-stats strong{display:block;color:#101828;font-size:28px;line-height:1;font-weight:750}
.ts-panel{background:#fff;border:1px solid #e4e7ec;border-radius:18px;box-shadow:0 1px 3px rgba(16,24,40,.04)}
.guided{padding:20px;margin-bottom:18px}
.guided-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:18px}
.guided-heading h3,.input-panel h3{margin:4px 0 0;color:#101828;font-size:20px;line-height:1.25;letter-spacing:-.02em}
.guided-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.guided-grid label{display:grid;gap:7px;min-width:0;color:#475467;font-size:13px;font-weight:600}
.guided-grid select{width:100%;min-width:0;height:44px;padding:0 38px 0 12px;border:1px solid #d0d5dd;border-radius:11px;background:#fff;color:#101828;font:inherit;outline:none}
.guided-grid select:focus,.input-panel textarea:focus{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.12)}
.ts-action-primary{flex:0 0 auto;border:0;border-radius:10px;background:#2563eb;color:#fff;padding:11px 16px;font-size:13px;font-weight:700;box-shadow:0 6px 14px rgba(37,99,235,.18);cursor:pointer}
.ts-action-primary:hover{background:#1d4ed8}
.ai-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr);gap:18px;align-items:stretch}
.input-panel{padding:20px;min-width:0}
.input-panel textarea{display:block;width:100%;min-height:150px;box-sizing:border-box;padding:14px;border:1px solid #d0d5dd;border-radius:12px;margin:14px 0 12px;resize:vertical;color:#101828;font:inherit;line-height:1.5;outline:none}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px}
.chips button{max-width:100%;border:1px solid #dbe3ec;background:#fff;color:#344054;border-radius:999px;padding:8px 11px;font-size:12px;line-height:1.35;text-align:left;cursor:pointer}
.chips button:hover{border-color:#84adff;background:#f5f8ff;color:#1849a9}
.result{min-width:0;background:#101828;color:#fff;border-radius:18px;padding:22px;min-height:390px;display:flex;flex-direction:column;box-shadow:0 10px 24px rgba(16,24,40,.12)}
.result-head{display:flex;justify-content:space-between;align-items:center;gap:12px;color:#d0d5dd;font-size:12px;font-weight:800;letter-spacing:.04em}
.result-head button,.result-actions button{border:1px solid rgba(255,255,255,.16);background:#fff;color:#101828;border-radius:9px;padding:9px 13px;font-size:12px;font-weight:700;cursor:pointer}
.result pre{min-width:0;overflow-wrap:anywhere;white-space:pre-wrap;font:inherit;font-size:14px;line-height:1.7;margin:24px 0;color:#f2f4f7;flex:1}
.result-actions{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
.result small{color:#98a2b3;font-size:12px;line-height:1.5}
@media(max-width:1150px){.ts-module-page{padding:24px 20px 36px}.ai-layout{grid-template-columns:1fr}.result{min-height:330px}}
@media(max-width:850px){.ai-stats{grid-template-columns:1fr 1fr}.guided-grid{grid-template-columns:1fr 1fr}}
@media(max-width:560px){.ts-module-page{padding:18px 14px 28px}.ts-module-header>div{display:block}.ts-module-header h2{font-size:26px;margin:5px 0}.ai-stats,.guided-grid{grid-template-columns:1fr}.guided-heading{align-items:stretch;flex-direction:column}.guided-heading .ts-action-primary{width:100%}.result{padding:18px;border-radius:14px}}
</style>
