<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'

const props = defineProps({
  open: { type: Boolean, default: false },
  collapsed: { type: Boolean, default: false }
})

const emit = defineEmits(['close', 'toggle-collapse'])
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const initials = computed(() => {
  const name = auth.perfil?.nombre || auth.user?.email || 'TS'
  return name.split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase()
})

const groups = [
  {
    label: 'Operación',
    items: [
      { label: 'Inicio', to: '/', icon: 'home' },
      { label: 'Conversaciones', to: '/conversaciones', icon: 'chat' },
      { label: 'Clientes', to: '/clientes', icon: 'users' },
      { label: 'Equipos', to: '/equipos', icon: 'phone' },
      { label: 'Nueva orden', to: '/nueva-orden', icon: 'plus', accent: true },
      { label: 'Órdenes', to: '/ordenes', icon: 'clipboard' },
      { label: 'Garantías', to: '/garantias', icon: 'shield' }
    ]
  },
  {
    label: 'Inventario',
    items: [
      { label: 'Catálogo de servicios', to: '/catalogo-servicios', icon: 'tag' },
      { label: 'Existencias', to: '/inventario', icon: 'box' },
      { label: 'Compras y proveedores', to: '/compras', icon: 'truck' }
    ]
  },
  {
    label: 'Finanzas',
    items: [
      { label: 'Tarifario', to: '/tarifario', icon: 'tag' },
      { label: 'Cotizador inteligente', to: '/cotizador', icon: 'calculator' },
      { label: 'Presupuestos', to: '/presupuestos', icon: 'clipboard' },
      { label: 'Ventas', to: '/ventas', icon: 'cart' },
      { label: 'Caja', to: '/caja', icon: 'wallet' },
      { label: 'Reportes', to: '/reportes', icon: 'chart' }
    ]
  },
  {
    label: 'Inteligencia',
    items: [
      { label: 'Inteligencia de precios', to: '/inteligencia-precios', icon: 'chart' },
      { label: 'TechSoul AI', to: '/ia', icon: 'spark' },
      { label: 'Base de conocimiento', to: '/base-conocimiento', icon: 'spark' },
      { label: 'Promociones', to: '/promociones', icon: 'tag' },
      { label: 'Plantillas de respuesta', to: '/plantillas', icon: 'chat' },
      { label: 'Preparación del agente', to: '/ia-configuracion', icon: 'settings' },
      { label: 'Automatizaciones', to: '/automatizaciones', icon: 'bolt' }
    ]
  },
  {
    label: 'Sistema',
    items: [
      { label: 'Usuarios y permisos', to: '/usuarios', icon: 'users' },
      { label: 'Auditoría', to: '/auditoria', icon: 'clipboard' },
      { label: 'Configuración', to: '/configuracion', icon: 'settings' }
    ]
  }
]

function isActive(to) {
  if (to === '/') return route.path === '/'
  return route.path.startsWith(to)
}

async function logout() {
  await auth.logout()
  emit('close')
  router.push('/login')
}
</script>

<template>
  <div v-if="open" class="sidebar-backdrop" @click="emit('close')" />

  <aside class="app-sidebar" :class="{ open, collapsed }" aria-label="Navegación principal">
    <div class="sidebar-brand">
      <router-link to="/" class="brand-link" @click="emit('close')">
        <span class="brand-mark">TS</span>
        <span v-if="!collapsed" class="brand-copy">
          <strong>TechSoul</strong>
          <small>OS</small>
        </span>
      </router-link>
      <button class="sidebar-collapse-btn desktop-only" type="button" @click="emit('toggle-collapse')" :aria-label="collapsed ? 'Expandir menú' : 'Contraer menú'">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>
      </button>
    </div>

    <nav class="sidebar-nav">
      <section v-for="group in groups" :key="group.label" class="nav-section">
        <p v-if="!collapsed" class="nav-section-label">{{ group.label }}</p>
        <router-link
          v-for="item in group.items"
          :key="item.to"
          :to="item.to"
          class="sidebar-link"
          :class="{ active: isActive(item.to), accent: item.accent }"
          :title="collapsed ? item.label : undefined"
          @click="emit('close')"
        >
          <span class="nav-icon" aria-hidden="true">
            <svg v-if="item.icon === 'home'" viewBox="0 0 24 24"><path d="m3 11 9-8 9 8v9a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/></svg>
            <svg v-else-if="item.icon === 'users'" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8m13 10v-2a4 4 0 0 0-3-3.87m-2-11.96a4 4 0 0 1 0 7.75"/></svg>
            <svg v-else-if="item.icon === 'phone'" viewBox="0 0 24 24"><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/></svg>
            <svg v-else-if="item.icon === 'plus'" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
            <svg v-else-if="item.icon === 'clipboard'" viewBox="0 0 24 24"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M9 9h6M9 13h6M9 17h4"/></svg>
            <svg v-else-if="item.icon === 'box'" viewBox="0 0 24 24"><path d="m21 8-9 5-9-5 9-5zM3 8v8l9 5 9-5V8M12 13v8"/></svg>
            <svg v-else-if="item.icon === 'truck'" viewBox="0 0 24 24"><path d="M10 17h4V5H2v12h3m9-8h4l4 4v4h-3m-14 0a2 2 0 1 0 4 0 2 2 0 0 0-4 0m10 0a2 2 0 1 0 4 0 2 2 0 0 0-4 0"/></svg>
            <svg v-else-if="item.icon === 'cart'" viewBox="0 0 24 24"><circle cx="9" cy="20" r="1"/><circle cx="19" cy="20" r="1"/><path d="M3 3h2l2.4 11.5a2 2 0 0 0 2 1.5h8.8a2 2 0 0 0 2-1.6L22 7H6"/></svg>
            <svg v-else-if="item.icon === 'wallet'" viewBox="0 0 24 24"><path d="M3 6h16a2 2 0 0 1 2 2v11H5a2 2 0 0 1-2-2zM3 6l14-3v3m1 6h3"/></svg>
            <svg v-else-if="item.icon === 'chat'" viewBox="0 0 24 24"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><path d="M8 9h8M8 13h5"/></svg>
            <svg v-else-if="item.icon === 'shield'" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
            <svg v-else-if="item.icon === 'chart'" viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>
            <svg v-else-if="item.icon === 'spark'" viewBox="0 0 24 24"><path d="m12 3-1.5 4.5L6 9l4.5 1.5L12 15l1.5-4.5L18 9l-4.5-1.5zM19 15l-.8 2.2L16 18l2.2.8L19 21l.8-2.2L22 18l-2.2-.8z"/></svg>
            <svg v-else-if="item.icon === 'bolt'" viewBox="0 0 24 24"><path d="M13 2 3 14h8l-1 8 10-12h-8z"/></svg>
            <svg v-else-if="item.icon === 'tag'" viewBox="0 0 24 24"><path d="M20 13 11 22l-9-9V4a2 2 0 0 1 2-2h9z"/><circle cx="8" cy="8" r="2"/></svg>
            <svg v-else-if="item.icon === 'calculator'" viewBox="0 0 24 24"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h.01M12 19h.01M16 19h.01"/></svg>
            <svg v-else viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1v.1h-4v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1-.4H3v-4h.1A1.7 1.7 0 0 0 4.6 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1V3h4v.1A1.7 1.7 0 0 0 15.5 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.14.36.35.7.6 1 .27.27.63.4 1 .4h.1v4H21a1.7 1.7 0 0 0-1.6.6z"/></svg>
          </span>
          <span v-if="!collapsed" class="nav-label">{{ item.label }}</span>
        </router-link>
      </section>
    </nav>

    <div class="sidebar-user">
      <div class="user-avatar">{{ initials }}</div>
      <div v-if="!collapsed" class="user-copy">
        <strong>{{ auth.perfil?.nombre || 'TechSoul' }}</strong>
        <small>{{ auth.perfil?.rol || auth.user?.email || 'Usuario' }}</small>
      </div>
      <button v-if="!collapsed" class="logout-btn" type="button" title="Cerrar sesión" @click="logout">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17l5-5-5-5m5 5H3m10-9h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/></svg>
      </button>
    </div>
  </aside>
</template>
