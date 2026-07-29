<script setup>
import { computed, onMounted, ref } from 'vue'
import { supabase } from '../lib/supabase'

const clientes = ref([])
const cargando = ref(false)
const cargandoLista = ref(true)
const mostrarFormulario = ref(false)
const busqueda = ref('')
const form = ref({
  nombre: '',
  telefono: '',
  whatsapp: '',
  correo: '',
  notas: ''
})

const filtrados = computed(() => {
  const termino = busqueda.value.trim().toLowerCase()
  if (!termino) return clientes.value

  return clientes.value.filter((cliente) =>
    [cliente.nombre, cliente.telefono, cliente.whatsapp, cliente.correo, cliente.notas]
      .filter(Boolean)
      .some((valor) => String(valor).toLowerCase().includes(termino))
  )
})

const clientesConWhatsapp = computed(() =>
  clientes.value.filter((cliente) => cliente.whatsapp || cliente.telefono).length
)

const clientesConCorreo = computed(() =>
  clientes.value.filter((cliente) => cliente.correo).length
)

function iniciales(nombre = '') {
  return nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join('') || 'CL'
}

function whatsappLink(cliente) {
  const telefono = String(cliente.whatsapp || cliente.telefono || '').replace(/\D/g, '')
  if (!telefono) return '#'
  const numero = telefono.startsWith('52') ? telefono : `52${telefono}`
  return `https://wa.me/${numero}`
}

async function cargarClientes() {
  cargandoLista.value = true
  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .order('id', { ascending: false })

  cargandoLista.value = false

  if (error) {
    alert(error.message)
    return
  }

  clientes.value = data || []
}

async function guardarCliente() {
  if (!form.value.nombre.trim()) {
    alert('El nombre es obligatorio')
    return
  }

  cargando.value = true
  const payload = Object.fromEntries(
    Object.entries(form.value).map(([clave, valor]) => [clave, valor?.trim?.() || null])
  )
  const { error } = await supabase.from('clientes').insert(payload)
  cargando.value = false

  if (error) {
    alert(error.message)
    return
  }

  form.value = { nombre: '', telefono: '', whatsapp: '', correo: '', notas: '' }
  mostrarFormulario.value = false
  await cargarClientes()
}

onMounted(cargarClientes)
</script>

<template>
  <section class="ts-module-page">
    <header class="ts-module-header">
      <div>
        <span class="ts-eyebrow">Relación con clientes</span>
        <h2>Clientes</h2>
        <p>Administra contactos, conversaciones e historial de servicio.</p>
      </div>

      <button class="ts-action-primary" type="button" @click="mostrarFormulario = !mostrarFormulario">
        <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
        {{ mostrarFormulario ? 'Cerrar formulario' : 'Nuevo cliente' }}
      </button>
    </header>

    <div class="ts-metric-strip">
      <article class="ts-mini-metric">
        <span>Total de clientes</span>
        <strong>{{ clientes.length }}</strong>
        <small>Base registrada</small>
      </article>
      <article class="ts-mini-metric">
        <span>Contacto directo</span>
        <strong>{{ clientesConWhatsapp }}</strong>
        <small>Con teléfono o WhatsApp</small>
      </article>
      <article class="ts-mini-metric">
        <span>Correo registrado</span>
        <strong>{{ clientesConCorreo }}</strong>
        <small>Disponibles para seguimiento</small>
      </article>
    </div>

    <Transition name="ts-slide-fade">
      <article v-if="mostrarFormulario" class="ts-panel ts-form-panel">
        <div class="ts-panel-heading">
          <div>
            <span class="ts-panel-kicker">Nuevo registro</span>
            <h3>Agregar cliente</h3>
          </div>
          <span class="ts-required-note">* Campo obligatorio</span>
        </div>

        <form class="ts-smart-form" @submit.prevent="guardarCliente">
          <label class="ts-field ts-field-wide">
            <span>Nombre completo *</span>
            <input v-model="form.nombre" type="text" placeholder="Ej. Juan Pérez" autocomplete="name">
          </label>

          <label class="ts-field">
            <span>Teléfono</span>
            <input v-model="form.telefono" type="tel" placeholder="667 000 0000" autocomplete="tel">
          </label>

          <label class="ts-field">
            <span>WhatsApp</span>
            <input v-model="form.whatsapp" type="tel" placeholder="667 000 0000">
          </label>

          <label class="ts-field ts-field-wide">
            <span>Correo electrónico</span>
            <input v-model="form.correo" type="email" placeholder="cliente@correo.com" autocomplete="email">
          </label>

          <label class="ts-field ts-field-full">
            <span>Notas</span>
            <textarea v-model="form.notas" rows="3" placeholder="Preferencias, referencias o información importante"></textarea>
          </label>

          <div class="ts-form-actions ts-field-full">
            <button class="ts-action-secondary" type="button" @click="mostrarFormulario = false">Cancelar</button>
            <button class="ts-action-primary" type="submit" :disabled="cargando">
              {{ cargando ? 'Guardando...' : 'Guardar cliente' }}
            </button>
          </div>
        </form>
      </article>
    </Transition>

    <article class="ts-panel">
      <div class="ts-panel-toolbar">
        <div>
          <span class="ts-panel-kicker">Directorio</span>
          <h3>Clientes registrados</h3>
        </div>

        <label class="ts-search-control">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input v-model="busqueda" type="search" placeholder="Buscar nombre, teléfono o correo">
        </label>
      </div>

      <div v-if="cargandoLista" class="ts-empty-state">
        <div class="ts-spinner"></div>
        <strong>Cargando clientes</strong>
        <p>Estamos preparando tu directorio.</p>
      </div>

      <div v-else-if="filtrados.length" class="ts-customer-grid">
        <article v-for="cliente in filtrados" :key="cliente.id" class="ts-customer-card">
          <div class="ts-customer-main">
            <div class="ts-customer-avatar">{{ iniciales(cliente.nombre) }}</div>
            <div class="ts-customer-copy">
              <strong>{{ cliente.nombre }}</strong>
              <span>Cliente #{{ cliente.id }}</span>
            </div>
            <span class="ts-status-pill ts-status-active">Activo</span>
          </div>

          <dl class="ts-contact-list">
            <div>
              <dt>Teléfono</dt>
              <dd>{{ cliente.telefono || 'Sin registrar' }}</dd>
            </div>
            <div>
              <dt>WhatsApp</dt>
              <dd>{{ cliente.whatsapp || 'Sin registrar' }}</dd>
            </div>
            <div>
              <dt>Correo</dt>
              <dd>{{ cliente.correo || 'Sin registrar' }}</dd>
            </div>
          </dl>

          <p v-if="cliente.notas" class="ts-customer-note">{{ cliente.notas }}</p>

          <footer class="ts-card-actions">
            <a
              class="ts-icon-action"
              :class="{ disabled: !(cliente.whatsapp || cliente.telefono) }"
              :href="whatsappLink(cliente)"
              target="_blank"
              rel="noopener"
            >
              <svg viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" /></svg>
              WhatsApp
            </a>
            <router-link class="ts-text-action" to="/nueva-orden">Crear orden</router-link>
          </footer>
        </article>
      </div>

      <div v-else class="ts-empty-state">
        <div class="ts-empty-icon">
          <svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></svg>
        </div>
        <strong>No encontramos clientes</strong>
        <p>{{ busqueda ? 'Prueba con otro término de búsqueda.' : 'Agrega tu primer cliente para comenzar.' }}</p>
        <button v-if="!busqueda" class="ts-action-primary" type="button" @click="mostrarFormulario = true">Agregar cliente</button>
      </div>
    </article>
  </section>
</template>
