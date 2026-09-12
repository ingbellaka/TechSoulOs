<script setup>
import { ref, onMounted, computed } from 'vue'
import { supabase } from '../lib/supabase'

const clientes = ref([])
const equipos = ref([])
const busqueda = ref('')
const tipoFiltro = ref('Todos')
const mostrarFormulario = ref(false)
const guardando = ref(false)
const cargando = ref(true)

const formInicial = () => ({
  cliente_id: '',
  tipo_equipo: 'Celular',
  marca: '',
  modelo: '',
  color: '',
  imei_serie: '',
  codigo_bloqueo: '',
  observaciones: ''
})
const form = ref(formInicial())

const tipos = ['Todos', 'Celular', 'Laptop', 'Tablet', 'iPad', 'Apple Watch', 'Impresora', 'PC', 'Otro']

const equiposFiltrados = computed(() => {
  const termino = busqueda.value.trim().toLowerCase()
  return equipos.value.filter((equipo) => {
    const coincideTipo = tipoFiltro.value === 'Todos' || equipo.tipo_equipo === tipoFiltro.value
    const texto = [
      equipo.clientes?.nombre,
      equipo.clientes?.telefono,
      equipo.tipo_equipo,
      equipo.marca,
      equipo.modelo,
      equipo.color,
      equipo.imei_serie,
      equipo.observaciones
    ].filter(Boolean).join(' ').toLowerCase()
    return coincideTipo && (!termino || texto.includes(termino))
  })
})

const clientesConEquipos = computed(() => new Set(equipos.value.map(e => e.cliente_id)).size)
const equiposConSerie = computed(() => equipos.value.filter(e => e.imei_serie).length)
const celulares = computed(() => equipos.value.filter(e => e.tipo_equipo === 'Celular').length)

function iniciales(nombre = '') {
  return nombre.split(/\s+/).filter(Boolean).map(p => p[0]).join('').slice(0, 2).toUpperCase() || 'EQ'
}

function descripcionEquipo(equipo) {
  return [equipo.marca, equipo.modelo, equipo.color].filter(Boolean).join(' ') || equipo.tipo_equipo
}

async function cargarDatos() {
  cargando.value = true
  const [{ data: dataClientes, error: errorClientes }, { data: dataEquipos, error: errorEquipos }] = await Promise.all([
    supabase.from('clientes').select('*').order('nombre'),
    supabase.from('equipos').select('*, clientes(nombre, telefono)').order('id', { ascending: false })
  ])

  if (errorClientes || errorEquipos) alert(errorClientes?.message || errorEquipos?.message)
  clientes.value = dataClientes || []
  equipos.value = dataEquipos || []
  cargando.value = false
}

async function guardarEquipo() {
  if (!form.value.cliente_id || !form.value.tipo_equipo || !form.value.modelo.trim()) {
    alert('Cliente, tipo y modelo son obligatorios')
    return
  }

  guardando.value = true
  const payload = {
    ...form.value,
    cliente_id: Number(form.value.cliente_id),
    marca: form.value.marca.trim(),
    modelo: form.value.modelo.trim(),
    color: form.value.color.trim(),
    imei_serie: form.value.imei_serie.trim(),
    codigo_bloqueo: form.value.codigo_bloqueo.trim(),
    observaciones: form.value.observaciones.trim()
  }
  const { error } = await supabase.from('equipos').insert(payload)
  guardando.value = false

  if (error) return alert(error.message)
  form.value = formInicial()
  mostrarFormulario.value = false
  await cargarDatos()
}

onMounted(cargarDatos)
</script>

<template>
  <div class="ts-module-page">
    <header class="ts-module-header">
      <div>
        <span class="ts-eyebrow">Operación</span>
        <h2>Equipos</h2>
        <p>Historial organizado de los dispositivos que ingresan al taller.</p>
      </div>
      <button class="ts-action-primary" type="button" @click="mostrarFormulario = !mostrarFormulario">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
        {{ mostrarFormulario ? 'Cerrar formulario' : 'Registrar equipo' }}
      </button>
    </header>

    <section class="ts-metric-strip ts-metric-strip-four">
      <article class="ts-mini-metric"><span>Equipos registrados</span><strong>{{ equipos.length }}</strong><small>Historial total</small></article>
      <article class="ts-mini-metric"><span>Clientes atendidos</span><strong>{{ clientesConEquipos }}</strong><small>Con al menos un equipo</small></article>
      <article class="ts-mini-metric"><span>Celulares</span><strong>{{ celulares }}</strong><small>Principal categoría</small></article>
      <article class="ts-mini-metric"><span>Con IMEI o serie</span><strong>{{ equiposConSerie }}</strong><small>Identificación registrada</small></article>
    </section>

    <section v-if="mostrarFormulario" class="ts-panel ts-form-panel">
      <div class="ts-panel-heading">
        <div><span class="ts-panel-kicker">Nuevo registro</span><h3>Datos del equipo</h3></div>
        <span class="ts-required-note">* Campos obligatorios</span>
      </div>

      <div class="ts-smart-form">
        <label class="ts-field ts-field-wide">
          <span>Cliente *</span>
          <select v-model="form.cliente_id" class="ts-filter-select ts-select-full">
            <option value="">Selecciona un cliente</option>
            <option v-for="cliente in clientes" :key="cliente.id" :value="cliente.id">{{ cliente.nombre }} · {{ cliente.telefono }}</option>
          </select>
        </label>
        <label class="ts-field"><span>Tipo *</span><select v-model="form.tipo_equipo" class="ts-filter-select ts-select-full"><option v-for="tipo in tipos.slice(1)" :key="tipo">{{ tipo }}</option></select></label>
        <label class="ts-field"><span>Marca</span><input v-model="form.marca" placeholder="Apple, Samsung…"></label>
        <label class="ts-field"><span>Modelo *</span><input v-model="form.modelo" placeholder="iPhone 14 Pro"></label>
        <label class="ts-field"><span>Color</span><input v-model="form.color" placeholder="Negro"></label>
        <label class="ts-field ts-field-wide"><span>IMEI / Número de serie</span><input v-model="form.imei_serie" placeholder="Identificador del equipo"></label>
        <label class="ts-field ts-field-wide"><span>Código de bloqueo</span><input v-model="form.codigo_bloqueo" placeholder="Contraseña, PIN o patrón"></label>
        <label class="ts-field ts-field-full"><span>Observaciones</span><textarea v-model="form.observaciones" rows="3" placeholder="Condición física, accesorios recibidos o detalles relevantes"></textarea></label>
        <div class="ts-form-actions ts-field-full">
          <button class="ts-action-secondary" type="button" @click="form = formInicial(); mostrarFormulario = false">Cancelar</button>
          <button class="ts-action-primary" type="button" :disabled="guardando" @click="guardarEquipo">{{ guardando ? 'Guardando…' : 'Guardar equipo' }}</button>
        </div>
      </div>
    </section>

    <section class="ts-panel">
      <div class="ts-orders-toolbar">
        <div class="ts-search-control ts-search-grow">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <input v-model="busqueda" placeholder="Buscar por cliente, modelo, IMEI o serie">
        </div>
        <select v-model="tipoFiltro" class="ts-filter-select"><option v-for="tipo in tipos" :key="tipo">{{ tipo }}</option></select>
      </div>

      <div v-if="cargando" class="ts-empty-state"><span class="ts-spinner"></span><p>Cargando equipos…</p></div>
      <div v-else-if="!equiposFiltrados.length" class="ts-empty-state">
        <span class="ts-empty-icon"><svg viewBox="0 0 24 24"><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/></svg></span>
        <strong>No encontramos equipos</strong><p>Prueba con otro término o registra el primer dispositivo.</p>
      </div>
      <div v-else class="ts-device-grid">
        <article v-for="equipo in equiposFiltrados" :key="equipo.id" class="ts-device-card-v2">
          <div class="ts-device-card-head">
            <span class="ts-device-avatar">{{ iniciales(equipo.clientes?.nombre) }}</span>
            <div><span class="ts-device-type">{{ equipo.tipo_equipo }}</span><h3>{{ descripcionEquipo(equipo) }}</h3><small>{{ equipo.clientes?.nombre || 'Cliente sin nombre' }}</small></div>
          </div>
          <dl class="ts-device-details">
            <div v-if="equipo.clientes?.telefono"><dt>Teléfono</dt><dd>{{ equipo.clientes.telefono }}</dd></div>
            <div v-if="equipo.imei_serie"><dt>IMEI / Serie</dt><dd>{{ equipo.imei_serie }}</dd></div>
            <div><dt>ID interno</dt><dd>#{{ equipo.id }}</dd></div>
          </dl>
          <p v-if="equipo.observaciones" class="ts-device-note">{{ equipo.observaciones }}</p>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
@media(max-width:600px){.ts-device-grid{padding:12px!important;gap:10px!important}.ts-device-card-v2{padding:15px!important;border-radius:15px}.ts-device-card-head{align-items:flex-start}.ts-device-card-head h3{white-space:normal!important;overflow-wrap:anywhere;line-height:1.25;font-size:1rem!important}.ts-device-card-head small{font-size:.82rem!important}.ts-device-details{margin-top:12px!important;gap:7px!important}.ts-device-details div{align-items:flex-start}.ts-device-details dt{font-size:.76rem!important}.ts-device-details dd{max-width:62%!important;white-space:normal!important;overflow-wrap:anywhere;font-size:.78rem!important}.ts-device-note{font-size:.8rem!important}.ts-metric-strip-four{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
</style>