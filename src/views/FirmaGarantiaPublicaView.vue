<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { supabase } from '../lib/supabase'

const route = useRoute()
const solicitud = ref(null)
const cargando = ref(true)
const error = ref('')
const enviando = ref(false)
const firmado = ref(false)
const acepto = ref(false)
const nombre = ref('')
const correo = ref('')
const telefono = ref('')
const canvas = ref(null)
let ctx = null
let dibujando = false
let tieneFirma = false

const condiciones = computed(() => String(solicitud.value?.condiciones || 'La garantía aplica únicamente al servicio o pieza reemplazada. No cubre golpes, caídas, humedad, mal uso, modificaciones, daños ajenos al servicio realizado ni intervención de terceros.').split(/\n+/).filter(Boolean))

function fecha(v) { return v ? new Date(v).toLocaleDateString('es-MX', { day:'numeric', month:'long', year:'numeric' }) : '—' }
function fechaHora(v) { return v ? new Date(v).toLocaleString('es-MX', { dateStyle:'medium', timeStyle:'short' }) : '—' }
function vence(s) { const d = new Date(s.fecha_emision); d.setDate(d.getDate() + Number(s.dias_garantia || 0)); return d }

async function cargar() {
  cargando.value = true
  const { data, error: e } = await supabase.rpc('obtener_garantia_para_firma', { p_token: route.params.token }).maybeSingle()
  if (e || !data) error.value = 'Este enlace no existe, venció o ya no está disponible.'
  else {
    solicitud.value = data
    nombre.value = data.cliente_nombre || ''
    telefono.value = data.cliente_telefono || ''
    firmado.value = Boolean(data.firmado_en)
    if (!firmado.value) await nextTick(), prepararCanvas()
  }
  cargando.value = false
}

function prepararCanvas() {
  const c = canvas.value
  if (!c) return
  const rect = c.getBoundingClientRect(); const ratio = window.devicePixelRatio || 1
  c.width = Math.max(1, rect.width * ratio); c.height = Math.max(1, rect.height * ratio)
  ctx = c.getContext('2d'); ctx.scale(ratio, ratio); ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0b1739'
}
function punto(e) { const r = canvas.value.getBoundingClientRect(); const p = e.touches?.[0] || e; return { x:p.clientX-r.left, y:p.clientY-r.top } }
function iniciar(e) { e.preventDefault(); dibujando=true; const p=punto(e); ctx.beginPath(); ctx.moveTo(p.x,p.y) }
function mover(e) { if(!dibujando) return; e.preventDefault(); const p=punto(e); ctx.lineTo(p.x,p.y); ctx.stroke(); tieneFirma=true }
function terminar(){ dibujando=false }
function limpiar(){ if(!ctx||!canvas.value)return; ctx.clearRect(0,0,canvas.value.width,canvas.value.height); tieneFirma=false }

async function firmar() {
  if (!nombre.value.trim()) return alert('Escribe tu nombre completo.')
  if (!tieneFirma) return alert('Firma dentro del recuadro para continuar.')
  if (!acepto.value) return alert('Debes aceptar las condiciones de garantía.')
  enviando.value = true
  const firma = canvas.value.toDataURL('image/png')
  const { error:e } = await supabase.rpc('firmar_garantia_remota', {
    p_token: route.params.token, p_nombre: nombre.value.trim(),
    p_correo: correo.value.trim() || null, p_telefono: telefono.value.trim() || null,
    p_firma_data_url: firma
  })
  enviando.value=false
  if(e) return alert(`No se pudo registrar la firma: ${e.message}`)
  firmado.value=true; solicitud.value.firmado_en=new Date().toISOString(); solicitud.value.firmante_nombre=nombre.value.trim()
  window.scrollTo({top:0,behavior:'smooth'})
}

onMounted(() => { cargar(); window.addEventListener('resize', prepararCanvas) })
onBeforeUnmount(() => window.removeEventListener('resize', prepararCanvas))
</script>

<template>
<div class="public-warranty">
  <header class="brand-hero"><div class="brand-mark"><span class="phone-mark"></span><b>Tech<span>Soul</span></b></div><small>REPARA · CONECTA · SIGUE</small></header>
  <main class="warranty-shell">
    <div v-if="cargando" class="state-card">Cargando garantía…</div>
    <div v-else-if="error" class="state-card"><div class="big-icon">!</div><h1>Enlace no disponible</h1><p>{{ error }}</p></div>
    <template v-else-if="firmado">
      <section class="success-card"><div class="success-check">✓</div><h1>¡Gracias!</h1><p>Tu garantía ha sido firmada correctamente.</p><div class="summary"><div><small>Folio de garantía</small><strong>{{ solicitud.folio_garantia }}</strong></div><div><small>Fecha y hora de firma</small><strong>{{ fechaHora(solicitud.firmado_en) }}</strong></div><div><small>Firmado por</small><strong>{{ solicitud.firmante_nombre || nombre }}</strong></div></div></section>
      <section class="trust-card"><span>💙</span><p>Gracias por confiar en</p><div class="mini-brand">Tech<span>Soul</span></div><small>Tu tecnología, en buenas manos.</small></section>
    </template>
    <template v-else>
      <section class="intro-card"><div class="shield">✓</div><h1>Garantía de servicio</h1><p>Revisa la información y firma para confirmar la garantía de tu reparación.</p></section>
      <section class="info-grid"><article><small>Folio de garantía</small><strong>{{ solicitud.folio_garantia }}</strong></article><article><small>Fecha de emisión</small><strong>{{ fecha(solicitud.fecha_emision) }}</strong></article></section>
      <section class="detail-card"><div class="detail-icon">📱</div><div><small>Equipo</small><strong>{{ solicitud.equipo || 'Equipo' }}</strong><span v-if="solicitud.serie">Serie: {{ solicitud.serie }}</span></div></section>
      <section class="detail-card"><div class="detail-icon">🛠️</div><div><small>Servicio realizado</small><strong>{{ solicitud.servicio }}</strong><span class="done">Completado</span></div></section>
      <section class="detail-card"><div class="detail-icon">🛡️</div><div><small>Vigencia de garantía</small><strong>{{ solicitud.dias_garantia }} días</strong><span>Del {{ fecha(solicitud.fecha_emision) }} al {{ fecha(vence(solicitud)) }}.</span></div></section>
      <section class="terms-card"><h2>📄 Condiciones de garantía</h2><ol><li v-for="(c,i) in condiciones" :key="i">{{ c }}</li></ol><div class="notice">ⓘ Al firmar, confirmas que has leído y aceptas las condiciones de garantía de TechSoul.</div></section>
      <section class="signature-card"><h2>✍️ Firma del cliente</h2><p>Por favor, firma en el recuadro con tu dedo.</p><canvas ref="canvas" @mousedown="iniciar" @mousemove="mover" @mouseup="terminar" @mouseleave="terminar" @touchstart="iniciar" @touchmove="mover" @touchend="terminar"></canvas><button class="clear" @click="limpiar">↻ Limpiar firma</button>
        <label>Nombre completo<input v-model="nombre" autocomplete="name"></label>
        <label>Correo <em>(opcional)</em><input v-model="correo" type="email" autocomplete="email"></label>
        <label>Teléfono <em>(opcional)</em><input v-model="telefono" type="tel" autocomplete="tel"></label>
        <label class="accept"><input v-model="acepto" type="checkbox"><span>He leído y acepto las <b>condiciones de garantía</b> de TechSoul.</span></label>
        <button class="sign-button" :disabled="enviando" @click="firmar">✓ {{ enviando ? 'Registrando…' : 'Aceptar y firmar garantía' }}</button><small class="secure">🔒 Tu firma será registrada de forma segura.</small>
      </section>
    </template>
  </main>
</div>
</template>

<style scoped>
*{box-sizing:border-box}.public-warranty{min-height:100vh;background:#f4f7fb;color:#0b1739;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding-bottom:36px}.brand-hero{height:190px;background:linear-gradient(135deg,#071b48 0%,#0a2b72 58%,#26166c 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff}.brand-mark{display:flex;align-items:center;gap:12px;font-size:36px}.brand-mark b{letter-spacing:-1.5px}.brand-mark b span,.mini-brand span{color:#2871ff}.phone-mark{width:35px;height:58px;border:4px solid #2871ff;border-radius:7px;display:block}.brand-hero small{font-size:10px;letter-spacing:4px;margin-top:7px}.warranty-shell{width:min(100% - 24px,520px);margin:-24px auto 0;position:relative}.intro-card,.state-card,.success-card,.trust-card,.info-grid article,.detail-card,.terms-card,.signature-card{background:#fff;border:1px solid #e7edf6;box-shadow:0 8px 30px rgba(20,47,94,.06);border-radius:22px}.intro-card{text-align:center;padding:30px 22px 24px}.shield,.success-check{width:52px;height:52px;margin:0 auto 14px;border-radius:16px;background:#1768ff;color:#fff;display:grid;place-items:center;font-size:28px;font-weight:900}.intro-card h1,.success-card h1{margin:0;font-size:25px}.intro-card p,.success-card>p{color:#52627e;line-height:1.55;margin:9px 0 0}.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 0}.info-grid article{padding:16px}.info-grid small,.detail-card small,.summary small{display:block;color:#64748b;font-size:12px}.info-grid strong,.detail-card strong,.summary strong{display:block;margin-top:5px;font-size:16px}.detail-card{display:flex;gap:14px;align-items:center;padding:18px;margin:10px 0}.detail-icon{width:46px;height:46px;border-radius:14px;background:#eef5ff;display:grid;place-items:center;font-size:21px;flex:0 0 auto}.detail-card>div:last-child{min-width:0}.detail-card span{display:block;color:#61708a;font-size:12px;margin-top:5px}.detail-card .done{display:inline-block;background:#d9fbe7;color:#087a3c;border-radius:999px;padding:4px 9px;font-weight:800}.terms-card,.signature-card{padding:20px;margin-top:12px}.terms-card h2,.signature-card h2{font-size:18px;margin:0 0 13px}.terms-card ol{padding-left:24px;margin:0}.terms-card li{padding:7px 0;color:#40506c;font-size:13px;line-height:1.55}.notice{margin-top:14px;padding:13px;background:#eaf3ff;color:#1451ba;border-radius:13px;font-size:12px;line-height:1.5}.signature-card>p{color:#64748b;font-size:13px;margin-top:-5px}.signature-card canvas{display:block;width:100%;height:210px;border:1.5px solid #cfd9e8;border-radius:14px;background:#fff;touch-action:none}.clear{width:100%;margin:9px 0 15px;padding:11px;border:0;border-radius:11px;background:#f1f5f9;color:#52627e;font-weight:700}.signature-card label:not(.accept){display:block;color:#52627e;font-size:12px;margin:12px 0}.signature-card input:not([type=checkbox]){display:block;width:100%;margin-top:6px;border:1px solid #d7dfeb;border-radius:11px;padding:12px 13px;font:inherit;color:#0b1739;outline:none}.signature-card input:focus{border-color:#2871ff;box-shadow:0 0 0 3px rgba(40,113,255,.1)}em{font-style:normal;color:#8a97aa}.accept{display:flex;gap:10px;align-items:flex-start;margin:17px 0;color:#43526c;font-size:12px;line-height:1.45}.accept input{width:20px;height:20px;accent-color:#1768ff;flex:0 0 auto}.accept b{color:#1768ff}.sign-button{width:100%;border:0;border-radius:13px;padding:15px;background:#1768ff;color:#fff;font-weight:850;font-size:15px}.sign-button:disabled{opacity:.6}.secure{display:block;text-align:center;color:#738097;margin-top:11px}.success-card{padding:34px 20px;text-align:center}.success-check{border-radius:50%;background:#12ad6a}.summary{text-align:left;background:#f7f9fc;border-radius:15px;margin-top:22px;padding:5px 16px}.summary>div{padding:13px 0;border-bottom:1px solid #e8edf5}.summary>div:last-child{border:0}.trust-card{text-align:center;margin-top:12px;padding:25px}.trust-card>span{font-size:26px}.trust-card p{color:#60708b;margin:5px}.mini-brand{font-size:27px;font-weight:900}.trust-card small{display:block;color:#60708b;margin-top:5px}.state-card{text-align:center;padding:45px 20px;margin-top:60px}.big-icon{width:52px;height:52px;border-radius:50%;background:#fff1f2;color:#be123c;display:grid;place-items:center;margin:auto;font-size:28px;font-weight:900}@media(max-width:390px){.brand-hero{height:165px}.brand-mark{font-size:30px}.phone-mark{width:30px;height:50px}.warranty-shell{width:calc(100% - 16px)}.info-grid{grid-template-columns:1fr}.intro-card,.terms-card,.signature-card{border-radius:18px}}
</style>
