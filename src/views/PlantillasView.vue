<script setup>
import { computed, onMounted, ref } from 'vue'
import { knowledgeRepository } from '../repositories/knowledge.repository'

const items = ref([])
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const success = ref('')
const search = ref('')
const copiedId = ref(null)
const form = ref(emptyForm())

function emptyForm() {
  return { id: null, nombre: '', contenido: '', categoria: 'General', palabras_clave: [], activo: true }
}

const keywordsText = computed({
  get: () => Array.isArray(form.value.palabras_clave) ? form.value.palabras_clave.join(', ') : '',
  set: value => { form.value.palabras_clave = value.split(',').map(x => x.trim()).filter(Boolean) }
})

const filteredItems = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return items.value
  return items.value.filter(item => [item.nombre, item.contenido, item.categoria, ...(item.palabras_clave || [])]
    .some(value => String(value || '').toLowerCase().includes(query)))
})

async function load() {
  loading.value = true
  error.value = ''
  try {
    items.value = await knowledgeRepository.list('plantillas')
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

function edit(item) {
  form.value = {
    id: item.id,
    nombre: item.nombre || '',
    contenido: item.contenido || '',
    categoria: item.categoria || 'General',
    palabras_clave: Array.isArray(item.palabras_clave) ? [...item.palabras_clave] : [],
    activo: item.activo !== false
  }
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function cancelEdit() {
  form.value = emptyForm()
  error.value = ''
  success.value = ''
}

async function save() {
  error.value = ''
  success.value = ''
  if (!form.value.nombre.trim()) {
    error.value = 'Escribe el nombre de la plantilla.'
    return
  }
  if (!form.value.contenido.trim()) {
    error.value = 'Escribe el contenido de la respuesta.'
    return
  }

  saving.value = true
  try {
    const payload = {
      nombre: form.value.nombre.trim(),
      contenido: form.value.contenido.trim(),
      categoria: form.value.categoria.trim() || 'General',
      palabras_clave: form.value.palabras_clave,
      activo: form.value.activo
    }
    if (form.value.id) {
      await knowledgeRepository.update('plantillas', form.value.id, payload)
      success.value = 'Plantilla actualizada correctamente.'
    } else {
      await knowledgeRepository.create('plantillas', payload)
      success.value = 'Plantilla creada correctamente.'
    }
    form.value = emptyForm()
    await load()
  } catch (e) {
    error.value = e.message
  } finally {
    saving.value = false
  }
}

async function toggle(item) {
  error.value = ''
  try {
    await knowledgeRepository.update('plantillas', item.id, { activo: !item.activo })
    await load()
  } catch (e) {
    error.value = e.message
  }
}

async function remove(item) {
  if (!window.confirm(`¿Eliminar la plantilla “${item.nombre}”?`)) return
  error.value = ''
  try {
    await knowledgeRepository.remove('plantillas', item.id)
    if (form.value.id === item.id) form.value = emptyForm()
    success.value = 'Plantilla eliminada.'
    await load()
  } catch (e) {
    error.value = e.message
  }
}

async function copy(item) {
  try {
    await navigator.clipboard.writeText(item.contenido || '')
    copiedId.value = item.id
    setTimeout(() => { if (copiedId.value === item.id) copiedId.value = null }, 1800)
  } catch {
    error.value = 'No se pudo copiar la plantilla. Selecciona el texto manualmente.'
  }
}

onMounted(load)
</script>

<template>
  <section class="ts-module-page">
    <header class="ts-module-header">
      <div>
        <span class="ts-eyebrow">Inteligencia</span>
        <h2>Plantillas de respuesta</h2>
        <p>Crea mensajes reutilizables para cotizaciones, diagnósticos, garantías y atención por WhatsApp.</p>
      </div>
    </header>

    <div v-if="error" class="alert alert-danger">{{ error }}</div>
    <div v-if="success" class="alert alert-success">{{ success }}</div>

    <div class="module-grid">
      <div class="ts-panel p-4 form-panel">
        <div class="d-flex align-items-center justify-content-between gap-3 mb-3">
          <h3 class="m-0">{{ form.id ? 'Editar plantilla' : 'Nueva plantilla' }}</h3>
          <button v-if="form.id" class="btn btn-sm btn-outline-secondary" type="button" @click="cancelEdit">Cancelar</button>
        </div>

        <label class="form-label">Nombre *</label>
        <input v-model="form.nombre" class="form-control mb-3" placeholder="Ej. Equipo mojado — respuesta inicial">

        <label class="form-label">Categoría</label>
        <input v-model="form.categoria" class="form-control mb-3" placeholder="Ej. Diagnóstico">

        <label class="form-label">Contenido *</label>
        <textarea v-model="form.contenido" class="form-control mb-3" rows="9" placeholder="Hola, con gusto revisamos tu equipo..."></textarea>

        <label class="form-label">Palabras clave</label>
        <input v-model="keywordsText" class="form-control mb-2" placeholder="mojado, humedad, no enciende">
        <small class="text-muted d-block mb-3">Sepáralas con comas para que el agente encuentre la respuesta.</small>

        <label class="form-check mb-3">
          <input v-model="form.activo" class="form-check-input" type="checkbox">
          <span class="form-check-label">Plantilla activa</span>
        </label>

        <button class="btn btn-primary w-100" type="button" :disabled="saving" @click="save">
          {{ saving ? 'Guardando…' : (form.id ? 'Guardar cambios' : 'Crear plantilla') }}
        </button>
      </div>

      <div class="ts-panel p-4 list-panel">
        <div class="list-header">
          <div>
            <h3 class="m-0">Plantillas registradas</h3>
            <small class="text-muted">{{ items.length }} registro(s)</small>
          </div>
          <input v-model="search" class="form-control search-input" placeholder="Buscar por texto o palabra clave">
        </div>

        <p v-if="loading" class="text-muted py-4">Cargando plantillas…</p>
        <div v-else-if="!filteredItems.length" class="empty-state">No hay plantillas para mostrar.</div>

        <article v-for="item in filteredItems" :key="item.id" class="record-card">
          <div class="d-flex align-items-start justify-content-between gap-3">
            <div>
              <div class="d-flex align-items-center gap-2 flex-wrap">
                <h4>{{ item.nombre }}</h4>
                <span class="category-pill">{{ item.categoria || 'General' }}</span>
                <span class="status-dot" :class="{ inactive: !item.activo }">{{ item.activo ? 'Activa' : 'Inactiva' }}</span>
              </div>
            </div>
            <div class="record-actions">
              <button class="btn btn-sm btn-outline-success" type="button" @click="copy(item)">{{ copiedId === item.id ? 'Copiada' : 'Copiar' }}</button>
              <button class="btn btn-sm btn-outline-primary" type="button" @click="edit(item)">Editar</button>
              <button class="btn btn-sm btn-outline-secondary" type="button" @click="toggle(item)">{{ item.activo ? 'Desactivar' : 'Activar' }}</button>
              <button class="btn btn-sm btn-outline-danger" type="button" @click="remove(item)">Eliminar</button>
            </div>
          </div>
          <p class="template-content">{{ item.contenido }}</p>
          <div v-if="item.palabras_clave?.length" class="keyword-row">
            <span v-for="keyword in item.palabras_clave" :key="keyword">{{ keyword }}</span>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
.module-grid{display:grid;grid-template-columns:minmax(320px,420px) minmax(0,1fr);gap:18px;align-items:start}.form-panel{position:sticky;top:86px}.list-header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:18px}.search-input{max-width:310px}.record-card{border:1px solid #e3e9f3;border-radius:14px;padding:18px;margin-bottom:12px;background:#fff}.record-card h4{font-size:1rem;margin:0}.record-actions{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}.template-content{margin:14px 0 0;white-space:pre-line;color:#3e4b5f}.category-pill{padding:3px 8px;border-radius:999px;background:#e8efff;color:#2855ad;font-size:.73rem;font-weight:800}.status-dot{font-size:.75rem;font-weight:800;color:#16814b}.status-dot.inactive{color:#7b8799}.keyword-row{display:flex;flex-wrap:wrap;gap:6px;margin-top:14px}.keyword-row span{padding:4px 8px;border-radius:8px;background:#f1f5f9;color:#536176;font-size:.75rem}.empty-state{text-align:center;padding:48px 16px;color:#77849a;border:1px dashed #d8e0ec;border-radius:14px}@media(max-width:1050px){.module-grid{grid-template-columns:1fr}.form-panel{position:static}}@media(max-width:700px){.list-header{align-items:stretch;flex-direction:column}.search-input{max-width:none}.record-actions{justify-content:flex-start;margin-top:10px}.record-card>.d-flex{display:block!important}}
</style>
