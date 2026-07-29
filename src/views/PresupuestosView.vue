<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../lib/supabase'
import { getBusinessSettings, mxn } from '../lib/business'
import { getRates } from '../lib/pricing'
import { guardarPresupuesto, cambiarEstadoPresupuesto, convertirPresupuestoAOrden, convertirPresupuestoAVenta } from '../services/flujo-operativo.service'

const router = useRouter()
const negocio = getBusinessSettings()
const presupuestos = ref([])
const rates = ref(getRates())
const buscar = ref('')
const mostrar = ref(false)
const editando = ref(null)
const procesando = ref(null)
const form = ref(nuevo())

function nuevo(){ return { cliente:'', telefono:'', equipo:'', vigencia:Number(negocio.validez_presupuesto||7), notas:'', estado:'Borrador', conceptos:[{descripcion:'',cantidad:1,precio:0,garantia:''}] } }
const total = computed(()=>form.value.conceptos.reduce((s,c)=>s+Number(c.cantidad||0)*Number(c.precio||0),0))
const filtrados = computed(()=>presupuestos.value.filter(p=>[p.folio,p.cliente,p.equipo,p.estado].join(' ').toLowerCase().includes(buscar.value.toLowerCase())))
function agregar(){ form.value.conceptos.push({descripcion:'',cantidad:1,precio:0,garantia:''}) }
function quitar(i){ if(form.value.conceptos.length>1) form.value.conceptos.splice(i,1) }
function abrir(p=null){ editando.value=p?.id||null; form.value=p?JSON.parse(JSON.stringify(p)):nuevo(); mostrar.value=true }
async function cargar(){ const {data,error}=await supabase.from('presupuestos').select('*').order('id',{ascending:false}); if(error) alert(error.message); presupuestos.value=data||[] }
async function guardar(){
  try { await guardarPresupuesto(form.value,editando.value); mostrar.value=false; await cargar() }
  catch(error){ alert(error.message) }
}
async function cambiar(p,estado){ try{ await cambiarEstadoPresupuesto(p,estado); await cargar() }catch(error){alert(error.message)} }
async function eliminar(p){ if(!confirm(`¿Eliminar ${p.folio}?`))return; const {error}=await supabase.from('presupuestos').delete().eq('id',p.id); if(error) alert(error.message); else cargar() }
async function aOrden(p){
  if(!confirm(`¿Convertir ${p.folio} en orden de reparación?`)) return
  procesando.value=p.id
  try{ const id=await convertirPresupuestoAOrden(p); await cargar(); router.push(`/ordenes/${id}`) }catch(error){alert(error.message)}finally{procesando.value=null}
}
async function aVenta(p){
  if(!confirm(`¿Convertir ${p.folio} en venta pendiente de cobro?`)) return
  procesando.value=p.id
  try{ await convertirPresupuestoAVenta(p); await cargar(); router.push('/ventas') }catch(error){alert(error.message)}finally{procesando.value=null}
}
function imprimir(p){
  const rows=p.conceptos.map(c=>`<tr><td>${c.descripcion}</td><td>${c.cantidad}</td><td>${mxn(c.precio)}</td><td>${mxn(c.cantidad*c.precio)}</td></tr>`).join('')
  const w=window.open('','_blank','width=900,height=700'); w.document.write(`<html><head><title>${p.folio}</title><style>body{font-family:Arial;padding:40px;color:#18202c}h1{margin:0}.head{display:flex;justify-content:space-between}.muted{color:#667085}table{width:100%;border-collapse:collapse;margin-top:30px}th,td{padding:12px;border-bottom:1px solid #ddd;text-align:left}.total{text-align:right;font-size:22px;margin-top:24px}.box{background:#f4f7fb;padding:16px;border-radius:10px;margin-top:24px}</style></head><body><div class="head"><div><h1>${negocio.nombre}</h1><div class="muted">${negocio.direccion}<br>${negocio.telefono}</div></div><div><b>Presupuesto ${p.folio}</b><br><span class="muted">${new Date(p.creado_en).toLocaleDateString('es-MX')}</span></div></div><div class="box"><b>Cliente:</b> ${p.cliente}<br><b>Equipo:</b> ${p.equipo}<br><b>Vigencia:</b> ${p.vigencia} días</div><table><thead><tr><th>Concepto</th><th>Cant.</th><th>Precio</th><th>Importe</th></tr></thead><tbody>${rows}</tbody></table><div class="total"><b>Total: ${mxn(p.total)}</b></div><div class="box"><b>Condiciones:</b> ${p.notas||'Precios sujetos a diagnóstico. La garantía aplica conforme al concepto indicado.'}</div></body></html>`); w.document.close(); setTimeout(()=>w.print(),250)
}
function usarTarifa(rate){ form.value.conceptos=[{descripcion:[rate.servicio,rate.marca,rate.modelo,rate.calidad].filter(Boolean).join(' '),cantidad:1,precio:Number(rate.precio_publico||0),garantia:''}]; form.value.equipo=[rate.marca,rate.modelo].filter(Boolean).join(' ') }
onMounted(async()=>{
  await cargar()
  try { const raw=localStorage.getItem('techsoul_budget_draft_v1'); if(!raw)return; form.value={...nuevo(),...JSON.parse(raw)}; mostrar.value=true; localStorage.removeItem('techsoul_budget_draft_v1') } catch(_){ localStorage.removeItem('techsoul_budget_draft_v1') }
})
</script>
<template><section class="ts-module-page"><header class="ts-module-header"><div><span class="ts-eyebrow">Flujo comercial conectado</span><h2>Presupuestos</h2><p>Crea una propuesta y conviértela en orden o venta sin capturar los datos otra vez.</p></div><button class="ts-action-primary" @click="abrir()">+ Nuevo presupuesto</button></header>
<div class="ts-panel"><div class="ts-panel-toolbar"><input v-model="buscar" class="ts-search-input" placeholder="Buscar por folio, cliente o equipo"><span>{{filtrados.length}} presupuestos</span></div><div class="budget-list"><article v-for="p in filtrados" :key="p.id" class="budget-card"><div><small>{{p.folio}} · {{new Date(p.creado_en).toLocaleDateString('es-MX')}}</small><h3>{{p.cliente}}</h3><p>{{p.equipo}}</p><span class="flow-link" v-if="p.orden_id">Orden #{{p.orden_id}}</span><span class="flow-link" v-if="p.venta_id">Venta #{{p.venta_id}}</span></div><strong>{{mxn(p.total)}}</strong><select v-model="p.estado" @change="cambiar(p,p.estado)"><option>Borrador</option><option>Enviado</option><option>Aprobado</option><option>Rechazado</option><option>Vencido</option><option>Convertido a orden</option><option>Convertido a venta</option></select><div class="budget-actions"><button @click="imprimir(p)">PDF</button><button @click="abrir(p)">Editar</button><button v-if="!p.orden_id&&!p.venta_id" class="primary-mini" :disabled="procesando===p.id" @click="aOrden(p)">Crear orden</button><button v-if="!p.orden_id&&!p.venta_id" class="primary-mini" :disabled="procesando===p.id" @click="aVenta(p)">Crear venta</button><button @click="eliminar(p)">Eliminar</button></div></article><p v-if="!filtrados.length" class="ts-empty-inline">Todavía no hay presupuestos.</p></div></div>
<div v-if="mostrar" class="modal-backdrop"><div class="budget-modal"><div class="modal-head"><h3>{{editando?'Editar':'Nuevo'}} presupuesto</h3><button @click="mostrar=false">×</button></div><div class="form-grid"><label><span>Cliente *</span><input v-model="form.cliente"></label><label><span>Teléfono</span><input v-model="form.telefono"></label><label><span>Equipo *</span><input v-model="form.equipo"></label><label><span>Vigencia (días)</span><input v-model.number="form.vigencia" type="number"></label></div><div v-if="rates.length" class="rate-row"><span>Usar tarifa:</span><button v-for="r in rates.slice(0,5)" :key="r.id" @click="usarTarifa(r)">{{r.marca}} {{r.modelo}} · {{mxn(r.precio_publico)}}</button></div><div class="concepts"><div v-for="(c,i) in form.conceptos" :key="i" class="concept-row"><input v-model="c.descripcion" placeholder="Concepto o servicio"><input v-model.number="c.cantidad" type="number" min="1"><input v-model.number="c.precio" type="number" min="0" placeholder="Precio"><input v-model="c.garantia" placeholder="Garantía opcional"><button @click="quitar(i)">×</button></div></div><button class="ts-action-secondary" @click="agregar">+ Agregar concepto</button><label class="notes"><span>Notas y condiciones</span><textarea v-model="form.notas" rows="3"></textarea></label><div class="modal-foot"><strong>Total: {{mxn(total)}}</strong><div><button class="ts-action-secondary" @click="mostrar=false">Cancelar</button><button class="ts-action-primary" @click="guardar">Guardar</button></div></div></div></div></section></template>
<style scoped>.budget-list{display:grid;gap:12px}.budget-card{display:grid;grid-template-columns:1fr auto auto minmax(260px,auto);gap:18px;align-items:center;padding:18px;border:1px solid #e8edf5;border-radius:14px}.budget-card h3{margin:4px 0}.budget-card p,.budget-card small{color:#667085}.budget-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.budget-actions button,.rate-row button{border:1px solid #dbe2ea;background:white;border-radius:8px;padding:8px}.budget-actions .primary-mini{background:#101828;color:white}.flow-link{font-size:12px;background:#ecfdf3;color:#027a48;padding:4px 7px;border-radius:99px;margin-right:5px}.modal-backdrop{position:fixed;inset:0;background:#10182899;display:grid;place-items:center;z-index:1000;padding:20px}.budget-modal{background:white;width:min(920px,100%);max-height:92vh;overflow:auto;border-radius:18px;padding:24px}.modal-head,.modal-foot{display:flex;justify-content:space-between;align-items:center}.modal-head button{font-size:28px;border:0;background:none}.form-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin:20px 0}.form-grid label,.notes{display:grid;gap:6px}.form-grid input,.notes textarea,.concept-row input{padding:11px;border:1px solid #d0d5dd;border-radius:9px}.concept-row{display:grid;grid-template-columns:2fr .5fr .8fr 1fr auto;gap:8px;margin:10px 0}.rate-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.notes{margin:18px 0}@media(max-width:900px){.budget-card{grid-template-columns:1fr}.budget-actions{justify-content:flex-start}}@media(max-width:760px){.form-grid{grid-template-columns:1fr}.concept-row{grid-template-columns:1fr 1fr}.concept-row input:first-child{grid-column:1/-1}}</style>
