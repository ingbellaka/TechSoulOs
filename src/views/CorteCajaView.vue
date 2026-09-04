<script setup>
import { computed, onMounted, ref } from 'vue'
import { supabase } from '../lib/supabase'

const fechaSeleccionada = ref(new Date().toISOString().slice(0,10))
const movimientos = ref([])
const cargando = ref(false)
const guardando = ref(false)
const efectivoContado = ref(null)
const observaciones = ref('')
const comisionTarjetaPct = ref(4.06)
const corteGuardado = ref(null)

function rangoDia(fecha) {
  const inicio = new Date(`${fecha}T00:00:00`)
  const fin = new Date(inicio); fin.setDate(fin.getDate()+1)
  return [inicio.toISOString(), fin.toISOString()]
}
function moneda(v){return Number(v||0).toLocaleString('es-MX',{style:'currency',currency:'MXN'})}
function fechaHora(v){return v?new Date(v).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'}):''}
function normalizarMetodo(m){const x=String(m||'').toLowerCase(); if(x.includes('efect')) return 'Efectivo'; if(x.includes('transf')) return 'Transferencia'; if(x.includes('tarjeta')||x.includes('mercado pago')||x.includes('clip')) return 'Tarjeta'; return 'Otro'}
function suma(metodo,tipo){return movimientos.value.filter(m=>normalizarMetodo(m.metodo_pago)===metodo&&m.tipo===tipo).reduce((s,m)=>s+Number(m.monto||0),0)}

const resumen = computed(()=>{
  const efectivoEntradas=suma('Efectivo','Entrada'), efectivoSalidas=suma('Efectivo','Salida')
  const transferenciaEntradas=suma('Transferencia','Entrada'), transferenciaSalidas=suma('Transferencia','Salida')
  const tarjetaEntradas=suma('Tarjeta','Entrada'), tarjetaSalidas=suma('Tarjeta','Salida')
  const comision=tarjetaEntradas*(Number(comisionTarjetaPct.value||0)/100)
  return {
    efectivoEntradas, efectivoSalidas, efectivoNeto:efectivoEntradas-efectivoSalidas,
    transferenciaEntradas, transferenciaSalidas, transferenciaNeto:transferenciaEntradas-transferenciaSalidas,
    tarjetaEntradas, tarjetaSalidas, comision, tarjetaNeto:tarjetaEntradas-tarjetaSalidas-comision,
    totalCobrado:efectivoEntradas+transferenciaEntradas+tarjetaEntradas
  }
})
const diferencia = computed(()=> efectivoContado.value===null||efectivoContado.value==='' ? null : Number(efectivoContado.value)-resumen.value.efectivoNeto)
const estadoEmpate = computed(()=>{if(diferencia.value===null)return 'pendiente'; if(Math.abs(diferencia.value)<0.01)return 'ok'; return diferencia.value>0?'sobrante':'faltante'})

async function cargar(){
  cargando.value=true
  const [desde,hasta]=rangoDia(fechaSeleccionada.value)
  const [movRes,corteRes]=await Promise.all([
    supabase.from('movimientos_caja').select('*').gte('fecha_movimiento',desde).lt('fecha_movimiento',hasta).order('fecha_movimiento',{ascending:true}),
    supabase.from('cortes_caja').select('*').eq('fecha',fechaSeleccionada.value).maybeSingle()
  ])
  if(movRes.error) alert(movRes.error.message)
  if(corteRes.error) console.warn(corteRes.error.message)
  movimientos.value=movRes.data||[]
  corteGuardado.value=corteRes.data||null
  if(corteGuardado.value){efectivoContado.value=Number(corteGuardado.value.efectivo_contado);observaciones.value=corteGuardado.value.observaciones||''}
  else {efectivoContado.value=null;observaciones.value=''}
  cargando.value=false
}

async function cerrarCorte(){
  if(efectivoContado.value===null||efectivoContado.value==='') return alert('Captura cuánto efectivo contaste antes de cerrar el corte.')
  guardando.value=true
  const {data:auth}=await supabase.auth.getUser()
  const r=resumen.value
  const payload={
    fecha:fechaSeleccionada.value,
    efectivo_entradas:r.efectivoEntradas, efectivo_salidas:r.efectivoSalidas, efectivo_esperado:r.efectivoNeto,
    efectivo_contado:Number(efectivoContado.value), diferencia:Number(diferencia.value||0),
    transferencia_entradas:r.transferenciaEntradas, transferencia_salidas:r.transferenciaSalidas,
    tarjeta_entradas:r.tarjetaEntradas, tarjeta_salidas:r.tarjetaSalidas, tarjeta_comision_estimada:r.comision,
    total_cobrado:r.totalCobrado, observaciones:observaciones.value.trim(),
    detalle:{comision_tarjeta_pct:Number(comisionTarjetaPct.value||0),movimientos:movimientos.value.map(m=>({id:m.id,tipo:m.tipo,concepto:m.concepto,monto:m.monto,metodo_pago:m.metodo_pago,fecha_movimiento:m.fecha_movimiento}))},
    cerrado_por:auth.user?.id||null,cerrado_en:new Date().toISOString()
  }
  const {error}=await supabase.from('cortes_caja').upsert(payload,{onConflict:'fecha'})
  guardando.value=false
  if(error) return alert(error.message)
  await cargar(); alert('Corte de caja guardado correctamente.')
}

onMounted(cargar)
</script>

<template>
  <div class="ts-module-page corte-page">
    <header class="ts-module-header"><div><span class="ts-eyebrow">Finanzas</span><h2>Corte de Caja</h2><p>Revisa lo cobrado, las salidas del día y valida el efectivo físico.</p></div><input v-model="fechaSeleccionada" class="corte-date" type="date" @change="cargar"></header>

    <section class="ts-panel">
      <div class="ts-panel-heading"><div><span class="ts-panel-kicker">CORTE DE CAJA</span><h3>Movimientos del día</h3></div><strong>{{ movimientos.length }} movimientos</strong></div>
      <div v-if="cargando" class="ts-empty-state"><span class="ts-spinner"></span><p>Cargando movimientos…</p></div>
      <div v-else-if="!movimientos.length" class="corte-empty">No hay movimientos registrados en esta fecha.</div>
      <div v-else class="movement-list">
        <article v-for="m in movimientos" :key="m.id" class="movement-row"><span class="movement-time">{{ fechaHora(m.fecha_movimiento) }}</span><div><span class="movement-type">{{ m.referencia_tipo === 'orden' ? 'SERVICIO / ANTICIPO' : m.tipo === 'Salida' ? 'SALIDA' : 'MOVIMIENTO' }}</span><strong>{{ m.concepto }}</strong><small>{{ normalizarMetodo(m.metodo_pago) }}{{ m.notas ? ` · ${m.notas}` : '' }}</small></div><strong :class="m.tipo==='Entrada'?'positive':'negative'">{{ m.tipo==='Entrada'?'+':'−' }}{{ moneda(m.monto) }}</strong></article>
      </div>
    </section>

    <section class="finance-section">
      <div class="finance-heading"><span>FINANZAS HOY</span><strong>Total cobrado: {{ moneda(resumen.totalCobrado) }}</strong></div>
      <div class="finance-cards">
        <article class="finance-card"><span>💵 EFECTIVO</span><strong>{{ moneda(resumen.efectivoNeto) }}</strong><small>Entradas {{ moneda(resumen.efectivoEntradas) }} · Salidas {{ moneda(resumen.efectivoSalidas) }}</small></article>
        <article class="finance-card"><span>🏦 TRANSFERENCIA</span><strong>{{ moneda(resumen.transferenciaNeto) }}</strong><small>Entradas {{ moneda(resumen.transferenciaEntradas) }} · Salidas {{ moneda(resumen.transferenciaSalidas) }}</small></article>
        <article class="finance-card"><span>💳 TARJETA</span><strong>{{ moneda(resumen.tarjetaEntradas) }}</strong><small>Cobrado bruto · Neto estimado {{ moneda(resumen.tarjetaNeto) }}</small><label>Comisión estimada <input v-model.number="comisionTarjetaPct" type="number" min="0" step="0.01"> %</label></article>
      </div>
    </section>

    <section class="cash-check ts-panel">
      <div><span class="ts-panel-kicker">VALIDACIÓN</span><h3>¿Empata el efectivo?</h3><p>Según los movimientos de hoy deberían existir <strong>{{ moneda(resumen.efectivoNeto) }}</strong> en efectivo.</p></div>
      <div class="cash-check-grid"><label><span>Efectivo contado</span><div class="money-input"><b>$</b><input v-model.number="efectivoContado" type="number" min="0" step="0.01" placeholder="0.00"></div></label><div class="match-result" :class="estadoEmpate"><span>Diferencia</span><strong v-if="diferencia!==null">{{ moneda(diferencia) }}</strong><strong v-else>—</strong><small v-if="estadoEmpate==='ok'">✓ El efectivo empata</small><small v-else-if="estadoEmpate==='faltante'">Faltante en caja</small><small v-else-if="estadoEmpate==='sobrante'">Sobrante en caja</small><small v-else>Cuenta el efectivo para validar</small></div></div>
      <label class="notes-field"><span>Observaciones del corte</span><textarea v-model="observaciones" rows="3" placeholder="Ej. revisar salida de mensajería, faltante pendiente por aclarar…"></textarea></label>
      <div class="close-row"><span v-if="corteGuardado" class="saved-pill">✓ Corte guardado anteriormente</span><button class="ts-action-primary" :disabled="guardando" @click="cerrarCorte">{{ guardando?'Guardando…':corteGuardado?'Actualizar corte':'Cerrar corte del día' }}</button></div>
    </section>
  </div>
</template>

<style scoped>
.corte-date{border:1px solid var(--ts-border,#dbe3ee);border-radius:10px;padding:10px 12px;background:var(--ts-surface,#fff)}.movement-list{display:grid}.movement-row{display:grid;grid-template-columns:70px 1fr auto;gap:14px;align-items:center;padding:13px 0;border-bottom:1px solid var(--ts-border,#e2e8f0)}.movement-row:last-child{border-bottom:0}.movement-time{color:var(--ts-muted,#64748b);font-size:.78rem}.movement-row>div{display:flex;flex-direction:column}.movement-type{font-size:.62rem;font-weight:850;color:#2563eb}.movement-row small{color:var(--ts-muted,#64748b);margin-top:3px}.positive{color:#15803d}.negative{color:#be123c}.corte-empty{text-align:center;padding:30px;color:var(--ts-muted,#64748b)}.finance-section{margin:18px 0}.finance-heading{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.finance-heading span{font-size:.72rem;font-weight:900;letter-spacing:.08em;color:var(--ts-muted,#64748b)}.finance-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.finance-card{border:1px solid var(--ts-border,#dbe3ee);border-radius:16px;padding:18px;background:var(--ts-surface,#fff);display:flex;flex-direction:column}.finance-card>span{font-size:.72rem;font-weight:850;color:var(--ts-muted,#64748b)}.finance-card>strong{font-size:1.45rem;margin:9px 0 5px}.finance-card>small{color:var(--ts-muted,#64748b)}.finance-card label{margin-top:10px;font-size:.68rem;color:var(--ts-muted,#64748b)}.finance-card label input{width:70px;border:1px solid var(--ts-border,#dbe3ee);border-radius:8px;padding:5px 7px}.cash-check-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:18px 0}.cash-check-grid label>span,.notes-field>span{display:block;font-size:.76rem;font-weight:800;margin-bottom:7px;color:var(--ts-muted,#64748b)}.money-input{display:flex;align-items:center;border:1px solid var(--ts-border,#dbe3ee);border-radius:12px;padding:10px 12px}.money-input input{border:0;outline:0;background:transparent;width:100%;font-size:1.3rem;font-weight:850}.match-result{border-radius:14px;padding:14px;background:#f8fafc;display:flex;flex-direction:column}.match-result>span{font-size:.7rem;color:var(--ts-muted,#64748b)}.match-result strong{font-size:1.25rem;margin:4px 0}.match-result.ok{background:#ecfdf5;color:#15803d}.match-result.faltante{background:#fff1f2;color:#be123c}.match-result.sobrante{background:#fffbeb;color:#a16207}.notes-field textarea{width:100%;border:1px solid var(--ts-border,#dbe3ee);border-radius:12px;padding:10px 12px;background:var(--ts-surface,#fff);color:var(--ts-text,#0f172a)}.close-row{display:flex;justify-content:space-between;align-items:center;margin-top:14px}.saved-pill{font-size:.75rem;font-weight:750;color:#15803d}@media(max-width:760px){.finance-cards,.cash-check-grid{grid-template-columns:1fr}.movement-row{grid-template-columns:55px 1fr}.movement-row>strong{grid-column:2;text-align:right}.finance-heading{align-items:flex-start;flex-direction:column;gap:4px}}
</style>
