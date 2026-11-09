<script setup>
import { ref } from 'vue'
import { useAuthStore } from '../stores/auth'
import AppSidebar from '../components/navigation/AppSidebar.vue'
import AppTopbar from '../components/navigation/AppTopbar.vue'

const auth = useAuthStore()
const mobileMenuOpen = ref(false)
const sidebarCollapsed = ref(false)
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
      <router-link to="/">Inicio</router-link>
      <router-link to="/taller">Taller</router-link>
      <router-link to="/ordenes">Órdenes</router-link>
      <router-link v-if="auth.can(['admin', 'recepcion'])" to="/caja">Caja</router-link>
      <router-link to="/mas">Más</router-link>
    </nav>
  </div>
</template>
