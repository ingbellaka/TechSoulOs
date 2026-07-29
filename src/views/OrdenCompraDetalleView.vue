<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { supabase } from '../lib/supabase'

const route = useRoute()

const orden = ref(null)
const detalle = ref([])
const negocio = ref(null)

function moneda(valor) {
  return Number(valor || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
}

async function cargar() {
  const id = route.params.id

  const [{ data: oc, error }, { data: config }] = await Promise.all([
    supabase
      .from('ordenes_compra')
      .select('*, proveedores(*)')
      .eq('id', id)
      .single(),

    supabase
      .from('configuracion_negocio')
      .select('*')
      .order('id')
      .limit(1)
      .single()
  ])

  if (error) {
    alert(error.message)
    return
  }

  orden.value = oc
  negocio.value = config

  const { data: items } = await supabase
    .from('ordenes_compra_detalle')
    .select('*')
    .eq('orden_compra_id', id)
    .order('id')

  detalle.value = items || []
}

function imprimir() {
  window.print()
}

onMounted(cargar)
</script>

<template>
  <div class="container mt-4 ts-page" v-if="orden">
    <div class="d-flex justify-content-between align-items-center mb-3 no-print">
      <div>
        <h1 class="ts-title mb-0">Orden de compra</h1>
        <p class="ts-subtitle mb-0">{{ orden.folio }}</p>
      </div>

      <div class="d-flex gap-2">
        <router-link to="/compras" class="btn btn-outline-dark">Volver</router-link>
        <button class="btn ts-btn-primary" @click="imprimir">Imprimir / PDF</button>
      </div>
    </div>

    <div class="ts-card p-4 ts-print-area">
      <div class="d-flex justify-content-between align-items-start border-bottom pb-3 mb-3">
        <div>
          <img
            v-if="negocio?.logo_url"
            :src="negocio.logo_url"
            style="max-height: 80px"
            class="mb-2"
          >

          <h2 class="fw-bold mb-0">{{ negocio?.nombre_negocio || 'TechSoul' }}</h2>
          <div class="text-muted">{{ negocio?.direccion }}</div>
          <div class="text-muted">
            WhatsApp: {{ negocio?.whatsapp }} · Tel: {{ negocio?.telefono }}
          </div>
        </div>

        <div class="text-end">
          <h3 class="fw-bold">ORDEN DE COMPRA</h3>
          <h5>{{ orden.folio }}</h5>
          <div>{{ new Date(orden.fecha_orden).toLocaleString('es-MX') }}</div>
          <div><strong>Estado:</strong> {{ orden.estado }}</div>
        </div>
      </div>

      <div class="row g-3 mb-3">
        <div class="col-md-6">
          <div class="ts-card-soft p-3 h-100">
            <h5>Proveedor</h5>
            <p class="mb-1"><strong>Nombre:</strong> {{ orden.proveedores?.nombre || 'Sin proveedor' }}</p>
            <p class="mb-1"><strong>Teléfono:</strong> {{ orden.proveedores?.telefono }}</p>
            <p class="mb-1"><strong>WhatsApp:</strong> {{ orden.proveedores?.whatsapp }}</p>
          </div>
        </div>

        <div class="col-md-6">
          <div class="ts-card-soft p-3 h-100">
            <h5>Datos de compra</h5>
            <p class="mb-1"><strong>Método de pago:</strong> {{ orden.metodo_pago }}</p>
            <p class="mb-1"><strong>Notas:</strong> {{ orden.notas }}</p>
          </div>
        </div>
      </div>

      <table class="table table-bordered">
        <thead>
          <tr>
            <th>Descripción</th>
            <th style="width: 100px">Cantidad</th>
            <th style="width: 150px">Costo unitario</th>
            <th style="width: 150px">Subtotal</th>
          </tr>
        </thead>

        <tbody>
          <tr v-for="item in detalle" :key="item.id">
            <td>{{ item.descripcion }}</td>
            <td>{{ item.cantidad }}</td>
            <td>{{ moneda(item.costo_unitario) }}</td>
            <td>{{ moneda(item.subtotal) }}</td>
          </tr>
        </tbody>
      </table>

      <div class="d-flex justify-content-end">
        <div style="min-width: 280px">
          <div class="d-flex justify-content-between border-bottom py-2">
            <strong>Subtotal</strong>
            <span>{{ moneda(orden.subtotal) }}</span>
          </div>
          <div class="d-flex justify-content-between py-2 fs-4">
            <strong>Total</strong>
            <strong>{{ moneda(orden.total) }}</strong>
          </div>
        </div>
      </div>

      <div class="border-top pt-3 mt-4">
        <small class="text-muted">
          Documento generado desde TechSoul Manager.
        </small>
      </div>
    </div>
  </div>
</template>
