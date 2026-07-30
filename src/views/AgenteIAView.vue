<script setup>
import { computed, onMounted, ref } from 'vue'
import { agentRepository } from '../repositories/agent.repository'
import { answerWithContext } from '../services/agent-engine.service'

const loading = ref(true)
const sending = ref(false)
const error = ref('')
const question = ref('')
const config = ref({ nombre: 'Soul', tono: 'amable_profesional', saludo: '', instrucciones: '', activo: true })
const context = ref(null)
const conversation = ref(null)
const messages = ref([])
const latestResult = ref(null)
const editableAnswer = ref('')
const notice = ref('')

const suggestions = [
  '¿Cuánto cuesta la pantalla de un iPhone 14 Pro?',
  '¿Qué diferencia hay entre INCELL y OLED?',
  '¿Tienen batería para iPhone 13?',
  'Mi teléfono se mojó, ¿todavía tiene reparación?',
  '¿Dónde están ubicados y a qué hora cierran?'
]

const stats = computed(() => ({
  faq: context.value?.faq?.length || 0,
  servicios: context.value?.servicios?.length || 0,
  productos: context.value?.productos?.length || 0,
  aprobadas: context.value?.aprobadas?.length || 0
}))

async function load() {
  loading.value = true; error.value = ''
  try {
    const [agent, ctx] = await Promise.all([agentRepository.getConfig().catch(() => null), agentRepository.getContext()])
    if (agent) config.value = { ...config.value, ...agent }
    context.value = ctx
    conversation.value = await agentRepository.createConversation()
    messages.value = config.value.saludo ? [{ rol: 'agente', contenido: config.value.saludo, local: true }] : []
  } catch (e) { error.value = e.message }
  finally { loading.value = false }
}

async function send(text = question.value) {
  const value = String(text || '').trim()
  if (!value || sending.value) return
  sending.value = true; error.value = ''; notice.value = ''; question.value = ''
  try {
    if (!conversation.value) conversation.value = await agentRepository.createConversation()
    const clientMsg = await agentRepository.addMessage({ conversacion_id: conversation.value.id, rol: 'cliente', contenido: value, fuentes: [] })
    messages.value.push(clientMsg)
    const result = answerWithContext(value, context.value, config.value)
    const agentMsg = await agentRepository.addMessage({
      conversacion_id: conversation.value.id,
      rol: 'agente', contenido: result.answer, fuentes: result.sources,
      confianza: result.confidence, requiere_revision: result.transfer || result.confidence < 70
    })
    messages.value.push({ ...agentMsg, transfer: result.transfer, reason: result.reason })
    latestResult.value = { ...result, question: value, messageId: agentMsg.id }
    editableAnswer.value = result.answer
  } catch (e) { error.value = e.message }
  finally { sending.value = false }
}

async function approve() {
  if (!latestResult.value || !editableAnswer.value.trim()) return
  try {
    await agentRepository.approve({
      pregunta: latestResult.value.question,
      respuesta: editableAnswer.value.trim(),
      intencion: latestResult.value.intent,
      palabras_clave: latestResult.value.question.toLowerCase().split(/[^a-záéíóúñ0-9]+/).filter(x => x.length > 3),
      origen_mensaje_id: latestResult.value.messageId,
      activo: true
    })
    context.value = await agentRepository.getContext()
    notice.value = 'Respuesta aprobada y agregada a la base de aprendizaje.'
  } catch (e) { error.value = e.message }
}

async function copyAnswer() {
  await navigator.clipboard?.writeText(editableAnswer.value)
  notice.value = 'Respuesta copiada.'
}

async function newConversation() {
  conversation.value = await agentRepository.createConversation()
  messages.value = config.value.saludo ? [{ rol: 'agente', contenido: config.value.saludo, local: true }] : []
  latestResult.value = null; editableAnswer.value = ''; notice.value = ''
}

onMounted(load)
</script>

<template>
  <section class="agent-page">
    <header class="page-head">
      <div><span class="eyebrow">TechSoul AI · Fase 1</span><h2>Simulador del agente</h2><p>Prueba respuestas usando únicamente información registrada en TechSoul OS.</p></div>
      <button class="secondary" @click="newConversation">Nueva conversación</button>
    </header>

    <div v-if="error" class="alert error">{{ error }}</div>
    <div v-if="notice" class="alert success">{{ notice }}</div>

    <div class="stats">
      <article><span>FAQ activas</span><strong>{{ stats.faq }}</strong></article>
      <article><span>Servicios</span><strong>{{ stats.servicios }}</strong></article>
      <article><span>Productos</span><strong>{{ stats.productos }}</strong></article>
      <article><span>Aprobadas</span><strong>{{ stats.aprobadas }}</strong></article>
    </div>

    <div v-if="loading" class="panel empty">Cargando agente…</div>
    <div v-else class="workspace">
      <article class="panel chat-panel">
        <div class="chat-head"><div><strong>{{ config.nombre || 'Soul' }}</strong><small>Asistente de TechSoul</small></div><span class="status">En pruebas</span></div>
        <div class="messages">
          <div v-for="(message, index) in messages" :key="message.id || index" class="message" :class="message.rol">
            <div class="bubble"><pre>{{ message.contenido }}</pre><small v-if="message.confianza">Confianza: {{ Number(message.confianza).toFixed(0) }}%</small><small v-if="message.transfer" class="transfer">Transferir: {{ message.reason }}</small></div>
          </div>
        </div>
        <div class="suggestions"><button v-for="item in suggestions" :key="item" @click="send(item)">{{ item }}</button></div>
        <form class="composer" @submit.prevent="send()"><textarea v-model="question" rows="2" placeholder="Escribe como lo haría un cliente…"/><button :disabled="sending || !question.trim()">{{ sending ? 'Buscando…' : 'Enviar' }}</button></form>
      </article>

      <aside class="panel review-panel">
        <div class="review-head"><span class="eyebrow">Revisión humana</span><h3>Respuesta generada</h3><p>Edita y aprueba respuestas útiles para que el sistema pueda reutilizarlas.</p></div>
        <template v-if="latestResult">
          <label><span>Pregunta del cliente</span><textarea :value="latestResult.question" rows="3" readonly/></label>
          <label><span>Respuesta editable</span><textarea v-model="editableAnswer" rows="12"/></label>
          <div class="confidence"><span>Confianza</span><strong>{{ latestResult.confidence }}%</strong></div>
          <div v-if="latestResult.sources.length" class="sources"><span>Fuentes utilizadas</span><ul><li v-for="source in latestResult.sources" :key="`${source.tipo}-${source.id}`">{{ source.tipo }} · {{ source.titulo }}</li></ul></div>
          <div v-else class="warning">No se encontró una fuente exacta. Conviene revisar antes de enviarla.</div>
          <div v-if="latestResult.transfer" class="warning danger"><strong>Requiere transferencia</strong><span>{{ latestResult.reason }}</span></div>
          <div class="actions"><button class="primary" @click="approve">Aprobar respuesta</button><button class="secondary" @click="copyAnswer">Copiar</button></div>
        </template>
        <div v-else class="empty">Envía una pregunta para revisar la respuesta, sus fuentes y nivel de confianza.</div>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.agent-page{max-width:1560px;margin:auto;padding:28px}.page-head{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;margin-bottom:20px}.page-head h2{margin:4px 0;font-size:30px;color:#101828}.page-head p,.review-head p{margin:0;color:#667085}.eyebrow{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.12em;color:#2563eb}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:18px}.stats article,.panel{background:#fff;border:1px solid #e4e7ec;border-radius:16px;box-shadow:0 1px 3px rgba(16,24,40,.04)}.stats article{padding:17px 20px}.stats span{display:block;color:#667085;font-size:13px}.stats strong{font-size:27px;color:#101828}.workspace{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(340px,.7fr);gap:18px}.chat-panel{overflow:hidden;display:flex;flex-direction:column;min-height:680px}.chat-head{padding:18px 20px;border-bottom:1px solid #e4e7ec;display:flex;justify-content:space-between}.chat-head strong,.chat-head small{display:block}.chat-head small{color:#667085}.status{background:#ecfdf3;color:#027a48;padding:6px 10px;border-radius:999px;font-size:12px}.messages{padding:20px;flex:1;overflow:auto;background:#f8fafc}.message{display:flex;margin-bottom:14px}.message.cliente{justify-content:flex-end}.bubble{max-width:82%;padding:12px 14px;border-radius:14px;background:white;border:1px solid #e4e7ec}.cliente .bubble{background:#2563eb;color:white;border-color:#2563eb}.bubble pre{white-space:pre-wrap;font:inherit;margin:0;line-height:1.55}.bubble small{display:block;margin-top:8px;opacity:.7}.transfer{color:#b42318!important;opacity:1!important}.suggestions{display:flex;gap:8px;overflow:auto;padding:12px 16px;border-top:1px solid #e4e7ec}.suggestions button{white-space:nowrap;border:1px solid #d0d5dd;background:white;border-radius:999px;padding:8px 11px;font-size:12px}.composer{display:flex;gap:10px;padding:16px;border-top:1px solid #e4e7ec}.composer textarea,label textarea{width:100%;box-sizing:border-box;border:1px solid #d0d5dd;border-radius:10px;padding:11px;font:inherit;resize:vertical}.composer button,.primary{border:0;background:#2563eb;color:white;border-radius:10px;padding:0 18px;font-weight:700}.review-panel{padding:20px}.review-head h3{margin:5px 0}.review-panel label{display:grid;gap:7px;margin-top:16px}.review-panel label span,.sources>span,.confidence span{font-size:13px;font-weight:700;color:#344054}.confidence{display:flex;justify-content:space-between;margin:14px 0;padding:12px;background:#f8fafc;border-radius:10px}.sources{padding:12px;background:#f8fafc;border-radius:10px}.sources ul{padding-left:18px;margin:8px 0 0;color:#475467;font-size:13px}.warning{margin-top:14px;padding:12px;border-radius:10px;background:#fffaeb;color:#b54708;font-size:13px}.warning.danger{background:#fef3f2;color:#b42318;display:grid;gap:4px}.actions{display:flex;gap:10px;margin-top:16px}.primary,.secondary{min-height:42px;padding:10px 15px;cursor:pointer}.secondary{border:1px solid #d0d5dd;background:white;color:#344054;border-radius:10px;font-weight:700}.empty{padding:40px;text-align:center;color:#667085}.alert{padding:12px 14px;border-radius:10px;margin-bottom:14px}.alert.error{background:#fef3f2;color:#b42318}.alert.success{background:#ecfdf3;color:#027a48}@media(max-width:1050px){.workspace{grid-template-columns:1fr}.chat-panel{min-height:600px}}@media(max-width:700px){.agent-page{padding:18px 14px}.page-head{flex-direction:column}.stats{grid-template-columns:1fr 1fr}.composer{flex-direction:column}.composer button{min-height:44px}}@media(max-width:450px){.stats{grid-template-columns:1fr}}
</style>
