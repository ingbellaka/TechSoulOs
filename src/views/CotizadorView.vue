<script setup>
import { computed, ref, onMounted, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/auth'
import { loadCalculator, saveCalculatorSettings, saveCalculatorQuote, addQuoteToOrder } from '../services/calculador.service'
import { calculateQuote, getPricingSettings, savePricingSettings, getQuotes, saveQuotes, getRates, saveRates, money } from '../lib/pricing'
const router=useRouter(), route=useRoute(), auth=useAuthStore(); const settings=ref(getPricingSettings()); const quotes=ref([]); const form=ref({marca:'Samsung',modelo:'',servicio:'Pantalla',calidad:'',costo_pieza:0,envio:0,riesgo:'medio',cliente:'',precio_final:0}); const showSettings=ref(false)
const order=ref(null), busy=ref(false), error=ref(''), notice=ref(''), ready=ref(false)
const legacyQuotes=ref(getQuotes())
const canConfigure=computed(()=>auth.can(['admin','recepcion']))
const listaAbierta = ref(false)
const modeloBusqueda = ref('')
const buscadorPrecios = ref(null)
const preciosCatalogo = ref([])
const buscandoPrecios = ref(false)
const errorPrecios = ref('')
const servicioADomicilio = ref(false)
const tarifaDomicilioGuardada = ref(0)
const cargoDomicilio = computed(() => servicioADomicilio.value ? tarifaDomicilioGuardada.value : 0)
const requierePrecioManual = ref(false)

function requierePrecioInstalado(precio) {
  return precio.notas?.startsWith('Villanotec PDF') && precio.categoria === 'Pantallas' && Number(precio.costo_base) > 900
}

async function buscarPrecios() {
  buscandoPrecios.value = true
  errorPrecios.value = ''
  try {
    const busqueda = modeloBusqueda.value.trim()
    const marcaEncontrada = busqueda.match(/^(Samsung|Motorola|Xiaomi|Huawei|Honor|Vivo|Oppo|Realme|ZTE|Infinix|Google|OnePlus|Apple|LG|TCL|Cubot)(?:\s+|$)/i)
    const modelo = marcaEncontrada ? busqueda.slice(marcaEncontrada[0].length).trim() : busqueda
    let consulta = supabase.from('catalogo_servicios')
      .select('id,nombre,categoria,marca,modelo,variante,costo_base,precio_venta,notas')
      .eq('activo', true).gt('precio_venta', 0)
    if (marcaEncontrada) consulta = consulta.ilike('marca', marcaEncontrada[1])
    if (modelo) consulta = consulta.ilike('modelo', '%' + modelo.replace(/[\\%_]/g, '\\$&') + '%')
    const { data, error } = await consulta.order('modelo').limit(40)
    if (error) throw error
    preciosCatalogo.value = data || []
  } catch (error) {
    preciosCatalogo.value = []
    errorPrecios.value = error.message || 'No se pudo consultar la lista de precios.'
  } finally {
    buscandoPrecios.value = false
  }
}

async function alternarListaPrecios() {
  listaAbierta.value = !listaAbierta.value
  if (!listaAbierta.value) return
  modeloBusqueda.value = form.value.modelo
  await nextTick()
  buscadorPrecios.value?.focus()
  await buscarPrecios()
}

function usarPrecioCatalogo(precio) {
  requierePrecioManual.value = requierePrecioInstalado(precio)
  Object.assign(form.value, {
    marca: precio.marca || '',
    modelo: precio.modelo || form.value.modelo,
    servicio: precio.nombre,
    calidad: precio.variante || '',
    costo_pieza: Number(precio.costo_base || 0),
    envio: 0,
    precio_final: requierePrecioManual.value ? 0 : Number(precio.precio_venta),
  })
  listaAbierta.value = false
  notice.value = requierePrecioManual.value ? 'Captura el precio instalado para esta pantalla antes de cotizar.' : 'Precio de la lista aplicado a la cotización.'
}
const result = computed(() => calculateQuote(form.value, settings.value))
const precioReparacion = computed(() => Number(form.value.precio_final || (requierePrecioManual.value ? 0 : result.value.recommended)))
const finalPrice = computed(() => Math.round((precioReparacion.value + Number(cargoDomicilio.value || 0)) * 100) / 100)
const finalMargin = computed(() => precioReparacion.value ? ((precioReparacion.value - result.value.realCost) / precioReparacion.value) * 100 : 0)
function validate(){
  if(!ready.value) throw new Error('Espera a que cargue la configuración compartida.')
  if(!form.value.modelo.trim() || !form.value.servicio.trim()) throw new Error('Captura modelo y servicio.')
  if (requierePrecioManual.value && !(Number(form.value.precio_final) > 0)) throw new Error('Captura el precio instalado de esta pantalla.')
  if([form.value.costo_pieza,form.value.envio,cargoDomicilio.value].some(v=>!Number.isFinite(Number(v)) || Number(v)<0) || !Number.isFinite(precioReparacion.value) || precioReparacion.value<=0) throw new Error('Revisa el precio de la reparación y el cargo a domicilio.')
}
async function saveSettings(){
  error.value='';busy.value=true
  try {
    const values=[settings.value.costo_operativo_inicial,settings.value.reserva_garantia,settings.value.tarifa_domicilio,...Object.values(settings.value.riesgo)]
    if(values.some(v=>!Number.isFinite(Number(v))||Number(v)<0) || !(Number(settings.value.redondeo)>0) || !(settings.value.margen_minimo>=0 && settings.value.margen_minimo<=settings.value.margen_recomendado && settings.value.margen_recomendado<100)) throw new Error('Revisa costos, redondeo y márgenes; el recomendado debe ser mayor o igual al mínimo y menor a 100%.')
    await saveCalculatorSettings(settings.value)
    savePricingSettings(settings.value)
    tarifaDomicilioGuardada.value = Number(settings.value.tarifa_domicilio || 0)
    if (tarifaDomicilioGuardada.value === 0) servicioADomicilio.value = false
    notice.value='Configuración compartida guardada.'
  } catch(e){error.value=e.message} finally{busy.value=false}
}
function snapshot() {
  validate()
  const domicilio = Number(cargoDomicilio.value || 0)
  return {
    ...form.value, ...result.value,
    servicio: domicilio > 0 ? `${form.value.servicio} · Domicilio ${money(domicilio)}` : form.value.servicio,
    precio_reparacion: precioReparacion.value, cargo_domicilio: domicilio,
    precio_final: finalPrice.value, margen_final: finalMargin.value,
    id: crypto.randomUUID(), creado_en: new Date().toISOString(),
  }
}
async function saveQuote(){
  if(busy.value)return;busy.value=true;error.value=''
  try{const q=snapshot();await saveCalculatorQuote(q);quotes.value.unshift(q);notice.value='Cotización guardada y disponible en otros dispositivos.';return q}
  catch(e){error.value=e.message}finally{busy.value=false}
}
async function useInOrder(){
  if(busy.value)return;error.value=''
  if(route.query.orden && !order.value){error.value='No se pudo cargar la orden.';return}
  if(order.value && !confirm(`Agregar ${form.value.servicio} por ${money(finalPrice.value)} a ${order.value.folio}. Se sumará al total actual de ${money(order.value.costo_total)}.`))return
  busy.value=true
  try{
    const q=snapshot();await saveCalculatorQuote(q);quotes.value.unshift(q)
    if(order.value){await addQuoteToOrder(order.value,q.id);await router.push(`/ordenes/${order.value.id}`)}
    else{sessionStorage.setItem('techsoul_quote_draft',JSON.stringify(q));await router.push('/nueva-orden?cotizacion=1')}
  }catch(e){error.value=e.message}finally{busy.value=false}
}
async function importLegacy(){
  if(busy.value)return;busy.value=true;error.value=''
  try{
    for(const q of legacyQuotes.value){if(!quotes.value.some(x=>x.id===q.id)){await saveCalculatorQuote(q);quotes.value.push(q)}}
    legacyQuotes.value=[];saveQuotes([]);notice.value='Historial anterior importado.'
  }catch(e){error.value=e.message}finally{busy.value=false}
}
onMounted(async()=>{
  try{
    const data=await loadCalculator();settings.value=data.settings;quotes.value=data.quotes
    tarifaDomicilioGuardada.value = Number(data.settings.tarifa_domicilio || 0)
    if(route.query.orden){
      const {data:o,error:e}=await supabase.from('ordenes').select('*,equipos(*)').eq('id',route.query.orden).single()
      if(e)throw e;order.value=o;form.value.marca=o.equipos?.marca||'';form.value.modelo=o.equipos?.modelo||''
    }
    ready.value=true
  }catch(e){error.value=`No se pudo cargar el calculador: ${e.message}`}
})

function addInventoryPart(){
  if(!form.value.modelo || !form.value.costo_pieza) return alert('Captura modelo y costo de pieza')
  const nombre=[form.value.servicio, form.value.marca, form.value.modelo, form.value.calidad].filter(Boolean).join(' ')
  localStorage.setItem('techsoul_inventory_draft_v1', JSON.stringify({
    nombre, categoria:'Refacciones', tipo_producto:form.value.servicio || 'Otra', marca:form.value.marca,
    compatible_con:form.value.modelo, calidad:form.value.calidad, modalidad:'bajo_pedido',
    costo:Number(form.value.costo_pieza||0)+Number(form.value.envio||0), precio_venta:precioReparacion.value,
    stock:0, stock_minimo:0, proveedor:'', ubicacion:'', notas:'Creada desde el cotizador inteligente'
  }))
  router.push('/inventario')
}
function addRate(){ const rates=getRates(); rates.unshift({id:crypto.randomUUID(),marca:form.value.marca,modelo:form.value.modelo,servicio:form.value.servicio,calidad:form.value.calidad,precio_publico:precioReparacion.value,precio_minimo:result.value.minimum,costo_actual:Number(form.value.costo_pieza),activo:true,origen:'Cotizador',actualizado_en:new Date().toISOString()}); saveRates(rates); alert('Precio agregado al tarifario') }
</script>
<template><section class="ts-module-page quote-workspace"><header class="ts-module-header"><div><span class="ts-eyebrow">Reparaciones especiales</span><h2>Cotizar</h2><p>Define el precio de la reparación y aplícalo a una orden.</p></div><div class="quote-header-actions"><button type="button" class="ts-action-primary" :aria-expanded="listaAbierta" aria-controls="lista-precios" @click="alternarListaPrecios">Lista de precios</button><button v-if="canConfigure" class="ts-action-secondary" @click="showSettings=!showSettings">{{showSettings?'Ocultar':'Configurar cálculo'}}</button></div></header>
<article v-if="listaAbierta" id="lista-precios" class="ts-panel quote-catalog">
  <div class="ts-panel-heading"><div><h3>Lista de precios</h3><p>Busca por modelo. Cada resultado muestra el precio que puedes aplicar a la cotización del cliente.</p></div></div>
  <form class="quote-catalog-search" @submit.prevent="buscarPrecios">
    <label class="ts-field"><span>Modelo</span><input ref="buscadorPrecios" v-model="modeloBusqueda" type="search" placeholder="Ej. iPhone 13 o A55"></label>
    <button type="submit" class="ts-action-secondary" :disabled="buscandoPrecios">Buscar</button>
  </form>
  <p v-if="buscandoPrecios" role="status">Buscando precios…</p>
  <p v-else-if="errorPrecios" role="alert">{{ errorPrecios }}</p>
  <p v-else-if="!preciosCatalogo.length">No hay precios para ese modelo en el catálogo.</p>
  <ul v-else class="quote-catalog-results">
    <li v-for="precio in preciosCatalogo" :key="precio.id">
      <div><strong>{{ [precio.marca, precio.modelo].filter(Boolean).join(' ') || precio.nombre }}</strong><small>{{ [precio.nombre, precio.variante, precio.notas?.startsWith('Villanotec PDF') ? 'Villanotec' : ''].filter(Boolean).join(' · ') }}</small></div>
      <div v-if="requierePrecioInstalado(precio)" class="quote-customer-price"><small>Precio instalado por definir</small><strong>Cotizar</strong></div>
      <div v-else class="quote-customer-price"><small>Precio al cliente</small><strong>{{ money(precio.precio_venta) }}</strong></div>
      <button type="button" class="ts-action-secondary" @click="usarPrecioCatalogo(precio)">Aplicar a cotización</button>
    </li>
  </ul>
</article>

<p v-if="error" role="alert" class="calculator-error">{{error}}</p><p v-if="notice" role="status">{{notice}}</p><div v-if="order" class="ts-panel p-3">Agregando servicio a <strong>{{order.folio}}</strong> · Total actual {{money(order.costo_total)}}. El precio cotizado se sumará al total.</div><button v-if="legacyQuotes.length" class="ts-action-secondary" :disabled="busy||!ready" @click="importLegacy">Importar {{legacyQuotes.length}} cotizaciones de este navegador</button><article v-if="showSettings && canConfigure" class="ts-panel ts-form-panel"><div class="ts-panel-heading"><div><span class="ts-panel-kicker">Reglas del negocio</span><h3>Cálculo rentable y estable</h3></div><button class="ts-action-primary" :disabled="busy||!ready" @click="saveSettings">Guardar configuración</button></div><div class="ts-smart-form"><label class="ts-field"><span>Tarifa fija a domicilio</span><input v-model.number="settings.tarifa_domicilio" type="number" min="0" step="0.01" inputmode="decimal"></label><label class="ts-field"><span>Operación por reparación</span><input v-model.number="settings.costo_operativo_inicial" type="number"></label><label class="ts-field"><span>Margen mínimo %</span><input v-model.number="settings.margen_minimo" type="number"></label><label class="ts-field"><span>Margen recomendado %</span><input v-model.number="settings.margen_recomendado" type="number"></label><label class="ts-field"><span>Reserva de garantía %</span><input v-model.number="settings.reserva_garantia" type="number"></label><label class="ts-field"><span>Redondear a</span><input v-model.number="settings.redondeo" type="number"></label><label class="ts-field"><span>Riesgo bajo</span><input v-model.number="settings.riesgo.bajo" type="number"></label><label class="ts-field"><span>Riesgo medio</span><input v-model.number="settings.riesgo.medio" type="number"></label><label class="ts-field"><span>Riesgo alto</span><input v-model.number="settings.riesgo.alto" type="number"></label><label class="ts-field"><span>Riesgo muy alto</span><input v-model.number="settings.riesgo.muy_alto" type="number"></label></div></article>
<div class="ts-quote-layout"><article class="ts-panel ts-form-panel"><div class="ts-panel-heading"><div><span class="ts-panel-kicker">Datos de reparación</span><h3>Nueva cotización</h3></div></div><div class="ts-smart-form"><label class="ts-field"><span>Marca</span><input v-model="form.marca"></label><label class="ts-field ts-field-wide"><span>Modelo *</span><input v-model="form.modelo" placeholder="Ej. Samsung A55"></label><label class="ts-field"><span>Servicio</span><input v-model="form.servicio"></label><label class="ts-field"><span>Calidad / pieza</span><input v-model="form.calidad"></label><label class="ts-field"><span>Costo de pieza *</span><input v-model.number="form.costo_pieza" type="number"></label><label class="ts-field"><span>Envío</span><input v-model.number="form.envio" type="number"></label><label class="ts-field"><span>Nivel de riesgo</span><select v-model="form.riesgo"><option value="bajo">Bajo</option><option value="medio">Medio</option><option value="alto">Alto</option><option value="muy_alto">Muy alto</option></select></label><label class="ts-field"><span>{{ requierePrecioManual ? "Precio instalado *" : "Precio de la reparación (opcional)" }}</span><input v-model.number="form.precio_final" type="number" :placeholder="requierePrecioManual ? 'Escribe el precio instalado' : String(result.recommended)"></label></div><div class="ts-breakdown"><div><span>Pieza + envío</span><strong>{{money(result.direct)}}</strong></div><div><span>Operación</span><strong>{{money(result.operation)}}</strong></div><div><span>Riesgo</span><strong>{{money(result.risk)}}</strong></div><div><span>Garantía</span><strong>{{money(result.warranty)}}</strong></div></div></article>
<aside class="ts-quote-result"><div class="quote-total"><span>Precio al cliente</span><strong>{{ requierePrecioManual && !precioReparacion ? "Por definir" : money(finalPrice) }}</strong></div><dl class="quote-price-breakdown"><div><dt>Reparación</dt><dd>{{money(precioReparacion)}}</dd></div></dl><div class="quote-home-service"><label><input v-model="servicioADomicilio" type="checkbox" :disabled="!tarifaDomicilioGuardada"> Servicio a domicilio <strong v-if="tarifaDomicilioGuardada">+{{ money(tarifaDomicilioGuardada) }}</strong></label><small v-if="!tarifaDomicilioGuardada">Configura la tarifa fija para activar el servicio a domicilio.</small></div><div class="ts-result-grid"><div><span>Costo real</span><strong>{{money(result.realCost)}}</strong></div><div><span>Precio mínimo</span><strong>{{money(result.minimum)}}</strong></div><div><span>Utilidad de reparación</span><strong>{{money(precioReparacion-result.realCost)}}</strong></div><div><span>Margen de reparación</span><strong>{{finalMargin.toFixed(1)}}%</strong></div></div><button class="ts-white-button" :disabled="busy||!ready" @click="useInOrder">{{order ? "Agregar servicio a esta orden" : "Usar en nueva orden"}}</button><button class="ts-outline-light" :disabled="busy||!ready" @click="saveQuote">Guardar cotización</button><button class="ts-outline-light" :disabled="busy||!ready" @click="addRate">Agregar al tarifario</button><button class="ts-outline-light" :disabled="busy||!ready" @click="addInventoryPart">Guardar como refacción</button></aside></div>
<article class="ts-panel"><div class="ts-panel-heading"><div><span class="ts-panel-kicker">Historial</span><h3>Cotizaciones recientes</h3></div></div><div class="ts-history-list"><div v-for="q in quotes.slice(0,12)" :key="q.id"><div><strong>{{q.marca}} {{q.modelo}}</strong><span>{{q.servicio}} · {{q.calidad||'General'}}</span></div><div><strong>{{money(q.precio_final)}}</strong><span>Margen {{Number(q.margen_final||0).toFixed(1)}}%</span></div></div><p v-if="!quotes.length" class="ts-empty-inline">Todavía no hay cotizaciones guardadas.</p></div></article></section></template>

<style scoped>.calculator-error{color:#b42318}.ts-quote-result button:disabled{opacity:.5;cursor:wait}</style>
