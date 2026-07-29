<script setup>
import { ref, onMounted } from 'vue'
import { supabase } from '../lib/supabase'
import { subirLogo } from '../lib/storage'

const garantias = ref([])
const negocio = ref(null)
const logoArchivo = ref(null)
const subiendoLogo = ref(false)

const formGarantia = ref({
  tipo_servicio: '',
  dias_garantia: 0,
  condiciones: '',
  activo: true
})

async function cargarNegocio() {
  const { data, error } = await supabase
    .from('configuracion_negocio')
    .select('*')
    .order('id')
    .limit(1)
    .single()

  if (!error && data) {
    negocio.value = data
    return
  }

  const { data: nuevo } = await supabase
    .from('configuracion_negocio')
    .insert({ nombre_negocio: 'TechSoul' })
    .select()
    .single()

  negocio.value = nuevo
}

async function guardarNegocio() {
  const { error } = await supabase
    .from('configuracion_negocio')
    .update({
      nombre_negocio: negocio.value.nombre_negocio,
      telefono: negocio.value.telefono,
      whatsapp: negocio.value.whatsapp,
      direccion: negocio.value.direccion,
      correo: negocio.value.correo,
      sitio_web: negocio.value.sitio_web,
      logo_url: negocio.value.logo_url,
      condiciones_generales: negocio.value.condiciones_generales,
      fecha_actualizacion: new Date().toISOString()
    })
    .eq('id', negocio.value.id)

  if (error) {
    alert(error.message)
    return
  }

  alert('Información del negocio guardada')
}

function seleccionarLogo(event) {
  logoArchivo.value = event.target.files[0] || null
}

async function subirLogoNegocio() {
  if (!logoArchivo.value) {
    alert('Selecciona un logo')
    return
  }

  subiendoLogo.value = true

  try {
    const url = await subirLogo(logoArchivo.value)
    negocio.value.logo_url = url
    await guardarNegocio()
  } catch (error) {
    alert(error.message)
  } finally {
    subiendoLogo.value = false
  }
}

async function cargarGarantias() {
  const { data, error } = await supabase
    .from('configuracion_garantias')
    .select('*')
    .order('tipo_servicio')

  if (error) {
    alert(error.message)
    return
  }

  garantias.value = data || []
}

async function guardarGarantia() {
  if (!formGarantia.value.tipo_servicio.trim()) {
    alert('El tipo de servicio es obligatorio')
    return
  }

  const { error } = await supabase
    .from('configuracion_garantias')
    .insert({ ...formGarantia.value })

  if (error) {
    alert(error.message)
    return
  }

  formGarantia.value = {
    tipo_servicio: '',
    dias_garantia: 0,
    condiciones: '',
    activo: true
  }

  await cargarGarantias()
}

async function actualizarGarantia(g) {
  const { error } = await supabase
    .from('configuracion_garantias')
    .update({
      tipo_servicio: g.tipo_servicio,
      dias_garantia: g.dias_garantia,
      condiciones: g.condiciones,
      activo: g.activo
    })
    .eq('id', g.id)

  if (error) {
    alert(error.message)
    return
  }

  alert('Garantía actualizada')
}

onMounted(async () => {
  await Promise.all([cargarNegocio(), cargarGarantias()])
})
</script>

<template>
  <div class="container mt-4 ts-page">
    <h1 class="ts-title">Configuración</h1>
    <p class="ts-subtitle">Personaliza tu negocio, logo, datos y garantías.</p>

    <div class="ts-card p-4 mb-4" v-if="negocio">
      <h4>Información del negocio</h4>

      <div class="row g-2">
        <div class="col-md-6">
          <input v-model="negocio.nombre_negocio" class="form-control" placeholder="Nombre del negocio">
        </div>

        <div class="col-md-3">
          <input v-model="negocio.telefono" class="form-control" placeholder="Teléfono">
        </div>

        <div class="col-md-3">
          <input v-model="negocio.whatsapp" class="form-control" placeholder="WhatsApp">
        </div>

        <div class="col-md-6">
          <input v-model="negocio.correo" class="form-control" placeholder="Correo">
        </div>

        <div class="col-md-6">
          <input v-model="negocio.sitio_web" class="form-control" placeholder="Sitio web / redes">
        </div>

        <div class="col-12">
          <input v-model="negocio.direccion" class="form-control" placeholder="Dirección">
        </div>

        <div class="col-12">
          <textarea v-model="negocio.condiciones_generales" class="form-control" placeholder="Condiciones generales"></textarea>
        </div>

        <div class="col-md-8">
          <input type="file" accept="image/*" class="form-control" @change="seleccionarLogo">
        </div>

        <div class="col-md-4">
          <button class="btn btn-outline-primary w-100" :disabled="subiendoLogo" @click="subirLogoNegocio">
            {{ subiendoLogo ? 'Subiendo...' : 'Subir logo' }}
          </button>
        </div>

        <div class="col-12" v-if="negocio.logo_url">
          <img :src="negocio.logo_url" style="max-height: 90px" class="border rounded bg-white p-2">
        </div>
      </div>

      <button class="btn ts-btn-primary mt-3" @click="guardarNegocio">
        Guardar información
      </button>
    </div>

    <div class="ts-card p-4 mb-4">
      <h4>Nueva garantía</h4>

      <div class="row g-2">
        <div class="col-md-4">
          <input v-model="formGarantia.tipo_servicio" class="form-control" placeholder="Tipo de servicio. Ej. Pantalla OLED">
        </div>

        <div class="col-md-2">
          <input v-model.number="formGarantia.dias_garantia" type="number" class="form-control" placeholder="Días">
        </div>

        <div class="col-md-5">
          <input v-model="formGarantia.condiciones" class="form-control" placeholder="Condiciones de garantía">
        </div>

        <div class="col-md-1">
          <button class="btn ts-btn-primary w-100" @click="guardarGarantia">+</button>
        </div>
      </div>
    </div>

    <div class="ts-card p-4">
      <h4>Garantías configuradas</h4>

      <div class="table-responsive">
        <table class="table table-hover align-middle">
          <thead>
            <tr>
              <th>Servicio</th>
              <th>Días</th>
              <th>Condiciones</th>
              <th>Activo</th>
              <th></th>
            </tr>
          </thead>

          <tbody>
            <tr v-for="g in garantias" :key="g.id">
              <td>
                <input v-model="g.tipo_servicio" class="form-control">
              </td>
              <td style="width: 110px">
                <input v-model.number="g.dias_garantia" type="number" class="form-control">
              </td>
              <td>
                <input v-model="g.condiciones" class="form-control">
              </td>
              <td style="width: 100px">
                <input v-model="g.activo" type="checkbox" class="form-check-input">
              </td>
              <td style="width: 120px">
                <button class="btn btn-sm btn-outline-primary" @click="actualizarGarantia(g)">
                  Guardar
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
