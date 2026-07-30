<script setup>
import { ref } from 'vue'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const email = ref('')
const cargando = ref(false)
const enviado = ref(false)
const error = ref('')

async function enviar() {
  error.value = ''
  if (!email.value.trim()) {
    error.value = 'Escribe tu correo.'
    return
  }
  try {
    cargando.value = true
    await auth.solicitarRecuperacion(email.value)
    enviado.value = true
  } catch (e) {
    error.value = e.message || 'No fue posible enviar el correo.'
  } finally {
    cargando.value = false
  }
}
</script>

<template>
  <div class="min-vh-100 d-flex align-items-center justify-content-center px-3 auth-bg">
    <div class="card p-4 shadow-lg border-0 auth-card">
      <div class="text-center mb-4">
        <div class="brand-mark mx-auto mb-3">TS</div>
        <h1 class="h3 fw-bold mb-1">Recuperar contraseña</h1>
        <p class="text-muted mb-0">Te enviaremos un enlace seguro.</p>
      </div>

      <div v-if="enviado" class="alert alert-success">
        Revisa tu correo. Si la cuenta existe, recibirás un enlace para cambiar la contraseña.
      </div>

      <template v-else>
        <div v-if="error" class="alert alert-danger">{{ error }}</div>
        <label class="form-label">Correo</label>
        <input v-model="email" type="email" class="form-control mb-3" autocomplete="email" @keyup.enter="enviar">
        <button class="btn ts-btn-primary w-100" :disabled="cargando" @click="enviar">
          {{ cargando ? 'Enviando...' : 'Enviar enlace' }}
        </button>
      </template>

      <router-link to="/login" class="btn btn-link mt-3">Volver al inicio de sesión</router-link>
    </div>
  </div>
</template>

<style scoped>
.auth-bg{background:linear-gradient(135deg,#020617,#1e3a8a,#2563eb)}
.auth-card{max-width:430px;width:100%;border-radius:28px}
.brand-mark{width:54px;height:54px;display:grid;place-items:center;border-radius:16px;background:#2563eb;color:#fff;font-weight:800}
</style>
