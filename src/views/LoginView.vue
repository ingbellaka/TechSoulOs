<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const auth = useAuthStore()

const cargando = ref(false)

const form = ref({
  nombre: '',
  email: '',
  password: '',
  rol: 'Tecnico'
})

async function entrar() {
  try {
    cargando.value = true

    await auth.login(form.value.email, form.value.password)
    const redirect = String(router.currentRoute.value.query.redirect || '/')
    router.replace(redirect)
  } catch (error) {
    alert(error.message)
  } finally {
    cargando.value = false
  }
}
</script>

<template>
  <div class="min-vh-100 d-flex align-items-center justify-content-center px-3" style="background: linear-gradient(135deg, #020617, #1e3a8a, #2563eb);">
    <div class="card p-4 shadow-lg border-0" style="max-width: 430px; width: 100%; border-radius: 28px;">
      <div class="text-center mb-4">
        <h1 class="fw-bold mb-1">⚡ TechSoul Manager</h1>
        <p class="text-muted mb-0">Acceso seguro al sistema</p>
      </div>


      <input
        v-model="form.email"
        type="email"
        class="form-control mb-2"
        placeholder="Correo"
      >

      <input
        v-model="form.password"
        type="password"
        class="form-control mb-3"
        placeholder="Contraseña"
        autocomplete="current-password"
        @keyup.enter="entrar"
      >

      <button
        class="btn ts-btn-primary w-100"
        :disabled="cargando"
        @click="entrar"
      >
        {{ cargando ? 'Entrando...' : 'Entrar' }}
      </button>

      <router-link to="/recuperar-contrasena" class="btn btn-link w-100 mt-2">¿Olvidaste tu contraseña?</router-link>
      <small class="text-muted d-block mt-2 text-center">Los usuarios se administran desde Supabase Auth.</small>
    </div>
  </div>
</template>
