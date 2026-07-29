<script setup>
import { ref } from 'vue'
import AppSidebar from '../components/navigation/AppSidebar.vue'
import AppTopbar from '../components/navigation/AppTopbar.vue'

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
  </div>
</template>
