<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const auth = useAuthStore()

const modo = ref('login')
const registroPublico = false
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

    if (modo.value === 'login') {
      await auth.login(form.value.email, form.value.password)
    } else {
      await auth.registro(
        form.value.nombre,
        form.value.email,
        form.value.password,
        form.value.rol
      )
    }

    router.push('/')
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

      <div class="btn-group w-100 mb-3">
        <button
          class="btn"
          :class="modo === 'login' ? 'btn-primary' : 'btn-outline-primary'"
          @click="modo = 'login'"
        >
          Entrar
        </button>

        <button
          v-if="registroPublico"
          class="btn"
          :class="modo === 'registro' ? 'btn-primary' : 'btn-outline-primary'"
          @click="modo = 'registro'"
        >
          Crear usuario
        </button>
      </div>

      <input
        v-if="modo === 'registro'"
        v-model="form.nombre"
        class="form-control mb-2"
        placeholder="Nombre"
      >

      <select
        v-if="modo === 'registro'"
        v-model="form.rol"
        class="form-select mb-2"
      >
        <option value="Tecnico">Técnico / Recepción</option>
        <option value="Administrador">Administrador</option>
      </select>

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
      >

      <button
        class="btn ts-btn-primary w-100"
        :disabled="cargando"
        @click="entrar"
      >
        {{ cargando ? 'Procesando...' : (modo === 'login' ? 'Entrar' : 'Crear usuario') }}
      </button>

      <small class="text-muted d-block mt-3 text-center">
        Los usuarios se administran de forma segura desde TechSoul OS o Supabase Auth.
      </small>
    </div>
  </div>
</template>
