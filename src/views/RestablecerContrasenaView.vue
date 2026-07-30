<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const router = useRouter()
const password = ref('')
const confirmacion = ref('')
const cargando = ref(false)
const error = ref('')

async function guardar() {
  error.value = ''
  if (password.value.length < 8) {
    error.value = 'La contraseña debe tener al menos 8 caracteres.'
    return
  }
  if (password.value !== confirmacion.value) {
    error.value = 'Las contraseñas no coinciden.'
    return
  }
  try {
    cargando.value = true
    await auth.actualizarContrasena(password.value)
    alert('Contraseña actualizada correctamente.')
    router.replace('/')
  } catch (e) {
    error.value = e.message || 'No fue posible actualizar la contraseña.'
  } finally {
    cargando.value = false
  }
}
</script>

<template>
  <div class="min-vh-100 d-flex align-items-center justify-content-center px-3 auth-bg">
    <div class="card p-4 shadow-lg border-0 auth-card">
      <h1 class="h3 fw-bold mb-1">Nueva contraseña</h1>
      <p class="text-muted mb-4">Crea una contraseña segura para TechSoul OS.</p>
      <div v-if="error" class="alert alert-danger">{{ error }}</div>
      <label class="form-label">Nueva contraseña</label>
      <input v-model="password" type="password" class="form-control mb-3" autocomplete="new-password">
      <label class="form-label">Confirmar contraseña</label>
      <input v-model="confirmacion" type="password" class="form-control mb-3" autocomplete="new-password" @keyup.enter="guardar">
      <button class="btn ts-btn-primary w-100" :disabled="cargando" @click="guardar">
        {{ cargando ? 'Guardando...' : 'Guardar contraseña' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.auth-bg{background:linear-gradient(135deg,#020617,#1e3a8a,#2563eb)}
.auth-card{max-width:430px;width:100%;border-radius:28px}
</style>
