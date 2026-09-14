<script setup>
import { computed, onMounted, ref } from 'vue'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/auth'
import TicketPreviewModal from '../components/tickets/TicketPreviewModal.vue'
import { buildTicketOrdenServicio } from '../utils/tickets'

const ordenes = ref([])
const filtro = ref('')
const estadoSeleccionado = ref('Todas')
const cargando = ref(true)
const authStore = useAuthStore()
const menuAbierto = ref(null)
const ordenAccion = ref(null)
const modalAccion = ref(null)
const procesandoAccion = ref(false)
const ticketActual = ref(null)
const pagoModal = ref(null)
const pagoForm = ref({ monto: null, metodo_pago: 'Efectivo' })
const guardandoPago = ref(false)
const errorPago = ref('')
const gastoModal = ref(null)
const gastoForm = ref({ concepto: '', monto: null, metodo_pago: 'Transferencia', notas: '' })
const guardandoGasto = ref(false)
const errorGasto = ref('')
const negocio = ref({ nombre_negocio: 'TechSoul', direccion: 'Blvd. Jardín de las Orquídeas 2584-B', telefono: '667 748 7373' })

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
  porCobrar: ordenes.value.reduce((total, orden) => total + saldoReal(orden), 0)
}))

function moneda(valor) {
  return Number(valor || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
}

function saldoReal(orden) {
  return Math.max(0, Number(orden?.costo_total || 0) - Number(orden?.anticipo || 0))
}

function tipoPago(orden, monto) {
  const pagadoAntes = Number(orden?.anticipo || 0)
  const saldo = saldoReal(orden)
  if (monto >= saldo - 0.009) return 'Liquidación'
  return pagadoAntes > 0 ? 'Abono' : 'Anticipo'
}

function estadoSlug(estado = '') {
  return estado
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
}

function porcentajePago(orden) {
  const total = Number(orden.costo_total || 0)
  const anticipo = Number(orden.anticipo || 0)
  if (!total) return 0
  return Math.min(100, Math.round((anticipo / total) * 100))
}

function whatsappLink(orden) {
  const telefono = orden.clientes?.whatsapp || orden.clientes?.telefono || ''
  const limpio = String(telefono).replace(/\D/g, '')
  const numero = limpio.startsWith('52') ? limpio : `52${limpio}`
  const mensaje = `Hola ${orden.clientes?.nombre || ''}, te escribimos de TechSoul. Tu equipo ${orden.equipos?.marca || ''} ${orden.equipos?.modelo || ''} está en estado: ${orden.estado}. Folio: ${orden.folio}. Saldo pendiente: ${moneda(saldoReal(orden))}.`
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

function abrirGasto(orden) {
  gastoModal.value = orden
  gastoForm.value = { concepto: '', monto: null, metodo_pago: 'Transferencia', notas: '' }
  errorGasto.value = ''
}

function cerrarGasto() {
  if (guardandoGasto.value) return
  gastoModal.value = null
  errorGasto.value = ''
}

async function registrarGasto() {
  const orden = gastoModal.value
  if (!orden || guardandoGasto.value) return

  const concepto = String(gastoForm.value.concepto || '').trim()
  const monto = Number(gastoForm.value.monto || 0)
  errorGasto.value = ''

  if (!concepto) {
    errorGasto.value = 'Escribe el concepto del gasto.'
    return
  }
  if (!monto || monto <= 0) {
    errorGasto.value = 'Ingresa un monto mayor a $0.00.'
    return
  }

  guardandoGasto.value = true
  const notas = [orden.folio, String(gastoForm.value.notas || '').trim()].filter(Boolean).join(' · ')
  const { error } = await supabase.from('movimientos_caja').insert({
    tipo: 'Salida',
    concepto,
    monto,
    metodo_pago: gastoForm.value.metodo_pago,
    referencia_tipo: 'orden',
    referencia_id: orden.id,
    notas
  })

  if (error) {
    guardandoGasto.value = false
    errorGasto.value = error.message
    return
  }

  await registrarHistorial(
    orden.id,
    'gasto',
    'Gasto registrado',
    `${concepto}: ${moneda(monto)} por ${gastoForm.value.metodo_pago}.`
  )

  guardandoGasto.value = false
  gastoModal.value = null
}

function abrirPago(orden) {
  const saldo = saldoReal(orden)
  if (saldo <= 0) {
    alert('Esta orden ya está liquidada.')
    return
  }
  pagoModal.value = orden
  pagoForm.value = { monto: null, metodo_pago: 'Efectivo' }
  errorPago.value = ''
}

function cerrarPago() {
  if (guardandoPago.value) return
  pagoModal.value = null
  errorPago.value = ''
}

function establecerMonto(valor) {
  if (!pagoModal.value) return
  pagoForm.value.monto = Math.min(Number(valor || 0), saldoReal(pagoModal.value))
}

async function registrarLiquidacion() {
  const orden = pagoModal.value
  if (!orden || guardandoPago.value) return

  const monto = Number(pagoForm.value.monto || 0)
  const saldoAntes = saldoReal(orden)
  errorPago.value = ''

  if (!monto || monto <= 0) {
    errorPago.value = 'Ingresa un monto mayor a $0.00.'
    return
  }
  if (monto > saldoAntes + 0.009) {
    errorPago.value = `El pago no puede superar el saldo pendiente de ${moneda(saldoAntes)}.`
    return
  }

  guardandoPago.value = true
  const nuevoAnticipo = Number((Number(orden.anticipo || 0) + monto).toFixed(2))
  const nuevoSaldo = Math.max(0, Number((Number(orden.costo_total || 0) - nuevoAnticipo).toFixed(2)))
  const clasePago = tipoPago(orden, monto)

  const { error: errorOrden } = await supabase
    .from('ordenes')
    .update({ anticipo: nuevoAnticipo })
    .eq('id', orden.id)

  if (errorOrden) {
    guardandoPago.value = false
    errorPago.value = errorOrden.message
    return
  }

  const { error: errorCaja } = await supabase.from('movimientos_caja').insert({
    tipo: 'Entrada',
    concepto: `${clasePago} orden ${orden.folio}`,
    monto,
    metodo_pago: pagoForm.value.metodo_pago,
    referencia_tipo: 'orden',
    referencia_id: orden.id,
    notas: orden.clientes?.nombre
  })

  if (errorCaja) {
    // Revierte el acumulado para no dejar la orden descuadrada si falla Caja.
    await supabase.from('ordenes').update({ anticipo: Number(orden.anticipo || 0) }).eq('id', orden.id)
    guardandoPago.value = false
    errorPago.value = errorCaja.message
    return
  }

  await registrarHistorial(
    orden.id,
    'pago',
    `${clasePago} registrado`,
    `Se registró ${clasePago.toLowerCase()} de ${moneda(monto)} por ${pagoForm.value.metodo_pago}. Saldo restante: ${moneda(nuevoSaldo)}.`
  )

  const ordenActualizada = { ...orden, anticipo: nuevoAnticipo }
  guardandoPago.value = false
  pagoModal.value = null
  await cargarOrdenes()
  await abrirTicketOrden(ordenActualizada, pagoForm.value.metodo_pago)
}



async function abrirTicketOrden(orden, metodoPagoForzado = '') {
  if (!orden) return

  const [{ data: ultimoPago }, { data: dataNegocio }] = await Promise.all([
    supabase
      .from('movimientos_caja')
      .select('metodo_pago, fecha_movimiento, created_at')
      .eq('referencia_tipo', 'orden')
      .eq('referencia_id', orden.id)
      .eq('tipo', 'Entrada')
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('configuracion_negocio')
      .select('*')
      .order('id')
      .limit(1)
      .maybeSingle()
  ])

  if (dataNegocio) negocio.value = dataNegocio

  ticketActual.value = buildTicketOrdenServicio({
    orden,
    negocio: negocio.value,
    paymentMethod: metodoPagoForzado || ultimoPago?.metodo_pago || orden?.metodo_pago || orden?.forma_pago || 'No especificado'
  })
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
              <div><span>Saldo</span><strong class="ts-balance-due">{{ moneda(saldoReal(orden)) }}</strong></div>
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
            <button class="ts-action-secondary ts-action-compact ts-ticket-order-action" type="button" @click="abrirTicketOrden(orden)">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/></svg>
              Imprimir ticket
            </button>
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
                <button type="button" @click="abrirGasto(orden); menuAbierto = null">
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
      <div v-if="gastoModal" class="ts-payment-backdrop" @click.self="cerrarGasto">
        <section class="ts-payment-dialog" role="dialog" aria-modal="true" aria-labelledby="gasto-title">
          <header class="ts-payment-dialog-head">
            <div>
              <span class="ts-eyebrow">GASTO DE ORDEN</span>
              <h3 id="gasto-title">Registrar gasto</h3>
              <p>{{ gastoModal.folio }} · {{ gastoModal.clientes?.nombre || 'Cliente' }}</p>
            </div>
            <button class="ts-payment-close" type="button" aria-label="Cerrar" :disabled="guardandoGasto" @click="cerrarGasto">×</button>
          </header>

          <div class="ts-payment-order-chip">
            <div class="ts-payment-device-icon">$</div>
            <div>
              <strong>{{ [gastoModal.equipos?.marca, gastoModal.equipos?.modelo].filter(Boolean).join(' ') || 'Equipo sin especificar' }}</strong>
              <span>Este gasto quedará vinculado automáticamente a la orden.</span>
            </div>
          </div>

          <label class="ts-payment-field">
            <span>Concepto del gasto</span>
            <input v-model="gastoForm.concepto" class="ts-expense-input" type="text" maxlength="160" placeholder="Ej. Pantalla iPhone 14 Pro Max">
          </label>

          <label class="ts-payment-field">
            <span>Monto del gasto</span>
            <div class="ts-money-input">
              <b>$</b>
              <input v-model.number="gastoForm.monto" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="0.00">
            </div>
          </label>

          <fieldset class="ts-payment-methods">
            <legend>Método de pago</legend>
            <label v-for="metodo in ['Efectivo', 'Transferencia', 'Tarjeta']" :key="metodo" :class="{ active: gastoForm.metodo_pago === metodo }">
              <input v-model="gastoForm.metodo_pago" type="radio" name="metodo-gasto" :value="metodo">
              <span>{{ metodo }}</span>
            </label>
          </fieldset>

          <div class="ts-payment-field ts-expense-notes-field">
            <label for="gasto-notas">Nota <small>(opcional)</small></label>
            <textarea id="gasto-notas" v-model="gastoForm.notas" class="ts-expense-textarea" rows="3" maxlength="300" placeholder="Proveedor, detalle de la pieza u observación..."></textarea>
          </div>

          <div class="ts-expense-preview">
            <span>Se registrará en Caja como</span>
            <div class="ts-expense-preview-value">
              <strong>Salida</strong>
              <i aria-hidden="true">·</i>
              <b>{{ gastoForm.metodo_pago }}</b>
            </div>
          </div>

          <p v-if="errorGasto" class="ts-payment-error">{{ errorGasto }}</p>

          <footer class="ts-payment-actions">
            <button class="ts-action-secondary" type="button" :disabled="guardandoGasto" @click="cerrarGasto">Cancelar</button>
            <button class="ts-action-primary" type="button" :disabled="guardandoGasto" @click="registrarGasto">
              {{ guardandoGasto ? 'Registrando…' : 'Registrar gasto' }}
            </button>
          </footer>
        </section>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="pagoModal" class="ts-payment-backdrop" @click.self="cerrarPago">
        <section class="ts-payment-dialog" role="dialog" aria-modal="true" aria-labelledby="payment-title">
          <header class="ts-payment-dialog-head">
            <div>
              <span class="ts-eyebrow">Cobro de orden</span>
              <h3 id="payment-title">Registrar pago</h3>
              <p>{{ pagoModal.folio }} · {{ pagoModal.clientes?.nombre || 'Cliente' }}</p>
            </div>
            <button class="ts-payment-close" type="button" aria-label="Cerrar" @click="cerrarPago">×</button>
          </header>

          <div class="ts-payment-order-chip">
            <div class="ts-payment-device-icon">
              <svg viewBox="0 0 24 24"><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 18h4"/></svg>
            </div>
            <div>
              <strong>{{ [pagoModal.equipos?.marca, pagoModal.equipos?.modelo].filter(Boolean).join(' ') || 'Equipo sin especificar' }}</strong>
              <span>{{ pagoModal.falla_reportada || 'Orden de servicio' }}</span>
            </div>
          </div>

          <div class="ts-payment-totals">
            <div><span>Total</span><strong>{{ moneda(pagoModal.costo_total) }}</strong></div>
            <div><span>Pagado</span><strong>{{ moneda(pagoModal.anticipo) }}</strong></div>
            <div class="is-due"><span>Saldo pendiente</span><strong>{{ moneda(saldoReal(pagoModal)) }}</strong></div>
          </div>

          <label class="ts-payment-field">
            <span>¿Cuánto pagó el cliente?</span>
            <div class="ts-money-input">
              <b>$</b>
              <input v-model.number="pagoForm.monto" type="number" min="0.01" :max="saldoReal(pagoModal)" step="0.01" inputmode="decimal" placeholder="0.00">
            </div>
          </label>

          <div class="ts-quick-payments">
            <button type="button" @click="establecerMonto(500)">$500</button>
            <button type="button" @click="establecerMonto(1000)">$1,000</button>
            <button type="button" class="is-liquidate" @click="establecerMonto(saldoReal(pagoModal))">Liquidar {{ moneda(saldoReal(pagoModal)) }}</button>
          </div>

          <fieldset class="ts-payment-methods">
            <legend>Método de pago</legend>
            <label v-for="metodo in ['Efectivo', 'Transferencia', 'Tarjeta']" :key="metodo" :class="{ active: pagoForm.metodo_pago === metodo }">
              <input v-model="pagoForm.metodo_pago" type="radio" name="metodo-pago" :value="metodo">
              <span>{{ metodo }}</span>
            </label>
          </fieldset>

          <div class="ts-payment-type-preview">
            <span>Se registrará como</span>
            <strong>{{ pagoForm.monto > 0 ? tipoPago(pagoModal, Number(pagoForm.monto)) : (Number(pagoModal.anticipo || 0) > 0 ? 'Abono' : 'Anticipo') }}</strong>
          </div>

          <p v-if="errorPago" class="ts-payment-error">{{ errorPago }}</p>

          <footer class="ts-payment-actions">
            <button class="ts-action-secondary" type="button" :disabled="guardandoPago" @click="cerrarPago">Cancelar</button>
            <button class="ts-action-primary" type="button" :disabled="guardandoPago" @click="registrarLiquidacion">
              {{ guardandoPago ? 'Registrando…' : 'Registrar pago' }}
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

    <TicketPreviewModal :ticket="ticketActual" @close="ticketActual = null" />
  </section>
</template>

<style scoped>
.ts-ticket-order-action {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
}
.ts-ticket-order-action svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
@media (max-width: 720px) {
  .ts-order-actions .ts-ticket-order-action {
    flex: 1 1 calc(50% - .4rem);
    justify-content: center;
    min-height: 44px;
  }
}

.ts-payment-backdrop {
  position: fixed; inset: 0; z-index: 1600; display: grid; place-items: center;
  padding: 20px; background: rgba(9, 18, 33, .58); backdrop-filter: blur(5px);
}
.ts-payment-dialog {
  width: min(560px, 100%); max-height: min(820px, calc(100vh - 28px)); overflow: auto;
  background: var(--surface, #fff); color: var(--text, #0f172a); border: 1px solid var(--border, #dfe5ee);
  border-radius: 24px; box-shadow: 0 28px 80px rgba(15, 23, 42, .24); padding: 24px;
}
.ts-payment-dialog-head { display:flex; align-items:flex-start; justify-content:space-between; gap:18px; margin-bottom:18px; }
.ts-payment-dialog-head h3 { margin:4px 0 3px; font-size:28px; line-height:1.1; }
.ts-payment-dialog-head p { margin:0; color:var(--muted, #667085); }
.ts-payment-close { width:40px; height:40px; border-radius:12px; border:1px solid var(--border, #dfe5ee); background:transparent; color:inherit; font-size:28px; line-height:1; cursor:pointer; }
.ts-payment-order-chip { display:flex; gap:12px; align-items:center; padding:14px; border:1px solid var(--border, #dfe5ee); border-radius:16px; background:var(--surface-soft, #f8fafc); margin-bottom:14px; min-width:0; }
.ts-payment-order-chip > div:last-child { min-width:0; }
.ts-payment-order-chip strong { display:block; overflow-wrap:anywhere; }
.ts-payment-order-chip span { display:block; margin-top:3px; color:var(--muted, #667085); font-size:13px; overflow-wrap:anywhere; }
.ts-payment-device-icon { width:42px; height:42px; flex:0 0 42px; border-radius:12px; display:grid; place-items:center; background:#eaf2ff; color:#1264f6; }
.ts-payment-device-icon svg { width:20px; height:20px; fill:none; stroke:currentColor; stroke-width:1.8; }
.ts-payment-totals { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:20px; }
.ts-payment-totals > div { padding:14px; border:1px solid var(--border, #dfe5ee); border-radius:14px; background:var(--surface-soft, #f8fafc); }
.ts-payment-totals span { display:block; font-size:12px; color:var(--muted, #667085); margin-bottom:4px; }
.ts-payment-totals strong { font-size:17px; }
.ts-payment-totals .is-due strong { color:#d92d20; }
.ts-payment-field { display:block; margin-bottom:12px; }
.ts-payment-field > span, .ts-payment-field > label, .ts-payment-methods legend { display:block; font-weight:750; font-size:14px; margin-bottom:8px; }
.ts-money-input { height:58px; display:flex; align-items:center; border:1px solid var(--border, #d0d5dd); border-radius:14px; overflow:hidden; background:var(--surface, #fff); }
.ts-money-input:focus-within { border-color:#2f6bff; box-shadow:0 0 0 3px rgba(47,107,255,.12); }
.ts-money-input b { padding-left:16px; font-size:22px; }
.ts-money-input input { width:100%; height:100%; border:0; outline:0; background:transparent; color:inherit; font:inherit; font-size:22px; font-weight:750; padding:0 16px 0 8px; }
.ts-quick-payments { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:20px; }
.ts-quick-payments button { min-height:40px; padding:0 14px; border:1px solid var(--border, #d0d5dd); border-radius:10px; background:var(--surface, #fff); color:inherit; font-weight:700; cursor:pointer; }
.ts-quick-payments .is-liquidate { border-color:#2f6bff; color:#1457db; background:#eef4ff; }
.ts-payment-methods { border:0; padding:0; margin:0 0 16px; }
.ts-payment-methods { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
.ts-payment-methods legend { grid-column:1/-1; }
.ts-payment-methods label { min-height:48px; display:grid; place-items:center; border:1px solid var(--border, #d0d5dd); border-radius:12px; cursor:pointer; font-weight:700; background:var(--surface, #fff); }
.ts-payment-methods label.active { border-color:#2f6bff; background:#eef4ff; color:#1457db; box-shadow:inset 0 0 0 1px #2f6bff; }
.ts-payment-methods input { position:absolute; opacity:0; pointer-events:none; }
.ts-payment-type-preview { display:flex; justify-content:space-between; gap:12px; padding:12px 14px; border-radius:12px; background:var(--surface-soft, #f8fafc); margin-bottom:12px; font-size:13px; }
.ts-payment-type-preview span { color:var(--muted, #667085); }
.ts-payment-type-preview strong { color:#1457db; }
.ts-payment-error { margin:0 0 12px; padding:10px 12px; border-radius:10px; background:#fff1f0; color:#b42318; font-size:13px; }
.ts-expense-input, .ts-expense-textarea { width:100%; border:1px solid var(--border, #d0d5dd); border-radius:14px; background:var(--surface, #fff); color:inherit; font:inherit; padding:14px 16px; outline:none; box-sizing:border-box; }
.ts-expense-input { min-height:52px; }
.ts-expense-notes-field { width:100%; min-width:0; }
.ts-expense-textarea { display:block !important; width:100% !important; max-width:100% !important; min-width:0 !important; min-height:96px; resize:vertical; line-height:1.45; }
.ts-expense-input:focus, .ts-expense-textarea:focus { border-color:#2f6bff; box-shadow:0 0 0 3px rgba(47,107,255,.12); }
.ts-payment-field small { color:var(--muted, #667085); font-weight:500; }
.ts-expense-preview { display:flex; justify-content:space-between; gap:12px; padding:12px 14px; border-radius:12px; background:var(--surface-soft, #f8fafc); margin-top:4px; margin-bottom:12px; font-size:13px; }
.ts-expense-preview span { color:var(--muted, #667085); }
.ts-expense-preview-value { display:flex; align-items:center; justify-content:flex-end; flex-wrap:wrap; gap:6px; text-align:right; }
.ts-expense-preview-value strong { color:#b42318; }
.ts-expense-preview-value b { color:inherit; font-weight:750; }
.ts-expense-preview-value i { color:var(--muted, #667085); font-style:normal; }
.ts-payment-actions { display:grid; grid-template-columns:1fr 1.35fr; gap:10px; margin-top:18px; }
.ts-payment-actions button { min-height:50px; justify-content:center; }
@media (max-width: 560px) {
  .ts-payment-backdrop { padding:10px; align-items:end; }
  .ts-payment-dialog { width:100%; max-height:calc(100vh - 10px); border-radius:22px 22px 0 0; padding:18px 16px calc(18px + env(safe-area-inset-bottom)); }
  .ts-payment-dialog-head h3 { font-size:24px; }
  .ts-payment-totals { grid-template-columns:1fr; gap:7px; }
  .ts-payment-totals > div { display:flex; justify-content:space-between; align-items:center; padding:11px 12px; }
  .ts-payment-totals span { margin:0; }
  .ts-payment-methods { grid-template-columns:repeat(3, minmax(0, 1fr)); }
  .ts-payment-methods label { min-width:0; font-size:12px; padding:0 4px; }
  .ts-expense-preview { align-items:flex-start; }
  .ts-payment-actions { grid-template-columns:1fr; }
  .ts-payment-actions .ts-action-primary { order:-1; }
  .ts-quick-payments button { flex:1 1 calc(50% - 4px); }
  .ts-quick-payments .is-liquidate { flex-basis:100%; }
}

</style>
