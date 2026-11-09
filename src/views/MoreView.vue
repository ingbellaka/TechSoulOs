<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { moduleGroups } from '../router/navigation'

const router = useRouter()
const auth = useAuthStore()
const groups = computed(() => moduleGroups.map(group => ({
  ...group,
  items: group.items.filter(item => {
    if (['/', '/ordenes', '/caja'].includes(item.to)) return false
    const roles = router.resolve(item.to).meta.roles
    return !roles || auth.can(roles)
  }),
})).filter(group => group.items.length))
</script>

<template>
  <section class="ts-module-page">
    <header class="ts-module-header">
      <div><h2>Más</h2><p>Encuentra las herramientas de operación y administración.</p></div>
    </header>
    <div class="module-directory">
      <section v-for="group in groups" :key="group.label" class="module-directory-group">
        <h3>{{ group.label }}</h3>
        <router-link v-for="item in group.items" :key="item.to" :to="item.to">
          {{ item.label }} <span aria-hidden="true">›</span>
        </router-link>
      </section>
    </div>
  </section>
</template>
