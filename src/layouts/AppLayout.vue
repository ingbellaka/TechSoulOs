<script setup>
import { ref } from 'vue'
import { useAuthStore } from '../stores/auth'
import AppSidebar from '../components/navigation/AppSidebar.vue'
import AppTopbar from '../components/navigation/AppTopbar.vue'

const auth = useAuthStore()
const mobileMenuOpen = ref(false)
const sidebarCollapsed = ref(false)
const mobileLinks = [
  { to: '/', label: 'Inicio', path: 'm3 11 9-8 9 8v9H15v-6H9v6H3z' },
  { to: '/taller', label: 'Taller', path: 'M14 6a5 5 0 0 0-6 6l-5 5a2.8 2.8 0 0 0 4 4l5-5a5 5 0 0 0 6-6l-3 3-4-4z' },
  { to: '/ordenes', label: 'Órdenes', path: 'M8 5H5v16h14V5h-3M8 3h8v4H8zM8 11h8m-8 4h8m-8 3h5' },
  { to: '/caja', label: 'Caja', path: 'M3 6h16a2 2 0 0 1 2 2v12H5a2 2 0 0 1-2-2zM3 6l14-3v3m1 7h3', roles: ['admin', 'recepcion'] },
  { to: '/mas', label: 'Más', path: 'M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z' },
]
</script>

<template>
  <div class="app-shell" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
    <AppSidebar
      :open="mobileMenuOpen"
      :collapsed="sidebarCollapsed"
      @close="mobileMenuOpen = false"
      @toggle-collapse="sidebarCollapsed = !sidebarCollapsed"
    />

    <div class="app-workspace">
      <AppTopbar
        @open-menu="mobileMenuOpen = true"
        @toggle-sidebar="sidebarCollapsed = !sidebarCollapsed"
      />

      <main class="app-content">
        <slot />
      </main>
    </div>
    <nav class="mobile-work-nav no-print" aria-label="Navegación rápida">
      <router-link v-for="item in mobileLinks.filter(item => !item.roles || auth.can(item.roles))" :key="item.to" :to="item.to">
        <span class="mobile-work-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false"><path :d="item.path" /></svg>
        </span>
        <span>{{ item.label }}</span>
      </router-link>
    </nav>
  </div>
</template>
