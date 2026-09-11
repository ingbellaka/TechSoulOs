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
    <header class="corte-header">
      <div class="corte-title-block">
        <span class="ts-eyebrow">Finanzas</span>
        <h1>Corte de caja</h1>
        <p>Revisa lo cobrado, las salidas del día y valida el efectivo físico.</p>
      </div>
      <label class="date-picker-wrap">
        <span>Fecha del corte</span>
        <input v-model="fechaSeleccionada" class="corte-date" type="date" @change="cargar">
      </label>
    </header>

    <section class="summary-strip">
      <article class="summary-card summary-total">
        <span>Total cobrado</span>
        <strong>{{ moneda(resumen.totalCobrado) }}</strong>
        <small>{{ movimientos.length }} movimientos registrados</small>
      </article>
      <article class="summary-card">
        <span>Efectivo</span>
        <strong>{{ moneda(resumen.efectivoNeto) }}</strong>
        <small>Entradas {{ moneda(resumen.efectivoEntradas) }} · Salidas {{ moneda(resumen.efectivoSalidas) }}</small>
      </article>
      <article class="summary-card">
        <span>Transferencia</span>
        <strong>{{ moneda(resumen.transferenciaNeto) }}</strong>
        <small>Entradas {{ moneda(resumen.transferenciaEntradas) }} · Salidas {{ moneda(resumen.transferenciaSalidas) }}</small>
      </article>
      <article class="summary-card">
        <span>Tarjeta</span>
        <strong>{{ moneda(resumen.tarjetaEntradas) }}</strong>
        <small>Neto estimado {{ moneda(resumen.tarjetaNeto) }}</small>
      </article>
    </section>

    <section class="ts-panel movements-panel">
      <div class="panel-title-row">
        <div>
          <span class="section-kicker">Movimientos</span>
          <h2>Actividad del día</h2>
        </div>
        <span class="movement-count">{{ movimientos.length }} movimientos</span>
      </div>

      <div v-if="cargando" class="empty-state">
        <span class="ts-spinner"></span>
        <p>Cargando movimientos…</p>
      </div>
      <div v-else-if="!movimientos.length" class="empty-state">
        <div class="empty-icon">↕</div>
        <strong>No hay movimientos registrados</strong>
        <p>Cuando registres ingresos o salidas en esta fecha aparecerán aquí.</p>
      </div>
      <div v-else class="movement-list">
        <article v-for="m in movimientos" :key="m.id" class="movement-row">
          <div class="movement-time">{{ fechaHora(m.fecha_movimiento) }}</div>
          <div class="movement-copy">
            <span class="movement-type">{{ m.referencia_tipo === 'orden' ? 'SERVICIO / ANTICIPO' : m.tipo === 'Salida' ? 'SALIDA' : 'MOVIMIENTO' }}</span>
            <strong>{{ m.concepto }}</strong>
            <small>{{ normalizarMetodo(m.metodo_pago) }}{{ m.notas ? ` · ${m.notas}` : '' }}</small>
          </div>
          <strong class="movement-amount" :class="m.tipo==='Entrada'?'positive':'negative'">{{ m.tipo==='Entrada'?'+':'−' }}{{ moneda(m.monto) }}</strong>
        </article>
      </div>
    </section>

    <section class="finance-grid">
      <article class="finance-detail-card cash-card">
        <div class="finance-icon">$</div>
        <div class="finance-copy">
          <span>Efectivo esperado</span>
          <strong>{{ moneda(resumen.efectivoNeto) }}</strong>
          <small>{{ moneda(resumen.efectivoEntradas) }} entradas · {{ moneda(resumen.efectivoSalidas) }} salidas</small>
        </div>
      </article>

      <article class="finance-detail-card transfer-card">
        <div class="finance-icon">↗</div>
        <div class="finance-copy">
          <span>Transferencias</span>
          <strong>{{ moneda(resumen.transferenciaNeto) }}</strong>
          <small>{{ moneda(resumen.transferenciaEntradas) }} entradas · {{ moneda(resumen.transferenciaSalidas) }} salidas</small>
        </div>
      </article>

      <article class="finance-detail-card card-card">
        <div class="finance-icon">▣</div>
        <div class="finance-copy">
          <span>Tarjeta</span>
          <strong>{{ moneda(resumen.tarjetaEntradas) }}</strong>
          <small>Neto estimado {{ moneda(resumen.tarjetaNeto) }}</small>
          <label class="commission-field">
            <span>Comisión estimada</span>
            <div><input v-model.number="comisionTarjetaPct" type="number" min="0" step="0.01"><b>%</b></div>
          </label>
        </div>
      </article>
    </section>

    <section class="cash-validation ts-panel">
      <div class="validation-header">
        <div>
          <span class="section-kicker">Validación</span>
          <h2>¿Empata el efectivo?</h2>
          <p>Según los movimientos de hoy deberían existir <strong>{{ moneda(resumen.efectivoNeto) }}</strong> en efectivo.</p>
        </div>
        <div class="validation-status" :class="estadoEmpate">
          <span>Estado</span>
          <strong v-if="estadoEmpate==='ok'">✓ Empata</strong>
          <strong v-else-if="estadoEmpate==='faltante'">Faltante</strong>
          <strong v-else-if="estadoEmpate==='sobrante'">Sobrante</strong>
          <strong v-else>Pendiente</strong>
        </div>
      </div>

      <div class="validation-grid">
        <label class="counted-card">
          <span>Efectivo contado</span>
          <div class="money-input">
            <b>$</b>
            <input v-model.number="efectivoContado" type="number" min="0" step="0.01" placeholder="0.00">
          </div>
          <small>Cuenta físicamente el efectivo disponible en caja.</small>
        </label>

        <div class="match-result" :class="estadoEmpate">
          <span>Diferencia</span>
          <strong v-if="diferencia!==null">{{ moneda(diferencia) }}</strong>
          <strong v-else>—</strong>
          <small v-if="estadoEmpate==='ok'">✓ El efectivo coincide con lo esperado.</small>
          <small v-else-if="estadoEmpate==='faltante'">Hay menos efectivo del esperado.</small>
          <small v-else-if="estadoEmpate==='sobrante'">Hay más efectivo del esperado.</small>
          <small v-else>Captura el efectivo contado para comparar.</small>
        </div>
      </div>

      <label class="notes-field">
        <span>Observaciones del corte</span>
        <textarea v-model="observaciones" rows="3" placeholder="Ej. revisar salida de mensajería, faltante pendiente por aclarar…"></textarea>
      </label>

      <div class="close-row">
        <span v-if="corteGuardado" class="saved-pill">✓ Corte guardado anteriormente</span>
        <button class="ts-action-primary close-button" :disabled="guardando" @click="cerrarCorte">
          {{ guardando?'Guardando…':corteGuardado?'Actualizar corte':'Cerrar corte del día' }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.corte-page{--page-text:#0f172a;--page-muted:#64748b;--page-border:#dbe3ee;--page-blue:#0b43ff;--page-bg:#f4f7fb;color:var(--page-text);padding-bottom:32px}.corte-header{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;margin-bottom:20px}.corte-title-block h1{font-size:clamp(2rem,2.3vw,2.6rem);line-height:1.05;margin:5px 0 8px;letter-spacing:-.035em}.corte-title-block p{margin:0;color:var(--page-muted);font-size:1rem}.date-picker-wrap{display:flex;flex-direction:column;gap:6px;min-width:210px}.date-picker-wrap>span{font-size:.72rem;font-weight:800;color:var(--page-muted);text-transform:uppercase;letter-spacing:.06em}.corte-date{width:100%;border:1px solid var(--page-border);border-radius:12px;padding:12px 14px;background:#fff;color:var(--page-text);font-size:.95rem;box-shadow:0 4px 16px rgba(15,23,42,.04)}
.summary-strip{display:grid;grid-template-columns:1.15fr repeat(3,1fr);gap:14px;margin-bottom:18px}.summary-card{background:#fff;border:1px solid var(--page-border);border-radius:16px;padding:18px 20px;display:flex;flex-direction:column;gap:5px;min-width:0;box-shadow:0 5px 18px rgba(15,23,42,.04)}.summary-card>span{font-size:.78rem;font-weight:800;color:var(--page-muted);text-transform:uppercase;letter-spacing:.04em}.summary-card>strong{font-size:1.8rem;letter-spacing:-.03em}.summary-card>small{color:var(--page-muted);font-size:.78rem;line-height:1.4}.summary-total{background:linear-gradient(135deg,#eff6ff,#fff);border-color:#cfe0ff}.summary-total>strong{font-size:2rem;color:#0b2f86}
.ts-panel{background:#fff;border:1px solid var(--page-border);border-radius:18px;box-shadow:0 5px 18px rgba(15,23,42,.04)}.movements-panel{padding:0 20px 8px;margin-bottom:18px}.panel-title-row{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:18px 0 14px;border-bottom:1px solid #edf1f6}.section-kicker{display:block;font-size:.7rem;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:var(--page-blue);margin-bottom:4px}.panel-title-row h2,.validation-header h2{font-size:1.3rem;margin:0;letter-spacing:-.02em}.movement-count{font-size:.78rem;font-weight:800;background:#f1f5f9;border-radius:999px;padding:7px 10px;color:#334155}.empty-state{text-align:center;padding:42px 20px;color:var(--page-muted)}.empty-state strong{display:block;color:#334155;font-size:1rem;margin-bottom:5px}.empty-state p{margin:0;font-size:.85rem}.empty-icon{width:42px;height:42px;border-radius:12px;background:#eef4ff;color:#2463eb;display:grid;place-items:center;margin:0 auto 12px;font-size:1.3rem}.movement-list{display:grid}.movement-row{display:grid;grid-template-columns:82px minmax(0,1fr) auto;gap:16px;align-items:center;padding:15px 0;border-bottom:1px solid #edf1f6}.movement-row:last-child{border-bottom:0}.movement-time{color:var(--page-muted);font-size:.8rem;font-weight:700}.movement-copy{display:flex;flex-direction:column;min-width:0}.movement-type{font-size:.64rem;font-weight:900;color:#2563eb;letter-spacing:.04em}.movement-copy>strong{font-size:.92rem;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.movement-copy small{color:var(--page-muted);margin-top:3px;font-size:.78rem}.movement-amount{font-size:.95rem;white-space:nowrap}.positive{color:#15803d}.negative{color:#be123c}
.finance-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-bottom:18px}.finance-detail-card{border:1px solid var(--page-border);border-radius:16px;padding:18px;background:#fff;display:flex;gap:14px;align-items:flex-start;box-shadow:0 5px 18px rgba(15,23,42,.04)}.finance-icon{width:42px;height:42px;border-radius:12px;background:#eff6ff;color:#2563eb;display:grid;place-items:center;font-weight:900;font-size:1rem;flex:0 0 auto}.finance-copy{display:flex;flex-direction:column;min-width:0;flex:1}.finance-copy>span{font-size:.78rem;font-weight:800;color:var(--page-muted)}.finance-copy>strong{font-size:1.55rem;margin:3px 0 4px;letter-spacing:-.025em}.finance-copy>small{font-size:.76rem;color:var(--page-muted);line-height:1.4}.commission-field{margin-top:12px;padding-top:10px;border-top:1px solid #edf1f6;display:flex;justify-content:space-between;align-items:center;gap:10px}.commission-field>span{font-size:.72rem;color:var(--page-muted)}.commission-field>div{display:flex;align-items:center;gap:5px}.commission-field input{width:68px;border:1px solid var(--page-border);border-radius:9px;padding:7px 8px;background:#fff;font-weight:700}.commission-field b{font-size:.75rem;color:var(--page-muted)}
.cash-validation{padding:22px}.validation-header{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;margin-bottom:20px}.validation-header p{margin:7px 0 0;color:var(--page-muted);font-size:.92rem;line-height:1.45}.validation-status{min-width:128px;border-radius:13px;padding:11px 13px;background:#f8fafc;display:flex;flex-direction:column;gap:2px}.validation-status span{font-size:.65rem;text-transform:uppercase;font-weight:850;letter-spacing:.06em;color:var(--page-muted)}.validation-status strong{font-size:.92rem}.validation-status.ok{background:#ecfdf5;color:#15803d}.validation-status.faltante{background:#fff1f2;color:#be123c}.validation-status.sobrante{background:#fffbeb;color:#a16207}.validation-grid{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(260px,.8fr);gap:16px;margin-bottom:18px}.counted-card,.match-result{border:1px solid var(--page-border);border-radius:16px;padding:18px;background:#fff}.counted-card>span,.notes-field>span{display:block;font-size:.78rem;font-weight:800;margin-bottom:8px;color:#334155}.counted-card>small{display:block;color:var(--page-muted);font-size:.75rem;margin-top:8px}.money-input{display:flex;align-items:center;border:1.5px solid #cbd5e1;border-radius:12px;padding:10px 13px;background:#fff;transition:.2s}.money-input:focus-within{border-color:var(--page-blue);box-shadow:0 0 0 3px rgba(11,67,255,.08)}.money-input b{font-size:1.2rem;color:#475569}.money-input input{border:0;outline:0;background:transparent;width:100%;font-size:1.55rem;font-weight:900;color:var(--page-text);min-width:0}.match-result{display:flex;flex-direction:column;justify-content:center;background:#f8fafc}.match-result>span{font-size:.7rem;color:var(--page-muted);font-weight:750;text-transform:uppercase;letter-spacing:.05em}.match-result strong{font-size:1.65rem;margin:5px 0 4px;letter-spacing:-.03em}.match-result small{font-size:.78rem;line-height:1.4}.match-result.ok{background:#ecfdf5;border-color:#bbf7d0;color:#15803d}.match-result.faltante{background:#fff1f2;border-color:#fecdd3;color:#be123c}.match-result.sobrante{background:#fffbeb;border-color:#fde68a;color:#a16207}.notes-field{display:block}.notes-field textarea{width:100%;box-sizing:border-box;border:1px solid var(--page-border);border-radius:12px;padding:12px 14px;background:#fff;color:var(--page-text);font:inherit;resize:vertical;min-height:92px}.notes-field textarea:focus{outline:0;border-color:var(--page-blue);box-shadow:0 0 0 3px rgba(11,67,255,.08)}.close-row{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-top:18px}.saved-pill{font-size:.78rem;font-weight:750;color:#15803d}.close-button{min-height:44px;padding:0 18px}
@media(max-width:1100px){.summary-strip{grid-template-columns:repeat(2,minmax(0,1fr))}.finance-grid{grid-template-columns:1fr 1fr}.finance-detail-card:last-child{grid-column:1/-1}}
@media(max-width:760px){.corte-page{padding:2px 0 88px}.corte-header{align-items:stretch;flex-direction:column;gap:16px;margin-bottom:16px}.corte-title-block h1{font-size:2rem}.corte-title-block p{font-size:.9rem}.date-picker-wrap{min-width:0;width:100%}.corte-date{min-height:46px;font-size:1rem}.summary-strip{grid-template-columns:1fr 1fr;gap:10px}.summary-card{padding:15px}.summary-card>strong{font-size:1.55rem}.summary-total{grid-column:1/-1}.summary-total>strong{font-size:1.8rem}.movements-panel{padding:0 14px 4px;border-radius:15px}.panel-title-row{padding:15px 0 12px}.panel-title-row h2,.validation-header h2{font-size:1.2rem}.movement-count{font-size:.7rem}.movement-row{grid-template-columns:58px minmax(0,1fr);gap:10px;padding:14px 0}.movement-time{font-size:.72rem}.movement-copy>strong{white-space:normal}.movement-amount{grid-column:2;font-size:1rem;margin-top:-4px}.finance-grid{grid-template-columns:1fr;gap:10px}.finance-detail-card:last-child{grid-column:auto}.cash-validation{padding:16px;border-radius:15px}.validation-header{flex-direction:column;gap:12px}.validation-status{width:100%;box-sizing:border-box;min-width:0}.validation-grid{grid-template-columns:1fr;gap:10px}.counted-card,.match-result{padding:15px}.money-input input{font-size:1.35rem}.close-row{flex-direction:column;align-items:stretch}.saved-pill{text-align:center}.close-button{width:100%;min-height:48px}.notes-field textarea{min-height:110px}}
@media(max-width:420px){.summary-strip{grid-template-columns:1fr}.summary-total{grid-column:auto}.summary-card>small{font-size:.73rem}.panel-title-row{align-items:flex-start}.movement-count{white-space:nowrap}.finance-detail-card{padding:15px}.finance-copy>strong{font-size:1.4rem}}
</style>
