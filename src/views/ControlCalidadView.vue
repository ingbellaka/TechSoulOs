<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '../lib/supabase'
import { pruebasAprobadas } from '../utils/flujo-taller'
import { subirEvidencia } from '../lib/storage'

const route=useRoute(), router=useRouter()
const props=defineProps({orderId:[String,Number],embedded:Boolean})
const emit=defineEmits(['released'])
const currentId=computed(()=>props.orderId || route.params.id)
const orden=ref(null), evidencias=ref([]), controles=ref([]), guardando=ref(false), fotosSalida=ref({})
const liberando = ref(false)
const estados=[['Funciona','Bien'],['No funciona','Falla'],['No probado','Pend.'],['No aplica','N/A']]
const pruebas={
 Celular:['Enciende','Pantalla / imagen','Touch','Cámaras','Micrófono','Bocinas','WiFi','Bluetooth','Carga','Señal','Face ID / Touch ID','Botones','Sensores','Temperatura','Reinicios / estabilidad','Falla original resuelta'],
 Tablet:['Enciende','Pantalla / imagen','Touch','Cámaras','Micrófono','Bocinas','WiFi','Bluetooth','Carga','Botones','Temperatura','Estabilidad','Falla original resuelta'],
 iPad:['Enciende','Pantalla / imagen','Touch','Cámaras','Micrófono','Bocinas','WiFi','Bluetooth','Carga','Botón home / Face ID','Temperatura','Estabilidad','Falla original resuelta'],
 Laptop:['Enciende','Pantalla','Teclado','Touchpad','Carga / batería','WiFi','Bluetooth','Audio','Cámara','Puertos USB','Temperatura','Reinicios / estabilidad','Falla original resuelta'],
 Impresora:['Enciende','Impresión','Escáner','Alimentación de papel','WiFi / red','USB','Calidad de impresión','Sin fugas / errores','Falla original resuelta'],
 PC:['Enciende','Video','Disco / almacenamiento','RAM','USB','Red','Audio','Temperatura','Reinicios / estabilidad','Falla original resuelta'],
 'Apple Watch':['Enciende','Pantalla / touch','Corona','Botón lateral','Carga','Bluetooth','Bocina','Micrófono','Sensores','Falla original resuelta'],
 Otro:['Enciende / opera','Funciones principales','Temperatura / estabilidad','Falla original resuelta']
}
const salida={Celular:['Frontal encendido','Trasera','Laterales / marco'],Tablet:['Frontal encendida','Trasera','Laterales / marco'],iPad:['Frontal encendida','Trasera','Laterales / marco'],Laptop:['Exterior','Pantalla encendida','Teclado / área de trabajo'],Impresora:['Frontal','Prueba / resultado final','Trasera / conexiones'],PC:['Frontal','Equipo encendido / video','Trasera / conexiones'],'Apple Watch':['Pantalla encendida','Parte trasera / sensores','Laterales / corona'],Otro:['Estado final 1','Estado final 2']}
const tipo=computed(()=>orden.value?.equipos?.tipo_equipo||'Otro')
const requisitosSalida=computed(()=>salida[tipo.value]||salida.Otro)
const recepcion=computed(()=>evidencias.value.filter(e=>e.tipo==='Recepción'))
const reparacionInterna=computed(()=>evidencias.value.filter(e=>['Reparación interna','Blindajes antes de cierre'].includes(e.tipo)))
const salidaGuardada=computed(()=>evidencias.value.filter(e=>e.tipo==='Salida'))
const checksCompletos=computed(()=>pruebasAprobadas(controles.value))
const hayFallas=computed(()=>controles.value.some(control => control.estado === 'No funciona'))
const listo=computed(()=>orden.value?.estado === 'En pruebas' && !hayFallas.value)

async function cargar(){
 const id=currentId.value
 const [{data:o,error},{data:e},{data:c}]=await Promise.all([
  supabase.from('ordenes').select('*,equipos(*),clientes(nombre)').eq('id',id).single(),
  supabase.from('evidencias').select('*').eq('orden_id',id).order('id'),
  supabase.from('control_calidad_orden').select('*').eq('orden_id',id).order('id')
 ])
 if(error)return alert(error.message); orden.value=o;evidencias.value=e||[]
 const existentes=new Map((c||[]).map(x=>[x.item,x]))
 controles.value=(pruebas[tipo.value]||pruebas.Otro).map(item=>existentes.get(item)||{orden_id:Number(id),item,estado:'No probado',notas:''})
}
function foto(ev,n){const f=ev.target.files?.[0];if(!f)return;fotosSalida.value={...fotosSalida.value,[n]:{file:f,preview:URL.createObjectURL(f)}}}
async function guardarPruebas(silencioso = false) {
 guardando.value = true
 try {
  const rows = controles.value.map(c=>({orden_id:Number(currentId.value),item:c.item,estado:c.estado,notas:c.notas||''}))
  const {error}=await supabase.from('control_calidad_orden').upsert(rows,{onConflict:'orden_id,item'})
  if(error) throw error
  if(silencioso !== true) alert('Checklist de pruebas guardado')
  return true
 } catch(e) { alert(e.message); return false }
 finally { guardando.value=false }
}
async function guardarFotos(silencioso = false) {
 guardando.value=true
 try {
  for(const n of requisitosSalida.value){
   const f=fotosSalida.value[n]?.file
   if(!f||salidaGuardada.value.some(e=>e.descripcion===n))continue
   const url=await subirEvidencia(f,`orden-${currentId.value}/salida`)
   const {error}=await supabase.from('evidencias').insert({orden_id:Number(currentId.value),tipo:'Salida',url_imagen:url,descripcion:n})
   if(error)throw error
  }
  if(silencioso !== true){await cargar();alert('Evidencia de salida guardada')}
  return true
 } catch(e){alert(e.message);return false}
 finally{guardando.value=false}
}
async function marcarListo() {
 if (!listo.value || guardando.value || liberando.value) return
 if (!checksCompletos.value && !confirm('Quedan pruebas sin completar. ¿Marcar como listo y dejarlo registrado en el historial?')) return
 liberando.value = true
 try {
  if (!await guardarPruebas(true) || !await guardarFotos(true)) return
  await cargar()
  if (!listo.value) return alert('Para liberar el equipo debe estar En pruebas y no tener fallas registradas.')
  const anterior = orden.value.estado
  const { data, error } = await supabase.from('ordenes').update({estado:'Listo',fecha_listo:new Date().toISOString()}).eq('id',orden.value.id).eq('estado','En pruebas').select('id').single()
  if (error || !data) return alert(error?.message || 'La orden cambió en otro dispositivo. Recarga antes de liberarla.')
  const pruebasCompletas = checksCompletos.value
  const { error: errorHistorial } = await supabase.from('orden_historial').insert({
   orden_id:orden.value.id,tipo:'calidad',
   titulo:pruebasCompletas ? 'Control de calidad aprobado' : 'Listo con pruebas pendientes',
   descripcion:pruebasCompletas ? 'Pruebas aprobadas.' : 'Se liberó el equipo con pruebas sin completar.',
   estado_anterior:anterior,estado_nuevo:'Listo'
  })
  if (errorHistorial) alert('La orden quedó lista, pero no se pudo guardar el evento en el historial.')
  if(props.embedded) emit('released')
  else router.push(`/ordenes/${orden.value.id}`)
 } catch (error) { alert(error.message) }
 finally { liberando.value = false }
}
onMounted(cargar)
</script>
<template><section v-if="orden" class="qc-page">
 <header><div><button v-if="!embedded" class="back" @click="router.push('/taller')">← Volver al taller</button><span>CONTROL DE CALIDAD · {{ orden.folio }}</span><h1>Pruebas y evidencia final</h1><p>{{ orden.equipos?.marca }} {{ orden.equipos?.modelo }} · {{ tipo }} · {{ orden.clientes?.nombre }}</p></div><div class="state">{{ orden.estado }}</div></header>
 <div class="summary"><b>📥 Recepción {{ recepcion.length }}</b><b>🧪 Pruebas {{ controles.filter(c=>c.estado!=='No probado').length }}/{{ controles.length }}</b><b>📤 Salida {{ salidaGuardada.length }}/{{ requisitosSalida.length }}</b><b :class="{ok:listo}">{{ listo?'✓ Puede liberarse':'Pendiente' }}</b></div>
 <article class="panel"><div class="title"><div><span>01 · EVIDENCIA ORIGINAL</span><h2>Así se recibió</h2></div></div><div class="photos"><figure v-for="e in recepcion" :key="e.id"><img :src="e.url_imagen"><figcaption>{{e.descripcion}}</figcaption></figure></div></article>
 <article class="panel"><div class="title"><div><span>02 · EVIDENCIA DE REPARACIÓN</span><h2>Interior y blindajes antes del cierre</h2><p>Evidencia del interior tomada antes de cerrar el equipo e iniciar las pruebas.</p></div></div><div v-if="reparacionInterna.length" class="photos"><figure v-for="e in reparacionInterna" :key="e.id"><img :src="e.url_imagen"><figcaption>{{e.descripcion || 'Reparación interna'}}</figcaption></figure></div><p v-else class="missing-internal">⚠ Aún no existe evidencia interna de la reparación.</p></article>
 <article class="panel"><div class="title"><div><span>03 · VALIDACIÓN FUNCIONAL</span><h2>Checklist final · {{tipo}}</h2><p>Completa las pruebas que puedas. Si quedan pendientes, puedes liberar el equipo y dejarlo registrado.</p></div><button @click="guardarPruebas" :disabled="guardando">Guardar pruebas</button></div><div class="checks"><div v-for="c in controles" :key="c.item" class="check"><strong>{{c.item}}</strong><div class="opts"><button v-for="e in estados" :key="e[0]" :class="{sel:c.estado===e[0]}" @click="c.estado=e[0]">{{e[1]}}</button></div><input v-model="c.notas" placeholder="Observación opcional"></div></div></article>
 <article class="panel"><div class="title"><div><span>04 · EVIDENCIA DE SALIDA</span><h2>Así se entrega</h2><p>Fotografías opcionales según el tipo de equipo.</p></div><button @click="guardarFotos" :disabled="guardando">Guardar fotos</button></div><div class="photos slots"><div v-for="n in requisitosSalida" :key="n" class="slot"><strong>{{n}}</strong><img v-if="salidaGuardada.find(e=>e.descripcion===n)?.url_imagen" :src="salidaGuardada.find(e=>e.descripcion===n).url_imagen"><img v-else-if="fotosSalida[n]?.preview" :src="fotosSalida[n].preview"><template v-if="!salidaGuardada.some(e=>e.descripcion===n)"><label>📷 Tomar foto<input type="file" accept="image/*" capture="environment" @change="foto($event,n)"></label><label>Elegir del carrete<input type="file" accept="image/*" @change="foto($event,n)"></label></template></div></div></article>
 <div class="release"><div><strong>Liberación del equipo</strong><p>Las pruebas y las fotos son recomendadas. Resuelve cualquier falla registrada antes de liberar el equipo.</p></div><button :disabled="!listo||guardando||liberando" @click="marcarListo">{{ checksCompletos ? "Marcar listo para entregar" : "Marcar listo con pruebas pendientes" }}</button></div>
</section></template>
<style scoped>
.qc-page {
  container: quality / inline-size;
  width: 100%;
  min-width: 0;
  max-width: 1320px;
  margin: auto;
  padding: 12px 0 24px;
  color: var(--ts-text, #102044);
}
header, .title, .release {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}
header { margin-bottom: 18px; }
header > div:first-child, .title > div, .release > div { flex: 1 1 220px; min-width: 0; }
header span, .title span {
  display: block;
  font-size: .7rem;
  font-weight: 800;
  letter-spacing: .06em;
  color: var(--ts-primary, #0b43ff);
}
h1 { font-size: clamp(1.5rem, 4cqi, 2.1rem); margin: 5px 0; }
header p, .title p, .release p { color: var(--ts-muted, #64748b); margin: 4px 0 0; }
.back { display: block; border: 0; background: transparent; padding: 0 0 10px; color: var(--ts-muted, #53627a); font-weight: 700; }
.state { background: var(--ts-primary-soft, #e8f0ff); color: var(--ts-primary, #0b43ff); border-radius: 999px; padding: 8px 13px; font-weight: 750; }
.summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 145px), 1fr)); gap: 10px; margin-bottom: 16px; }
.summary b { background: var(--ts-surface, white); border: 1px solid var(--ts-border, #e2e8f0); padding: 12px; border-radius: 12px; font-size: .8rem; }
.summary .ok { background: #ecfdf3; color: #15803d; border-color: #bbf7d0; }
.panel { min-width: 0; background: var(--ts-surface, #fff); border: 1px solid var(--ts-border, #e1e7ef); border-radius: 18px; padding: 20px; margin-bottom: 16px; }
.title { align-items: center; margin-bottom: 16px; }
.title h2 { margin: 4px 0; font-size: 1.25rem; }
.title button, .release button { min-height: 44px; border: 0; border-radius: 10px; background: var(--ts-primary, #0b43ff); color: white; padding: 11px 15px; font-size: .9rem; font-weight: 750; white-space: normal; }
.photos { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr)); align-items: start; gap: 12px; }
.photos figure, .slot { min-width: 0; margin: 0; border: 1px solid var(--ts-border, #e2e8f0); border-radius: 12px; overflow: hidden; background: var(--ts-surface-2, #f8fafc); }
.photos img { display: block; width: 100%; height: 180px; object-fit: contain; }
.photos figcaption { padding: 10px; font-size: .85rem; }
.slot { display: grid; gap: 10px; padding: 14px; }
.slot strong { font-size: .9rem; line-height: 1.4; }
.slot label { position: relative; display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; margin: 0; padding: 10px 12px; border: 1px solid var(--ts-border, #dbe3ee); border-radius: 9px; background: var(--ts-surface, white); color: var(--ts-primary, #0b43ff); font-size: .9rem; font-weight: 700; text-align: center; cursor: pointer; }
.slot label:hover { background: var(--ts-primary-soft, #e8f0ff); }
.slot label:focus-within { outline: 2px solid var(--ts-primary, #0b43ff); outline-offset: 2px; }
.slot label input { position: absolute; width: 1px; height: 1px; padding: 0; opacity: 0; overflow: hidden; }
.checks { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 270px), 1fr)); gap: 12px; }
.check { min-width: 0; border: 1px solid var(--ts-border, #e2e8f0); border-radius: 12px; padding: 12px; }
.check strong { display: block; margin-bottom: 10px; font-size: .9rem; }
.opts { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
.opts button { min-width: 0; min-height: 44px; border: 1px solid var(--ts-border, #dbe3ee); background: var(--ts-surface-2, #f8fafc); color: inherit; border-radius: 8px; padding: 8px 2px; font-size: .8rem; }
.opts button.sel { background: var(--ts-primary-soft, #dbeafe); border-color: var(--ts-primary, #60a5fa); color: var(--ts-primary, #1d4ed8); font-weight: 750; }
.check input { width: 100%; min-height: 44px; margin-top: 10px; border: 1px solid var(--ts-border, #e2e8f0); border-radius: 8px; background: var(--ts-surface, white); color: inherit; padding: 10px; font-size: 1rem; }
.release { align-items: center; background: #102044; color: #fff; border-radius: 16px; padding: 20px; }
.release p { color: #cbd5e1; }
.release button:disabled { opacity: .5; cursor: not-allowed; }
.missing-internal { border: 1px dashed #f59e0b; background: #fffbeb; color: #92400e; border-radius: 10px; padding: 12px; font-size: .85rem; }
@container quality (max-width: 620px) {
  header, .title, .release { flex-direction: column; align-items: stretch; gap: 12px; }
  header > div:first-child, .title > div, .release > div { flex-basis: auto; }
  .title button, .release button { width: 100%; }
  .panel { padding: 16px; }
  .photos { grid-template-columns: minmax(0, 1fr); }
  .state { align-self: flex-start; }
}
@container quality (max-width: 360px) {
  .summary { grid-template-columns: minmax(0, 1fr); }
  .opts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>