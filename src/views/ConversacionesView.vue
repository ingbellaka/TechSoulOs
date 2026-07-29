<script setup>
import { computed, ref } from 'vue'

const search = ref('')
const selected = ref(1)
const conversations = ref([
  { id: 1, name: 'Carlos Ramírez', channel: 'WhatsApp', time: 'Hace 4 min', unread: 2, preview: 'Tengo un iPhone 14 Pro que se mojó y se reinicia.', status: 'Nuevo', initials: 'CR' },
  { id: 2, name: 'Mariana López', channel: 'Instagram', time: 'Hace 18 min', unread: 0, preview: '¿Tienen funda transparente para iPhone 15?', status: 'Cotización', initials: 'ML' },
  { id: 3, name: 'José Andrade', channel: 'Messenger', time: 'Hoy 1:42 PM', unread: 0, preview: 'Gracias, mañana paso por el equipo.', status: 'Seguimiento', initials: 'JA' },
  { id: 4, name: 'Ana Torres', channel: 'WhatsApp', time: 'Ayer', unread: 0, preview: 'Mi Samsung ya no carga, solo vibra.', status: 'Diagnóstico', initials: 'AT' }
])
const messages = [
  { side: 'in', text: 'Hola, tengo un iPhone 14 Pro que se mojó y ahora se reinicia.', time: '3:51 PM' },
  { side: 'out', text: '¡Hola, Carlos! Con gusto te ayudamos. ¿Fue lluvia, alberca, agua de mar u otro líquido?', time: '3:52 PM', ai: true },
  { side: 'in', text: 'Fue en una alberca y lo conecté a cargar después.', time: '3:53 PM' },
  { side: 'out', text: 'Gracias por comentarlo. Evita seguir conectándolo o intentar encenderlo. ¿La falla comenzó de inmediato o unas horas después?', time: '3:54 PM', ai: true }
]
const filtered = computed(() => conversations.value.filter(c => `${c.name} ${c.preview} ${c.channel}`.toLowerCase().includes(search.value.toLowerCase())))
const current = computed(() => conversations.value.find(c => c.id === selected.value) || conversations.value[0])
</script>

<template>
  <section class="ts-module-page">
    <header class="ts-module-header">
      <div><span class="ts-eyebrow">Centro omnicanal</span><h2>Conversaciones</h2><p>Atiende WhatsApp, Instagram y Messenger desde un solo lugar.</p></div>
      <button class="ts-action-primary">+ Nueva conversación</button>
    </header>
    <div class="ts-metric-strip ts-metric-strip-four">
      <article class="ts-mini-metric"><span>Sin responder</span><strong>5</strong><small>Requieren atención</small></article>
      <article class="ts-mini-metric"><span>Atendidas hoy</span><strong>24</strong><small>8 por TechSoul AI</small></article>
      <article class="ts-mini-metric"><span>Cotizaciones</span><strong>9</strong><small>3 pendientes</small></article>
      <article class="ts-mini-metric"><span>Tiempo promedio</span><strong>2m</strong><small>Primera respuesta</small></article>
    </div>
    <div class="ts-inbox-shell ts-panel">
      <aside class="ts-thread-list">
        <div class="ts-inbox-search"><input v-model="search" placeholder="Buscar conversaciones..." /></div>
        <button v-for="c in filtered" :key="c.id" class="ts-thread" :class="{ active: selected === c.id }" @click="selected = c.id">
          <span class="ts-customer-avatar">{{ c.initials }}</span>
          <span class="ts-thread-copy"><strong>{{ c.name }}</strong><small>{{ c.channel }} · {{ c.time }}</small><p>{{ c.preview }}</p></span>
          <span v-if="c.unread" class="ts-unread">{{ c.unread }}</span>
        </button>
      </aside>
      <main class="ts-chat-pane">
        <header class="ts-chat-header"><div class="ts-customer-avatar">{{ current.initials }}</div><div><strong>{{ current.name }}</strong><small>{{ current.channel }} · {{ current.status }}</small></div><button class="ts-action-secondary ts-action-compact">Crear lead</button></header>
        <div class="ts-chat-messages">
          <div v-for="(m, i) in messages" :key="i" class="ts-message" :class="m.side"><span v-if="m.ai" class="ts-ai-label">TechSoul AI</span><p>{{ m.text }}</p><small>{{ m.time }}</small></div>
        </div>
        <footer class="ts-composer"><textarea placeholder="Escribe un mensaje..."></textarea><div><button class="ts-action-secondary ts-action-compact">Adjuntar</button><button class="ts-action-primary">Enviar</button></div></footer>
      </main>
      <aside class="ts-context-pane"><span class="ts-panel-kicker">Contexto detectado</span><h3>iPhone 14 Pro</h3><div class="ts-context-card"><span>Falla probable</span><strong>Daño por humedad</strong><small>Confianza inicial: media</small></div><div class="ts-context-card"><span>Datos recopilados</span><ul><li>Contacto con alberca</li><li>Fue conectado a cargar</li><li>Presenta reinicios</li></ul></div><button class="ts-action-primary">Generar prediagnóstico</button></aside>
    </div>
  </section>
</template>
