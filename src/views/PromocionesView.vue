<script setup>
import { computed, onMounted, ref } from 'vue'
import { knowledgeRepository } from '../repositories/knowledge.repository'

const items = ref([])
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const success = ref('')
const search = ref('')
const form = ref(emptyForm())

function emptyForm() {
  return {
    id: null,
    nombre: '',
    descripcion: '',
    condiciones: '',
    fecha_inicio: '',
    fecha_fin: '',
    activo: true
  }
}

const filteredItems = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return items.value
  return items.value.filter(item => [item.nombre, item.descripcion, item.condiciones]
    .some(value => String(value || '').toLowerCase().includes(query)))
})

function normalizeDate(value) {
  return value || null
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    items.value = await knowledgeRepository.list('promociones')
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
    descripcion: item.descripcion || '',
    condiciones: item.condiciones || '',
    fecha_inicio: item.fecha_inicio || '',
    fecha_fin: item.fecha_fin || '',
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
    error.value = 'Escribe el nombre de la promoción.'
    return
  }
  if (!form.value.descripcion.trim()) {
    error.value = 'Escribe una descripción para la promoción.'
    return
  }
  if (form.value.fecha_inicio && form.value.fecha_fin && form.value.fecha_fin < form.value.fecha_inicio) {
    error.value = 'La fecha final no puede ser anterior a la fecha inicial.'
    return
  }

  saving.value = true
  try {
    const payload = {
      nombre: form.value.nombre.trim(),
      descripcion: form.value.descripcion.trim(),
      condiciones: form.value.condiciones.trim(),
      fecha_inicio: normalizeDate(form.value.fecha_inicio),
      fecha_fin: normalizeDate(form.value.fecha_fin),
      activo: form.value.activo
    }
    if (form.value.id) {
      await knowledgeRepository.update('promociones', form.value.id, payload)
      success.value = 'Promoción actualizada correctamente.'
    } else {
      await knowledgeRepository.create('promociones', payload)
      success.value = 'Promoción creada correctamente.'
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
    await knowledgeRepository.update('promociones', item.id, { activo: !item.activo })
    await load()
  } catch (e) {
    error.value = e.message
  }
}

async function remove(item) {
  if (!window.confirm(`¿Eliminar la promoción “${item.nombre}”?`)) return
  error.value = ''
  try {
    await knowledgeRepository.remove('promociones', item.id)
    if (form.value.id === item.id) form.value = emptyForm()
    success.value = 'Promoción eliminada.'
    await load()
  } catch (e) {
    error.value = e.message
  }
}

function statusLabel(item) {
  if (!item.activo) return 'Inactiva'
  const today = new Date().toISOString().slice(0, 10)
  if (item.fecha_inicio && item.fecha_inicio > today) return 'Programada'
  if (item.fecha_fin && item.fecha_fin < today) return 'Finalizada'
  return 'Activa'
}

onMounted(load)
</script>

<template>
  <section class="ts-module-page">
    <header class="ts-module-header">
      <div>
        <span class="ts-eyebrow">Inteligencia</span>
        <h2>Promociones</h2>
        <p>Administra las promociones que podrá consultar y comunicar el agente de TechSoul.</p>
      </div>
    </header>

    <div v-if="error" class="alert alert-danger">{{ error }}</div>
    <div v-if="success" class="alert alert-success">{{ success }}</div>

    <div class="module-grid">
      <div class="ts-panel p-4 form-panel">
        <div class="d-flex align-items-center justify-content-between gap-3 mb-3">
          <h3 class="m-0">{{ form.id ? 'Editar promoción' : 'Nueva promoción' }}</h3>
          <button v-if="form.id" class="btn btn-sm btn-outline-secondary" type="button" @click="cancelEdit">Cancelar</button>
        </div>

        <label class="form-label">Nombre *</label>
        <input v-model="form.nombre" class="form-control mb-3" placeholder="Ej. Cristal templado de regalo">

        <label class="form-label">Descripción *</label>
        <textarea v-model="form.descripcion" class="form-control mb-3" rows="4" placeholder="Describe el beneficio para el cliente"></textarea>

        <label class="form-label">Condiciones</label>
        <textarea v-model="form.condiciones" class="form-control mb-3" rows="3" placeholder="Modelos participantes, vigencia o restricciones"></textarea>

        <div class="row g-3 mb-3">
          <div class="col-md-6">
            <label class="form-label">Fecha inicial</label>
            <input v-model="form.fecha_inicio" type="date" class="form-control">
          </div>
          <div class="col-md-6">
            <label class="form-label">Fecha final</label>
            <input v-model="form.fecha_fin" type="date" class="form-control">
          </div>
        </div>

        <label class="form-check mb-3">
          <input v-model="form.activo" class="form-check-input" type="checkbox">
          <span class="form-check-label">Promoción activa</span>
        </label>

        <button class="btn btn-primary w-100" type="button" :disabled="saving" @click="save">
          {{ saving ? 'Guardando…' : (form.id ? 'Guardar cambios' : 'Crear promoción') }}
        </button>
      </div>

      <div class="ts-panel p-4 list-panel">
        <div class="list-header">
          <div>
            <h3 class="m-0">Promociones registradas</h3>
            <small class="text-muted">{{ items.length }} registro(s)</small>
          </div>
          <input v-model="search" class="form-control search-input" placeholder="Buscar promoción">
        </div>

        <p v-if="loading" class="text-muted py-4">Cargando promociones…</p>
        <div v-else-if="!filteredItems.length" class="empty-state">No hay promociones para mostrar.</div>

        <article v-for="item in filteredItems" :key="item.id" class="record-card">
          <div class="record-main">
            <div class="d-flex align-items-start justify-content-between gap-3">
              <div>
                <h4>{{ item.nombre }}</h4>
                <span class="status-pill" :class="statusLabel(item).toLowerCase()">{{ statusLabel(item) }}</span>
              </div>
              <div class="record-actions">
                <button class="btn btn-sm btn-outline-primary" type="button" @click="edit(item)">Editar</button>
                <button class="btn btn-sm btn-outline-secondary" type="button" @click="toggle(item)">{{ item.activo ? 'Desactivar' : 'Activar' }}</button>
                <button class="btn btn-sm btn-outline-danger" type="button" @click="remove(item)">Eliminar</button>
              </div>
            </div>
            <p>{{ item.descripcion }}</p>
            <p v-if="item.condiciones" class="conditions"><strong>Condiciones:</strong> {{ item.condiciones }}</p>
            <small v-if="item.fecha_inicio || item.fecha_fin" class="text-muted">
              Vigencia: {{ item.fecha_inicio || 'Sin inicio' }} — {{ item.fecha_fin || 'Sin fin' }}
            </small>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
.module-grid{display:grid;grid-template-columns:minmax(300px,390px) minmax(0,1fr);gap:18px;align-items:start}.form-panel{position:sticky;top:86px}.list-header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:18px}.search-input{max-width:280px}.record-card{border:1px solid #e3e9f3;border-radius:14px;padding:18px;margin-bottom:12px;background:#fff}.record-card h4{font-size:1rem;margin:0 0 7px}.record-card p{margin:12px 0 0;white-space:pre-line}.record-actions{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}.conditions{font-size:.92rem;color:#536176}.status-pill{display:inline-flex;padding:4px 9px;border-radius:999px;font-size:.74rem;font-weight:800;background:#e9eef7;color:#4d5d75}.status-pill.activa{background:#dcfce7;color:#166534}.status-pill.programada{background:#dbeafe;color:#1d4ed8}.status-pill.finalizada,.status-pill.inactiva{background:#f1f5f9;color:#64748b}.empty-state{text-align:center;padding:48px 16px;color:#77849a;border:1px dashed #d8e0ec;border-radius:14px}@media(max-width:1050px){.module-grid{grid-template-columns:1fr}.form-panel{position:static}}@media(max-width:700px){.list-header{align-items:stretch;flex-direction:column}.search-input{max-width:none}.record-actions{justify-content:flex-start;margin-top:10px}.record-card .d-flex{display:block!important}}
</style>
