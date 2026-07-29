<script setup>
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const auth = useAuthStore()

onMounted(() => {
  auth.cargarSesion()
})

async function salir() {
  await auth.logout()
  router.push('/login')
}
</script>

<template>
  <nav class="navbar navbar-expand-lg navbar-dark sticky-top ts-navbar no-print">
    <div class="container-fluid px-3 px-md-4">
      <router-link class="navbar-brand fw-bold ts-brand" to="/">
        ⚡ TechSoul Manager
      </router-link>

      <button
        class="navbar-toggler"
        type="button"
        data-bs-toggle="collapse"
        data-bs-target="#navbarTechSoul"
      >
        <span class="navbar-toggler-icon"></span>
      </button>

      <div id="navbarTechSoul" class="collapse navbar-collapse">
        <div class="navbar-nav ms-auto gap-lg-1 align-items-lg-center">
          <router-link class="nav-link" to="/">Dashboard</router-link>
          <router-link class="nav-link" to="/clientes">Clientes</router-link>
          <router-link class="nav-link" to="/equipos">Equipos</router-link>
          <router-link class="nav-link fw-semibold" to="/nueva-orden">+ Nueva Orden</router-link>
          <router-link class="nav-link" to="/ordenes">Órdenes</router-link>
          <router-link class="nav-link" to="/inventario">Inventario</router-link>
          <router-link class="nav-link" to="/ventas">Ventas</router-link>
          <router-link class="nav-link" to="/compras">Compras</router-link>
          <router-link class="nav-link" to="/caja">Caja</router-link>
          <router-link class="nav-link" to="/configuracion">Config</router-link>

          <span v-if="auth.perfil" class="badge bg-light text-dark ms-lg-2">
            {{ auth.perfil.nombre }} · {{ auth.perfil.rol }}
          </span>

          <button v-if="auth.user" class="btn btn-sm btn-outline-light ms-lg-2" @click="salir">
            Salir
          </button>
        </div>
      </div>
    </div>
  </nav>
</template>
