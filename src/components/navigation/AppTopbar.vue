<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'

const emit = defineEmits(['open-menu', 'toggle-sidebar'])
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const dark = ref(false)
const search = ref('')

const pageTitle = computed(() => ({
  dashboard: 'Inicio', clientes: 'Clientes', equipos: 'Equipos', nuevaOrden: 'Nueva orden',
  ordenes: 'Órdenes', detalleOrden: 'Detalle de orden', editarOrden: 'Editar orden',
  inventario: 'Inventario', ventas: 'Ventas', compras: 'Compras', ordenCompraDetalle: 'Detalle de compra',
  caja: 'Caja', configuracion: 'Configuración', garantias: 'Garantías',
  reportes: 'Reportes', usuarios: 'Usuarios',
  tarifario: 'Tarifario', cotizador: 'Cotizador'
}[route.name] || 'TechSoul'))

function toggleTheme() {
  dark.value = !dark.value
  document.documentElement.dataset.theme = dark.value ? 'dark' : 'light'
  localStorage.setItem('techsoul-theme', dark.value ? 'dark' : 'light')
}

function submitSearch() {
  const term = search.value.trim()
  if (!term) return
  router.push({ path: '/ordenes', query: { q: term } })
}

onMounted(async () => {
  if (!auth.user) await auth.cargarSesion()
  const saved = localStorage.getItem('techsoul-theme')
  dark.value = saved === 'dark'
  document.documentElement.dataset.theme = dark.value ? 'dark' : 'light'
})
</script>

<template>
  <header class="app-topbar no-print">
    <div class="topbar-left">
      <button class="icon-btn mobile-only" type="button" aria-label="Abrir menú" @click="emit('open-menu')">
        <svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
      </button>
      <div class="page-heading">
        <span class="page-eyebrow">TechSoul Manager</span>
        <h1>{{ pageTitle }}</h1>
      </div>
    </div>

    <div class="topbar-actions">
      <form class="global-search" role="search" @submit.prevent="submitSearch">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>
        <input v-model="search" type="search" placeholder="Buscar orden, cliente o IMEI…" aria-label="Buscar" />
        <kbd>Enter</kbd>
      </form>

      <button class="icon-btn" type="button" :title="dark ? 'Usar tema claro' : 'Usar tema oscuro'" @click="toggleTheme">
        <svg v-if="dark" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
        <svg v-else viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></svg>
      </button>

      <router-link to="/nueva-orden" class="topbar-primary-btn">
        <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
        <span>Nueva orden</span>
      </router-link>
    </div>
  </header>
</template>
