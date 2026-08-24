<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '../lib/supabase'

const route = useRoute()
const router = useRouter()

const orden = ref(null)
const equipo = ref(null)
const garantia = ref(null)
const configuracionGarantias = ref([])
const cargando = ref(false)
const errorCarga = ref('')
const seccion = ref('equipo')
const estadoOriginal = ref('')

const estados = [
  { value: 'Recibido', label: 'Recibido', help: 'El equipo acaba de ingresar al taller.' },
  { value: 'Diagnóstico', label: 'En diagnóstico', help: 'Se está revisando la causa de la falla.' },
  { value: 'Esperando autorización', label: 'Esperando autorización', help: 'La cotización fue enviada y falta aprobación.' },
  { value: 'Esperando pieza', label: 'Esperando refacción', help: 'La reparación depende de una pieza o material.' },
  { value: 'En reparación', label: 'En reparación', help: 'El técnico ya está trabajando en el equipo.' },
  { value: 'Listo', label: 'Listo para entregar', help: 'La reparación terminó y el cliente puede recogerlo.' },
  { value: 'Entregado', label: 'Entregado', help: 'El equipo fue entregado al cliente.' },
  { value: 'Garantía', label: 'En garantía', help: 'El equipo regresó para revisión de garantía.' },
  { value: 'Cancelado', label: 'Cancelado', help: 'La orden queda archivada sin eliminarse.' }
]

const saldo = computed(() => Math.max(0, Number(orden.value?.costo_total || 0) - Number(orden.value?.anticipo || 0)))
const porcentajePagado = computed(() => {
  const total = Number(orden.value?.costo_total || 0)
  if (!total) return 0
  return Math.min(100, Math.round((Number(orden.value?.anticipo || 0) / total) * 100))
})

function moneda(valor) {
  return Number(valor || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
}

async function cargar() {
  errorCarga.value = ''
  const id = route.params.id

  const { data, error } = await supabase
    .from('ordenes')
    .select('*, equipos(*)')
    .eq('id', id)
    .single()

  if (error) {
    errorCarga.value = error.message
    return
  }

  orden.value = data
  equipo.value = data.equipos
  estadoOriginal.value = data.estado || 'Recibido'

  const [{ data: garantias }, { data: configs }] = await Promise.all([
    supabase.from('garantias').select('*').eq('orden_id', id).order('id', { ascending: false }),
    supabase.from('configuracion_garantias').select('*').eq('activo', true).order('tipo_servicio')
  ])

  garantia.value = (garantias || [])[0] || {
    orden_id: id,
    tipo_servicio: 'Reparación',
    dias_garantia: orden.value.garantia_dias || 0,
    condiciones: orden.value.garantia_condiciones || '',
    activa: true
  }

  configuracionGarantias.value = configs || []
}

function aplicarGarantia() {
  const seleccion = configuracionGarantias.value.find(g => g.tipo_servicio === garantia.value.tipo_servicio)
  if (seleccion) {
    garantia.value.dias_garantia = seleccion.dias_garantia
    garantia.value.condiciones = seleccion.condiciones
  }
}

async function registrarHistorial(tipo, titulo, descripcion, estadoAnterior = null, estadoNuevo = null) {
  const { data: auth } = await supabase.auth.getUser()
  const payload = {
    orden_id: orden.value.id,
    tipo,
    titulo,
    descripcion,
    estado_anterior: estadoAnterior,
    estado_nuevo: estadoNuevo,
    usuario_id: auth.user?.id || null
  }

  const { error } = await supabase.from('orden_historial').insert(payload)
  // La edición no se bloquea si la migración del historial todavía no fue ejecutada.
  if (error && !String(error.message).toLowerCase().includes('orden_historial')) {
    console.warn('No se pudo registrar historial:', error.message)
  }
}

async function guardarCambios() {
  if (!orden.value.falla_reportada?.trim()) {
    alert('Escribe la falla reportada por el cliente.')
    seccion.value = 'servicio'
    return
  }

  if (Number(orden.value.anticipo || 0) > Number(orden.value.costo_total || 0) && Number(orden.value.costo_total || 0) > 0) {
    const continuar = window.confirm('El pago registrado es mayor que el total de la orden. ¿Deseas guardar de todas formas?')
    if (!continuar) return
  }

  if (orden.value.estado === 'Entregado' && saldo.value > 0) {
    const continuar = window.confirm(
      `Este equipo tiene un saldo pendiente de ${moneda(saldo.value)}. La política del taller es entregar solo equipos liquidados. ¿Deseas marcarlo como entregado de todas formas?`
    )
    if (!continuar) return
  }

  cargando.value = true

  try {
    const cambioEstado = estadoOriginal.value !== orden.value.estado
    // "Listo" es el momento en que se notifica al cliente: desde aquí cuentan
    // tanto la garantía como los días de gracia antes de cobrar almacenamiento.
    const pasaAListoPorPrimeraVez = orden.value.estado === 'Listo' && !orden.value.fecha_listo
    const fechaListoNueva = pasaAListoPorPrimeraVez ? new Date().toISOString() : orden.value.fecha_listo

    const { error: errorOrden } = await supabase
      .from('ordenes')
      .update({
        falla_reportada: orden.value.falla_reportada,
        diagnostico: orden.value.diagnostico,
        trabajo_realizado: orden.value.trabajo_realizado,
        costo_total: Number(orden.value.costo_total || 0),
        anticipo: Number(orden.value.anticipo || 0),
        metodo_pago: orden.value.metodo_pago || 'No especificado',
        estado: orden.value.estado,
        fecha_listo: fechaListoNueva,
        garantia_dias: Number(garantia.value.dias_garantia || 0),
        garantia_condiciones: garantia.value.condiciones,
        tecnico: orden.value.tecnico,
        notas: orden.value.notas
      })
      .eq('id', orden.value.id)

    if (errorOrden) throw errorOrden

    if (pasaAListoPorPrimeraVez) orden.value.fecha_listo = fechaListoNueva

    const { error: errorEquipo } = await supabase
      .from('equipos')
      .update({
        tipo_equipo: equipo.value.tipo_equipo,
        marca: equipo.value.marca,
        modelo: equipo.value.modelo,
        color: equipo.value.color,
        imei_serie: equipo.value.imei_serie,
        codigo_bloqueo: equipo.value.codigo_bloqueo,
        observaciones: equipo.value.observaciones
      })
      .eq('id', equipo.value.id)

    if (errorEquipo) throw errorEquipo

    if (garantia.value.id) {
      const payloadGarantia = {
        tipo_servicio: garantia.value.tipo_servicio,
        dias_garantia: Number(garantia.value.dias_garantia || 0),
        condiciones: garantia.value.condiciones,
        activa: garantia.value.activa
      }
      // La vigencia real empieza cuando se notifica al cliente (fecha_listo),
      // no cuando se guardó por primera vez el registro de garantía.
      if (pasaAListoPorPrimeraVez) payloadGarantia.fecha_inicio = fechaListoNueva

      const { error: errorGarantia } = await supabase
        .from('garantias')
        .update(payloadGarantia)
        .eq('id', garantia.value.id)
      if (errorGarantia) throw errorGarantia
    } else if (Number(garantia.value.dias_garantia || 0) > 0) {
      const payloadGarantia = { ...garantia.value }
      if (pasaAListoPorPrimeraVez) payloadGarantia.fecha_inicio = fechaListoNueva
      const { error: errorGarantia } = await supabase.from('garantias').insert(payloadGarantia)
      if (errorGarantia) throw errorGarantia
    }

    if (cambioEstado) {
      await registrarHistorial(
        'estado',
        `Estado cambiado a ${orden.value.estado}`,
        `La orden avanzó de “${estadoOriginal.value}” a “${orden.value.estado}”.`,
        estadoOriginal.value,
        orden.value.estado
      )
    }

    await registrarHistorial('edicion', 'Orden actualizada', 'Se actualizaron los datos técnicos, financieros o administrativos de la orden.')

    alert('Orden actualizada correctamente.')
    router.push(`/ordenes/${orden.value.id}`)
  } catch (error) {
    alert(error.message)
  } finally {
    cargando.value = false
  }
}

onMounted(cargar)
</script>

<template>
  <div v-if="errorCarga" class="ts-edit-order-state">
    <h2>No se pudo cargar la orden</h2>
    <p>{{ errorCarga }}</p>
    <router-link to="/ordenes" class="ts-action-primary">Volver a órdenes</router-link>
  </div>

  <div v-else-if="orden && equipo" class="ts-edit-order-page">
    <header class="ts-edit-order-header">
      <div>
        <router-link :to="`/ordenes/${orden.id}`" class="ts-back-link">← Volver al detalle</router-link>
        <span class="ts-order-eyebrow">Orden {{ orden.folio }}</span>
        <h1>Editar orden</h1>
        <p>{{ equipo.marca }} {{ equipo.modelo }} · {{ orden.estado }}</p>
      </div>
      <div class="ts-edit-order-header-actions">
        <router-link :to="`/ordenes/${orden.id}`" class="ts-action-secondary">Cancelar</router-link>
        <button type="button" class="ts-action-primary" :disabled="cargando" @click="guardarCambios">
          {{ cargando ? 'Guardando...' : 'Guardar cambios' }}
        </button>
      </div>
    </header>

    <div class="ts-edit-order-shell">
      <aside class="ts-edit-order-nav">
        <button :class="{ active: seccion === 'equipo' }" @click="seccion = 'equipo'"><span>01</span><div><strong>Equipo</strong><small>Datos e identificación</small></div></button>
        <button :class="{ active: seccion === 'servicio' }" @click="seccion = 'servicio'"><span>02</span><div><strong>Servicio</strong><small>Falla y diagnóstico</small></div></button>
        <button :class="{ active: seccion === 'estado' }" @click="seccion = 'estado'"><span>03</span><div><strong>Estado</strong><small>Flujo de reparación</small></div></button>
        <button :class="{ active: seccion === 'finanzas' }" @click="seccion = 'finanzas'"><span>04</span><div><strong>Finanzas</strong><small>Total, pago y saldo</small></div></button>
        <button :class="{ active: seccion === 'garantia' }" @click="seccion = 'garantia'"><span>05</span><div><strong>Garantía</strong><small>Vigencia y condiciones</small></div></button>

        <div class="ts-edit-order-summary">
          <span>Resumen de pago</span>
          <strong>{{ moneda(orden.costo_total) }}</strong>
          <div class="ts-detail-progress"><span :style="{ width: porcentajePagado + '%' }"></span></div>
          <dl><div><dt>Pagado</dt><dd>{{ moneda(orden.anticipo) }}</dd></div><div><dt>Saldo</dt><dd>{{ moneda(saldo) }}</dd></div></dl>
        </div>
      </aside>

      <main class="ts-edit-order-content">
        <section v-if="seccion === 'equipo'" class="ts-edit-panel">
          <div class="ts-edit-panel-heading"><span>Información del dispositivo</span><h2>Equipo recibido</h2><p>Actualiza los datos físicos y de identificación del equipo.</p></div>
          <div class="ts-form-grid">
            <label><span>Tipo de equipo</span><select v-model="equipo.tipo_equipo"><option>Celular</option><option>Laptop</option><option>Tablet</option><option>iPad</option><option>Apple Watch</option><option>Impresora</option><option>PC</option><option>Consola</option><option>Otro</option></select></label>
            <label><span>Marca</span><input v-model="equipo.marca" placeholder="Ej. Apple"></label>
            <label><span>Modelo</span><input v-model="equipo.modelo" placeholder="Ej. iPhone 14 Pro"></label>
            <label><span>Color</span><input v-model="equipo.color" placeholder="Color del equipo"></label>
            <label><span>IMEI o número de serie</span><input v-model="equipo.imei_serie" placeholder="Identificador del equipo"></label>
            <label><span>Código de desbloqueo</span><input v-model="equipo.codigo_bloqueo" placeholder="Opcional"></label>
            <label class="is-wide"><span>Observaciones físicas</span><textarea v-model="equipo.observaciones" rows="4" placeholder="Golpes, rayones, piezas faltantes o condiciones de recepción"></textarea></label>
          </div>
        </section>

        <section v-else-if="seccion === 'servicio'" class="ts-edit-panel">
          <div class="ts-edit-panel-heading"><span>Información técnica</span><h2>Servicio y diagnóstico</h2><p>Conserva claramente lo que reportó el cliente y lo que encontró el técnico.</p></div>
          <div class="ts-form-stack">
            <label><span>Falla reportada *</span><textarea v-model="orden.falla_reportada" rows="4" placeholder="Describe lo que indicó el cliente"></textarea></label>
            <label><span>Diagnóstico técnico</span><textarea v-model="orden.diagnostico" rows="5" placeholder="Resultado de las pruebas y causa probable"></textarea></label>
            <label><span>Trabajo realizado</span><textarea v-model="orden.trabajo_realizado" rows="5" placeholder="Refacciones instaladas y procedimiento realizado"></textarea></label>
            <div class="ts-form-grid"><label><span>Técnico asignado</span><input v-model="orden.tecnico" placeholder="Nombre del técnico"></label><label><span>Notas internas</span><input v-model="orden.notas" placeholder="No visibles para el cliente"></label></div>
          </div>
        </section>

        <section v-else-if="seccion === 'estado'" class="ts-edit-panel">
          <div class="ts-edit-panel-heading"><span>Flujo operativo</span><h2>Estado de la reparación</h2><p>Selecciona el punto real en el que se encuentra la orden.</p></div>
          <div class="ts-status-selector">
            <label v-for="item in estados" :key="item.value" :class="{ selected: orden.estado === item.value }">
              <input v-model="orden.estado" type="radio" :value="item.value">
              <span class="ts-status-selector-dot"></span>
              <div><strong>{{ item.label }}</strong><small>{{ item.help }}</small></div>
              <b>✓</b>
            </label>
          </div>
          <div v-if="orden.estado !== estadoOriginal" class="ts-status-change-notice"><strong>Cambio pendiente</strong><p>{{ estadoOriginal }} → {{ orden.estado }}</p><small>Este cambio se registrará en la línea de tiempo al guardar.</small></div>
          <div v-if="orden.estado === 'Listo' && !orden.fecha_listo" class="ts-status-change-notice"><strong>Se notificará al cliente</strong><p>Al guardar, quedará marcada la fecha de hoy como el momento en que el equipo quedó listo y se avisó al cliente.</p><small>Desde esa fecha empiezan a contar la garantía y, si aplica, los días de gracia antes del cobro por almacenamiento.</small></div>
          <div v-if="orden.estado === 'Entregado' && saldo > 0" class="ts-status-change-notice" style="border-color:#f2b8b5;background:#fff5f5"><strong>⚠ Saldo pendiente</strong><p>Este equipo tiene {{ moneda(saldo) }} sin pagar. La política del taller es entregar solo equipos liquidados.</p><small>Se te pedirá confirmación al guardar si continúas con esta entrega.</small></div>
        </section>

        <section v-else-if="seccion === 'finanzas'" class="ts-edit-panel ts-finance-panel">
          <div class="ts-edit-panel-heading ts-finance-heading">
            <span>Control financiero</span>
            <h2>Costo y pagos</h2>
            <p>Consulta el total, lo pagado y el saldo pendiente de la orden.</p>
          </div>

          <div class="ts-finance-editor-grid ts-finance-clean-grid">
            <label class="ts-finance-field">
              <span>Total de la reparación</span>
              <div class="ts-money-input"><b>$</b><input v-model.number="orden.costo_total" type="number" min="0" step="0.01"></div>
            </label>
            <label class="ts-finance-field">
              <span>Pagado / anticipo</span>
              <div class="ts-money-input"><b>$</b><input v-model.number="orden.anticipo" type="number" min="0" step="0.01"></div>
            </label>

            <div class="ts-payment-method-card ts-payment-clean">
              <div class="ts-payment-title">
                <div>
                  <strong>Método de pago</strong>
                  <small>Selecciona cómo se recibió el pago.</small>
                </div>
                <span v-if="orden.metodo_pago && orden.metodo_pago !== 'No especificado'" class="ts-payment-current">{{ orden.metodo_pago }}</span>
              </div>
              <div class="ts-payment-method-options">
                <button v-for="metodo in ['Efectivo','Transferencia','Tarjeta']" :key="metodo" type="button" :class="{ active: orden.metodo_pago === metodo }" @click="orden.metodo_pago = metodo">
                  <span class="ts-payment-icon">{{ metodo === 'Efectivo' ? '$' : metodo === 'Transferencia' ? '↗' : '▣' }}</span>
                  <span>{{ metodo }}</span>
                </button>
              </div>
            </div>

            <div class="ts-finance-editor-result ts-finance-balance-card">
              <div>
                <span>Saldo pendiente</span>
                <strong>{{ moneda(saldo) }}</strong>
                <small>{{ porcentajePagado }}% del total cubierto</small>
              </div>
              <div class="ts-detail-progress"><span :style="{ width: porcentajePagado + '%' }"></span></div>
            </div>
          </div>

          <p class="ts-finance-note">Para registrar abonos posteriores y conservar el historial de cada pago, utiliza el módulo de Caja.</p>
        </section>

        <section v-else class="ts-edit-panel">
          <div class="ts-edit-panel-heading"><span>Protección del servicio</span><h2>Garantía</h2><p>Define la vigencia y las condiciones que se entregarán al cliente.</p></div>
          <div class="ts-form-grid">
            <label><span>Tipo de servicio</span><select v-model="garantia.tipo_servicio" @change="aplicarGarantia"><option v-if="!configuracionGarantias.length">Reparación</option><option v-for="g in configuracionGarantias" :key="g.id" :value="g.tipo_servicio">{{ g.tipo_servicio }}</option></select></label>
            <label><span>Días de garantía</span><input v-model.number="garantia.dias_garantia" type="number" min="0"></label>
            <label class="is-wide"><span>Condiciones</span><textarea v-model="garantia.condiciones" rows="6" placeholder="Describe qué cubre y qué situaciones invalidan la garantía"></textarea></label>
            <label class="ts-toggle-row"><input v-model="garantia.activa" type="checkbox"><span><strong>Garantía activa</strong><small>Permite mostrarla como vigente dentro del sistema.</small></span></label>
          </div>
        </section>

        <footer class="ts-edit-order-footer">
          <button v-if="seccion !== 'equipo'" type="button" class="ts-action-secondary" @click="seccion = ['equipo','servicio','estado','finanzas','garantia'][Math.max(0, ['equipo','servicio','estado','finanzas','garantia'].indexOf(seccion)-1)]">Anterior</button>
          <span></span>
          <button v-if="seccion !== 'garantia'" type="button" class="ts-action-primary" @click="seccion = ['equipo','servicio','estado','finanzas','garantia'][Math.min(4, ['equipo','servicio','estado','finanzas','garantia'].indexOf(seccion)+1)]">Continuar</button>
          <button v-else type="button" class="ts-action-primary" :disabled="cargando" @click="guardarCambios">{{ cargando ? 'Guardando...' : 'Guardar cambios' }}</button>
        </footer>
      </main>
    </div>
  </div>

  <div v-else class="ts-detail-loading"><span></span><p>Cargando orden...</p></div>
</template>

<style scoped>
.ts-finance-panel { min-height: auto; }
.ts-finance-heading { margin-bottom: 22px; }
.ts-finance-clean-grid { gap: 16px; }
.ts-finance-field > span { margin-bottom: 1px; }
.ts-payment-clean { padding: 16px; border-radius: 16px; background: #fff; }
.ts-payment-title { display:flex; align-items:center; justify-content:space-between; gap:14px; }
.ts-payment-title > div { display:grid; gap:3px; }
.ts-payment-title strong { font-size:.86rem; color:var(--ts-text,#101828); }
.ts-payment-title small { color:#667085; font-size:.76rem; }
.ts-payment-current { flex:0 0 auto; padding:6px 10px; border-radius:999px; background:#eff6ff; color:#2563eb; font-size:.72rem; font-weight:800; }
.ts-payment-method-options { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; margin-top:14px; }
.ts-payment-method-options button { min-height:50px; display:flex; align-items:center; justify-content:center; gap:8px; border:1px solid #d0d5dd; border-radius:13px; background:#fff; color:#344054; font:inherit; font-size:.82rem; font-weight:750; cursor:pointer; transition:.18s ease; }
.ts-payment-method-options button:hover { border-color:#98a2b3; background:#f9fafb; }
.ts-payment-method-options button.active { border-color:#2563eb; background:#eff6ff; color:#1d4ed8; box-shadow:0 0 0 3px rgba(37,99,235,.08); }
.ts-payment-icon { width:24px; height:24px; display:grid; place-items:center; border-radius:8px; background:#f2f4f7; font-size:.78rem; font-weight:900; }
.ts-payment-method-options button.active .ts-payment-icon { background:#dbeafe; }
.ts-finance-balance-card { padding:18px 20px; border:1px solid #eaecf0; background:#f8fafc; }
.ts-finance-balance-card > div:first-child { display:grid; gap:3px; }
.ts-finance-balance-card > div:first-child > span { color:#667085; font-size:.78rem; font-weight:750; }
.ts-finance-balance-card > div:first-child > strong { margin:0; font-size:1.75rem; letter-spacing:-.03em; }
.ts-finance-balance-card > div:first-child > small { color:#667085; }
.ts-finance-note { margin:14px 2px 0; color:#667085; font-size:.78rem; line-height:1.5; }
@media (max-width: 680px) {
  .ts-finance-panel { padding:18px 16px; }
  .ts-finance-heading { margin-bottom:16px; }
  .ts-finance-heading h2 { font-size:1.35rem; }
  .ts-finance-heading p { font-size:.82rem; line-height:1.45; }
  .ts-finance-clean-grid { gap:14px; }
  .ts-payment-clean { padding:14px; }
  .ts-payment-title { align-items:flex-start; }
  .ts-payment-current { display:none; }
  .ts-payment-method-options { grid-template-columns:repeat(3,minmax(0,1fr)); gap:7px; }
  .ts-payment-method-options button { min-height:62px; padding:8px 5px; flex-direction:column; gap:4px; font-size:.72rem; text-align:center; }
  .ts-payment-icon { width:26px; height:26px; }
  .ts-finance-balance-card { padding:16px; }
  .ts-finance-balance-card > div:first-child > strong { font-size:1.65rem; }
  .ts-finance-note { margin-top:12px; font-size:.73rem; }
}
</style>
