<script setup>
import { ref, onMounted } from 'vue'
import { supabase } from '../lib/supabase'
import { subirLogo, subirFirma } from '../lib/storage'

const garantias = ref([])
const negocio = ref(null)
const logoArchivo = ref(null)
const subiendoLogo = ref(false)
const firmaArchivo = ref(null)
const subiendoFirma = ref(false)

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
      responsable_nombre: negocio.value.responsable_nombre || '',
      condiciones_generales: negocio.value.condiciones_generales,
      cuota_almacenamiento_dia: Number(negocio.value.cuota_almacenamiento_dia || 0),
      dias_gracia_almacenamiento: Number(negocio.value.dias_gracia_almacenamiento || 30),
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


function seleccionarFirma(event) {
  firmaArchivo.value = event.target.files[0] || null
}

async function subirFirmaNegocio() {
  if (!firmaArchivo.value) {
    alert('Selecciona una imagen de firma')
    return
  }

  subiendoFirma.value = true
  try {
    const url = await subirFirma(firmaArchivo.value)

    const { error } = await supabase
      .from('configuracion_negocio')
      .update({
        firma_url: url,
        responsable_nombre: negocio.value.responsable_nombre || '',
        fecha_actualizacion: new Date().toISOString()
      })
      .eq('id', negocio.value.id)

    if (error) throw error

    negocio.value.firma_url = url
    firmaArchivo.value = null
    alert('Firma actualizada correctamente')
  } catch (error) {
    alert(error.message)
  } finally {
    subiendoFirma.value = false
  }
}

async function eliminarFirmaNegocio() {
  if (!negocio.value?.firma_url) return

  const confirmar = window.confirm('¿Seguro que quieres eliminar la firma configurada?')
  if (!confirmar) return

  const { error } = await supabase
    .from('configuracion_negocio')
    .update({
      firma_url: null,
      fecha_actualizacion: new Date().toISOString()
    })
    .eq('id', negocio.value.id)

  if (error) {
    alert(error.message)
    return
  }

  negocio.value.firma_url = null
  firmaArchivo.value = null
  alert('Firma eliminada')
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

        <div class="col-md-6">
          <label class="form-label small text-muted mb-1">Cuota de almacenamiento (por día, después del periodo de gracia)</label>
          <div class="input-group">
            <span class="input-group-text">$</span>
            <input v-model.number="negocio.cuota_almacenamiento_dia" type="number" min="0" step="0.01" class="form-control" placeholder="Ej. 20">
          </div>
        </div>

        <div class="col-md-6">
          <label class="form-label small text-muted mb-1">Días de gracia antes de cobrar almacenamiento</label>
          <input v-model.number="negocio.dias_gracia_almacenamiento" type="number" min="0" class="form-control" placeholder="30">
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


      <div class="row g-2 mt-2">
        <div class="col-12"><hr class="my-2"></div>
        <div class="col-12">
          <h5 class="mb-1">Firma del responsable</h5>
          <p class="small text-muted mb-2">Esta firma se colocará automáticamente en las notas de venta y órdenes de servicio.</p>
        </div>
        <div class="col-md-6">
          <input v-model="negocio.responsable_nombre" class="form-control" placeholder="Nombre del responsable / técnico">
        </div>
        <div class="col-md-6">
          <input type="file" accept="image/png,image/jpeg,image/webp" class="form-control" @change="seleccionarFirma">
        </div>
        <div class="col-md-4">
          <button class="btn btn-outline-primary w-100" :disabled="subiendoFirma" @click="subirFirmaNegocio">
            {{ subiendoFirma ? 'Subiendo...' : (negocio.firma_url ? 'Cambiar firma' : 'Subir firma') }}
          </button>
        </div>
        <div class="col-md-8 d-flex align-items-center" v-if="negocio.firma_url">
          <div class="border rounded bg-white px-3 py-2 w-100 d-flex align-items-center justify-content-between gap-3">
            <div>
              <div class="small text-muted mb-1">Firma actual</div>
              <img :src="negocio.firma_url" alt="Firma configurada" style="max-height: 72px; max-width: 260px; object-fit: contain">
            </div>
            <button type="button" class="btn btn-sm btn-outline-danger" @click="eliminarFirmaNegocio">
              Eliminar firma
            </button>
          </div>
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
