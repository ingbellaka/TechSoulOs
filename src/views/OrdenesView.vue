<script setup>
import { computed, onMounted, ref } from 'vue'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/auth'

const ordenes = ref([])
const filtro = ref('')
const estadoSeleccionado = ref('Todas')
const cargando = ref(true)
const authStore = useAuthStore()
const menuAbierto = ref(null)
const ordenAccion = ref(null)
const modalAccion = ref(null)
const procesandoAccion = ref(false)
const ordenPago = ref(null)
const montoPago = ref('')
const metodoPago = ref('Efectivo')
const referenciaPago = ref('')
const errorPago = ref('')
const procesandoPago = ref(false)

const esAdministrador = computed(() => authStore.isAdmin)

const estados = [
  'Todas',
  'Recibido',
  'Diagnóstico',
  'Esperando autorización',
  'Esperando pieza',
  'En reparación',
  'Listo',
  'Entregado',
  'Garantía',
  'Cancelado'
]

const ordenesFiltradas = computed(() => {
  const termino = filtro.value.trim().toLowerCase()
  return ordenes.value.filter((orden) => {
    const coincideEstado = estadoSeleccionado.value === 'Todas' || orden.estado === estadoSeleccionado.value
    const coincideTexto = !termino || [
      orden.folio,
      orden.clientes?.nombre,
      orden.clientes?.telefono,
      orden.equipos?.tipo_equipo,
      orden.equipos?.marca,
      orden.equipos?.modelo,
      orden.equipos?.imei_serie,
      orden.falla_reportada
    ].filter(Boolean).some((valor) => String(valor).toLowerCase().includes(termino))

    return coincideEstado && coincideTexto
  })
})

const resumen = computed(() => ({
  activas: ordenes.value.filter((orden) => !['Entregado', 'Cancelado'].includes(orden.estado)).length,
  listas: ordenes.value.filter((orden) => orden.estado === 'Listo').length,
  esperando: ordenes.value.filter((orden) => ['Esperando autorización', 'Esperando pieza'].includes(orden.estado)).length,
  porCobrar: ordenes.value.reduce((total, orden) => total + saldoOrden(orden), 0)
}))

function moneda(valor) {
  return Number(valor || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
}

function estadoSlug(estado = '') {
  return estado
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
}

function totalOrden(orden) {
  return Math.max(0, Number(orden?.costo_total || 0))
}

function pagadoOrden(orden) {
  return Math.max(0, Number(orden?.anticipo || 0))
}

function saldoOrden(orden) {
  return Math.max(0, totalOrden(orden) - pagadoOrden(orden))
}

function porcentajePago(orden) {
  const total = totalOrden(orden)
  if (!total) return 0
  return Math.min(100, Math.round((pagadoOrden(orden) / total) * 100))
}

function whatsappLink(orden) {
  const telefono = orden.clientes?.whatsapp || orden.clientes?.telefono || ''
  const limpio = String(telefono).replace(/\D/g, '')
  const numero = limpio.startsWith('52') ? limpio : `52${limpio}`
  const mensaje = `Hola ${orden.clientes?.nombre || ''}, te escribimos de TechSoul. Tu equipo ${orden.equipos?.marca || ''} ${orden.equipos?.modelo || ''} está en estado: ${orden.estado}. Folio: ${orden.folio}. Saldo pendiente: ${moneda(saldoOrden(orden))}.`
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`
}

async function registrarHistorial(ordenId, tipo, titulo, descripcion, estadoAnterior = null, estadoNuevo = null) {
  const { data: auth } = await supabase.auth.getUser()
  const { error } = await supabase.from('orden_historial').insert({
    orden_id: ordenId,
    tipo,
    titulo,
    descripcion,
    estado_anterior: estadoAnterior,
    estado_nuevo: estadoNuevo,
    usuario_id: auth.user?.id || null
  })
  if (error) console.warn('No se pudo registrar el historial:', error.message)
}

async function cargarOrdenes() {
  cargando.value = true
  const { data, error } = await supabase
    .from('ordenes')
    .select('*, clientes(nombre, telefono, whatsapp), equipos(tipo_equipo, marca, modelo, color, imei_serie)')
    .order('id', { ascending: false })

  cargando.value = false

  if (error) {
    alert(error.message)
    return
  }

  ordenes.value = (data || []).map((orden) => ({ ...orden, _estadoAnterior: orden.estado }))
}

async function actualizarEstado(orden) {
  const estadoAnterior = orden._estadoAnterior || 'Recibido'
  const { error } = await supabase.from('ordenes').update({ estado: orden.estado }).eq('id', orden.id)
  if (error) return alert(error.message)
  await registrarHistorial(
    orden.id,
    'estado',
    `Estado cambiado a ${orden.estado}`,
    `La orden avanzó de “${estadoAnterior}” a “${orden.estado}”.`,
    estadoAnterior,
    orden.estado
  )
  orden._estadoAnterior = orden.estado
}

async function registrarGasto(orden) {
  const concepto = prompt('Concepto del gasto. Ejemplo: Pantalla iPhone 13')
  if (!concepto) return
  const monto = Number(prompt('Monto del gasto'))
  if (!monto) return

  const { error } = await supabase.from('movimientos_caja').insert({
    tipo: 'Salida',
    concepto,
    monto,
    metodo_pago: 'Pendiente por definir',
    referencia_tipo: 'orden',
    referencia_id: orden.id,
    notas: orden.folio
  })

  if (error) return alert(error.message)
  await registrarHistorial(orden.id, 'gasto', 'Gasto registrado', `${concepto}: ${moneda(monto)}.`)
  alert('Gasto registrado')
}

function abrirPago(orden) {
  const saldo = saldoOrden(orden)
  if (saldo <= 0) {
    alert('Esta orden ya está liquidada.')
    return
  }
  ordenPago.value = orden
  montoPago.value = ''
  metodoPago.value = 'Efectivo'
  referenciaPago.value = ''
  errorPago.value = ''
}

function cerrarPago() {
  if (procesandoPago.value) return
  ordenPago.value = null
  montoPago.value = ''
  errorPago.value = ''
}

function validarMontoPago() {
  const monto = Number(montoPago.value)
  const saldo = saldoOrden(ordenPago.value)
  if (!Number.isFinite(monto) || monto <= 0) {
    errorPago.value = 'Ingresa un monto mayor a $0.00.'
    return false
  }
  if (monto > saldo) {
    errorPago.value = `El monto excede el saldo pendiente de ${moneda(saldo)}.`
    return false
  }
  errorPago.value = ''
  return true
}

async function registrarLiquidacion() {
  if (!ordenPago.value || !validarMontoPago()) return

  procesandoPago.value = true
  const orden = ordenPago.value
  const monto = Number(montoPago.value)
  const nuevoAnticipo = pagadoOrden(orden) + monto
  const nuevoSaldo = Math.max(0, totalOrden(orden) - nuevoAnticipo)

  const { error: errorOrden } = await supabase
    .from('ordenes')
    .update({ anticipo: nuevoAnticipo })
    .eq('id', orden.id)

  if (errorOrden) {
    procesandoPago.value = false
    errorPago.value = errorOrden.message
    return
  }

  const { error: errorCaja } = await supabase.from('movimientos_caja').insert({
    tipo: 'Entrada',
    concepto: `Pago orden ${orden.folio}`,
    monto,
    metodo_pago: metodoPago.value,
    referencia_tipo: 'orden',
    referencia_id: orden.id,
    notas: [orden.clientes?.nombre, referenciaPago.value].filter(Boolean).join(' · ')
  })

  if (errorCaja) {
    await supabase.from('ordenes').update({ anticipo: pagadoOrden(orden) }).eq('id', orden.id)
    procesandoPago.value = false
    errorPago.value = `No se pudo registrar el movimiento en caja: ${errorCaja.message}`
    return
  }

  await registrarHistorial(
    orden.id,
    'pago',
    nuevoSaldo === 0 ? 'Orden liquidada' : 'Pago registrado',
    `Se registró un pago de ${moneda(monto)} mediante ${metodoPago.value}. Saldo restante: ${moneda(nuevoSaldo)}.`
  )

  procesandoPago.value = false
  cerrarPago()
  await cargarOrdenes()
}


function alternarMenu(id) {
  menuAbierto.value = menuAbierto.value === id ? null : id
}

function abrirConfirmacion(orden, accion) {
  menuAbierto.value = null
  ordenAccion.value = orden
  modalAccion.value = accion
}

function cerrarConfirmacion() {
  if (procesandoAccion.value) return
  ordenAccion.value = null
  modalAccion.value = null
}

async function cancelarOrden() {
  if (!ordenAccion.value) return
  procesandoAccion.value = true
  const { error } = await supabase
    .from('ordenes')
    .update({ estado: 'Cancelado' })
    .eq('id', ordenAccion.value.id)

  procesandoAccion.value = false
  if (error) return alert(error.message)
  await registrarHistorial(ordenAccion.value.id, 'estado', 'Orden cancelada', 'La orden fue cancelada sin eliminar su historial.', ordenAccion.value.estado, 'Cancelado')
  await cargarOrdenes()
  cerrarConfirmacion()
}

async function eliminarDefinitivamente() {
  if (!ordenAccion.value || !esAdministrador.value) return
  procesandoAccion.value = true
  const id = ordenAccion.value.id

  const eliminaciones = [
    supabase.from('firmas_orden').delete().eq('orden_id', id),
    supabase.from('checklist_orden').delete().eq('orden_id', id),
    supabase.from('evidencias').delete().eq('orden_id', id),
    supabase.from('garantias').delete().eq('orden_id', id),
    supabase.from('movimientos_caja').delete().eq('referencia_tipo', 'orden').eq('referencia_id', id)
  ]

  const resultados = await Promise.all(eliminaciones)
  const errorRelacionado = resultados.find((resultado) => resultado.error)?.error
  if (errorRelacionado) {
    procesandoAccion.value = false
    return alert(`No se pudieron eliminar los registros relacionados: ${errorRelacionado.message}`)
  }

  const { error } = await supabase.from('ordenes').delete().eq('id', id)
  procesandoAccion.value = false
  if (error) return alert(error.message)

  await cargarOrdenes()
  cerrarConfirmacion()
}

async function confirmarAccion() {
  if (modalAccion.value === 'cancelar') return cancelarOrden()
  if (modalAccion.value === 'eliminar') return eliminarDefinitivamente()
}

onMounted(async () => {
  if (!authStore.perfil && authStore.user) await authStore.cargarPerfil()
  await cargarOrdenes()
})
</script>

<template>
  <section class="ts-module-page">
    <header class="ts-module-header">
      <div>
        <span class="ts-eyebrow">Operación del taller</span>
        <h2>Órdenes de servicio</h2>
        <p>Consulta el avance, pagos y comunicación de cada reparación.</p>
      </div>

      <router-link to="/nueva-orden" class="ts-action-primary">
        <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
        Nueva orden
      </router-link>
    </header>

    <div class="ts-metric-strip ts-metric-strip-four">
      <article class="ts-mini-metric">
        <span>Órdenes activas</span>
        <strong>{{ resumen.activas }}</strong>
        <small>En proceso actualmente</small>
      </article>
      <article class="ts-mini-metric">
        <span>Listas para entregar</span>
        <strong>{{ resumen.listas }}</strong>
        <small>Requieren contacto</small>
      </article>
      <article class="ts-mini-metric">
        <span>En espera</span>
        <strong>{{ resumen.esperando }}</strong>
        <small>Autorización o refacción</small>
      </article>
      <article class="ts-mini-metric">
        <span>Saldo por cobrar</span>
        <strong>{{ moneda(resumen.porCobrar) }}</strong>
        <small>Acumulado en órdenes</small>
      </article>
    </div>

    <article class="ts-panel">
      <div class="ts-orders-toolbar">
        <label class="ts-search-control ts-search-grow">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input v-model="filtro" type="search" placeholder="Buscar folio, cliente, equipo o IMEI">
        </label>

        <select v-model="estadoSeleccionado" class="ts-filter-select" aria-label="Filtrar por estado">
          <option v-for="estado in estados" :key="estado" :value="estado">{{ estado }}</option>
        </select>
      </div>

      <div v-if="cargando" class="ts-empty-state">
        <div class="ts-spinner"></div>
        <strong>Cargando órdenes</strong>
        <p>Consultando la operación del taller.</p>
      </div>

      <div v-else-if="ordenesFiltradas.length" class="ts-order-grid">
        <article v-for="orden in ordenesFiltradas" :key="orden.id" class="ts-order-card-v2">
          <header class="ts-order-card-header">
            <div>
              <span class="ts-order-folio">{{ orden.folio }}</span>
              <h3>{{ orden.clientes?.nombre || 'Cliente sin nombre' }}</h3>
            </div>
            <span class="ts-status-pill" :class="`ts-status-${estadoSlug(orden.estado)}`">{{ orden.estado }}</span>
          </header>

          <div class="ts-device-summary">
            <div class="ts-device-icon">
              <svg viewBox="0 0 24 24"><rect x="6" y="2" width="12" height="20" rx="2" /><path d="M10 18h4" /></svg>
            </div>
            <div>
              <strong>{{ [orden.equipos?.marca, orden.equipos?.modelo].filter(Boolean).join(' ') || 'Equipo sin especificar' }}</strong>
              <span>{{ orden.equipos?.tipo_equipo || 'Dispositivo' }} · {{ orden.equipos?.color || 'Color no registrado' }}</span>
            </div>
          </div>

          <div class="ts-order-problem">
            <span>Falla reportada</span>
            <p>{{ orden.falla_reportada || 'Sin descripción registrada.' }}</p>
          </div>

          <div class="ts-payment-summary">
            <div class="ts-payment-row">
              <span>Progreso de pago</span>
              <strong>{{ porcentajePago(orden) }}%</strong>
            </div>
            <div class="ts-progress-track"><span :style="{ width: `${porcentajePago(orden)}%` }"></span></div>
            <div class="ts-payment-values">
              <div><span>Total</span><strong>{{ moneda(orden.costo_total) }}</strong></div>
              <div><span>Pagado</span><strong>{{ moneda(orden.anticipo) }}</strong></div>
              <div><span>Saldo</span><strong class="ts-balance-due">{{ moneda(saldoOrden(orden)) }}</strong></div>
            </div>
          </div>

          <label class="ts-order-status-control">
            <span>Actualizar estado</span>
            <select v-model="orden.estado" @change="actualizarEstado(orden)">
              <option v-for="estado in estados.slice(1)" :key="estado">{{ estado }}</option>
            </select>
          </label>

          <footer class="ts-order-actions">
            <router-link class="ts-action-primary ts-action-compact" :to="`/ordenes/${orden.id}`">Ver detalle</router-link>
            <button class="ts-action-secondary ts-action-compact" type="button" @click="abrirPago(orden)">Registrar pago</button>
            <a
              class="ts-more-action ts-whatsapp-action"
              :href="whatsappLink(orden)"
              target="_blank"
              rel="noopener"
              title="Enviar WhatsApp"
            >
              <svg viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" /></svg>
            </a>

            <div class="ts-order-menu-wrap">
              <button class="ts-more-action" type="button" title="Más acciones" @click.stop="alternarMenu(orden.id)">
                <svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>
              </button>

              <div v-if="menuAbierto === orden.id" class="ts-order-menu" @click.stop>
                <router-link :to="`/ordenes/${orden.id}/editar`" @click="menuAbierto = null">
                  <svg viewBox="0 0 24 24"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                  Editar orden
                </router-link>
                <button type="button" @click="registrarGasto(orden); menuAbierto = null">
                  <svg viewBox="0 0 24 24"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6" /></svg>
                  Registrar gasto
                </button>
                <button v-if="orden.estado !== 'Cancelado'" type="button" @click="abrirConfirmacion(orden, 'cancelar')">
                  <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6M15 9l-6 6" /></svg>
                  Cancelar orden
                </button>
                <button v-if="esAdministrador" class="is-danger" type="button" @click="abrirConfirmacion(orden, 'eliminar')">
                  <svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
                  Eliminar definitivamente
                </button>
              </div>
            </div>
          </footer>
        </article>
      </div>

      <div v-else class="ts-empty-state">
        <div class="ts-empty-icon">
          <svg viewBox="0 0 24 24"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
        </div>
        <strong>No hay órdenes que mostrar</strong>
        <p>Cambia los filtros o crea una nueva orden de servicio.</p>
        <router-link to="/nueva-orden" class="ts-action-primary">Crear orden</router-link>
      </div>
    </article>


    <Teleport to="body">
      <div v-if="ordenPago" class="ts-confirm-backdrop" @click.self="cerrarPago">
        <section class="ts-confirm-dialog ts-payment-dialog" role="dialog" aria-modal="true" aria-labelledby="payment-title">
          <span class="ts-eyebrow">Cobro de orden</span>
          <h3 id="payment-title">Registrar pago · {{ ordenPago.folio }}</h3>

          <div class="ts-payment-modal-summary">
            <div><span>Total</span><strong>{{ moneda(totalOrden(ordenPago)) }}</strong></div>
            <div><span>Pagado</span><strong>{{ moneda(pagadoOrden(ordenPago)) }}</strong></div>
            <div><span>Saldo pendiente</span><strong class="ts-balance-due">{{ moneda(saldoOrden(ordenPago)) }}</strong></div>
          </div>

          <label class="ts-payment-field">
            <span>Monto recibido</span>
            <input
              v-model="montoPago"
              type="number"
              min="0.01"
              :max="saldoOrden(ordenPago)"
              step="0.01"
              inputmode="decimal"
              placeholder="0.00"
              @input="validarMontoPago"
            >
          </label>

          <div class="ts-payment-field">
            <span>Método de pago</span>
            <div class="ts-payment-methods">
              <label v-for="metodo in ['Efectivo', 'Transferencia', 'Tarjeta', 'Otro']" :key="metodo">
                <input v-model="metodoPago" type="radio" :value="metodo">
                {{ metodo }}
              </label>
            </div>
          </div>

          <label class="ts-payment-field">
            <span>Referencia u observación <small>(opcional)</small></span>
            <input v-model.trim="referenciaPago" type="text" maxlength="120" placeholder="Ej. transferencia 1234">
          </label>

          <p v-if="errorPago" class="ts-payment-error">{{ errorPago }}</p>
          <p v-else-if="Number(montoPago) === saldoOrden(ordenPago)" class="ts-payment-success">La orden quedará liquidada.</p>

          <footer class="ts-confirm-actions">
            <button class="ts-action-secondary" type="button" :disabled="procesandoPago" @click="cerrarPago">Cancelar</button>
            <button class="ts-action-primary" type="button" :disabled="procesandoPago || !Number(montoPago)" @click="registrarLiquidacion">
              {{ procesandoPago ? 'Registrando…' : 'Registrar pago' }}
            </button>
          </footer>
        </section>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="ordenAccion" class="ts-confirm-backdrop" @click.self="cerrarConfirmacion">
        <section class="ts-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div class="ts-confirm-icon" :class="{ 'is-danger': modalAccion === 'eliminar' }">
            <svg v-if="modalAccion === 'eliminar'" viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
            <svg v-else viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6M15 9l-6 6" /></svg>
          </div>

          <span class="ts-eyebrow">{{ modalAccion === 'eliminar' ? 'Acción irreversible' : 'Conservar historial' }}</span>
          <h3 id="confirm-title">
            {{ modalAccion === 'eliminar' ? '¿Eliminar esta orden definitivamente?' : '¿Cancelar esta orden?' }}
          </h3>
          <p v-if="modalAccion === 'eliminar'">
            Se eliminarán la orden <strong>{{ ordenAccion.folio }}</strong>, sus pruebas, evidencias, garantías, firmas y movimientos asociados. Esta información no podrá recuperarse.
          </p>
          <p v-else>
            La orden <strong>{{ ordenAccion.folio }}</strong> se conservará en el historial con estado <strong>Cancelado</strong>. Esta es la opción recomendada.
          </p>

          <label v-if="modalAccion === 'eliminar'" class="ts-delete-warning">
            <input type="checkbox" v-model="ordenAccion.confirmarEliminacion">
            Entiendo que la eliminación es permanente.
          </label>

          <footer class="ts-confirm-actions">
            <button class="ts-action-secondary" type="button" :disabled="procesandoAccion" @click="cerrarConfirmacion">Volver</button>
            <button
              class="ts-action-primary"
              :class="{ 'ts-action-danger': modalAccion === 'eliminar' }"
              type="button"
              :disabled="procesandoAccion || (modalAccion === 'eliminar' && !ordenAccion.confirmarEliminacion)"
              @click="confirmarAccion"
            >
              {{ procesandoAccion ? 'Procesando…' : (modalAccion === 'eliminar' ? 'Eliminar definitivamente' : 'Cancelar orden') }}
            </button>
          </footer>
        </section>
      </div>
    </Teleport>
  </section>
</template>
