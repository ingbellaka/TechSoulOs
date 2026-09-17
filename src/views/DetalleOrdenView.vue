<script setup>
import { ref, onMounted, computed, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { supabase } from '../lib/supabase'
import TicketPreviewModal from '../components/tickets/TicketPreviewModal.vue'
import { buildReciboOrden, buildTicketOrdenServicio } from '../utils/tickets'
import { subirEvidencia } from '../lib/storage'

const route = useRoute()
const orden = ref(null)
const evidencias = ref([])
const checklist = ref([])
const garantia = ref(null)
const movimientos = ref([])
const ticketActual = ref(null)
const firmas = ref([])
const historial = ref([])
const seccionActiva = ref('resumen')
const negocio = ref({ nombre_negocio: 'TechSoul', cuota_almacenamiento_dia: 50, dias_gracia_almacenamiento: 30 })

const canvasFirma = ref(null)
const dibujando = ref(false)
const nombreFirmante = ref('')
const aceptaCondiciones = ref(false)
const nuevaFoto = ref(null)
const subiendoFoto = ref(false)

function moneda(valor) {
  return Number(valor || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
}

function fecha(valor, conHora = true) {
  if (!valor) return 'Sin fecha'
  return new Date(valor).toLocaleString('es-MX', conHora
    ? { dateStyle: 'medium', timeStyle: 'short' }
    : { dateStyle: 'medium' })
}

const ingresos = computed(() => movimientos.value.filter(m => m.tipo === 'Entrada').reduce((s, m) => s + Number(m.monto || 0), 0))
const gastos = computed(() => movimientos.value.filter(m => m.tipo === 'Salida').reduce((s, m) => s + Number(m.monto || 0), 0))
const utilidad = computed(() => ingresos.value - gastos.value)
const saldoOrden = computed(() => Math.max(0, Number(orden.value?.costo_total || 0) - Number(orden.value?.anticipo || 0)))

const porcentajePagado = computed(() => {
  const total = Number(orden.value?.costo_total || 0)
  if (!total) return 0
  return Math.min(100, Math.round((Number(orden.value?.anticipo || 0) / total) * 100))
})

const diasEnEspera = computed(() => {
  if (!orden.value?.fecha_listo || orden.value.estado === 'Entregado') return 0
  const ms = Date.now() - new Date(orden.value.fecha_listo).getTime()
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)))
})
const diasGraciaAlmacenamiento = computed(() => Number(negocio.value?.dias_gracia_almacenamiento ?? 30))
const diasConCargo = computed(() => Math.max(0, diasEnEspera.value - diasGraciaAlmacenamiento.value))
const cargoAlmacenamiento = computed(() => diasConCargo.value * Number(negocio.value?.cuota_almacenamiento_dia || 0))

const checklistAgrupado = computed(() => ({
  bien: checklist.value.filter(c => normalizarEstado(c.estado) === 'bien'),
  falla: checklist.value.filter(c => normalizarEstado(c.estado) === 'falla'),
  pendiente: checklist.value.filter(c => normalizarEstado(c.estado) === 'pendiente'),
  noAplica: checklist.value.filter(c => normalizarEstado(c.estado) === 'no-aplica')
}))

function normalizarEstado(estado = '') {
  const value = String(estado).toLowerCase()
  if (value.includes('funciona') && !value.includes('no funciona')) return 'bien'
  if (value.includes('no funciona') || value.includes('falla')) return 'falla'
  if (value.includes('no aplica')) return 'no-aplica'
  return 'pendiente'
}

function estadoOrdenClase() {
  const estado = String(orden.value?.estado || '').toLowerCase()
  if (estado.includes('list')) return 'is-success'
  if (estado.includes('cancel')) return 'is-danger'
  if (estado.includes('esper')) return 'is-warning'
  return 'is-info'
}

function whatsappLink() {
  const telefono = orden.value?.clientes?.whatsapp || orden.value?.clientes?.telefono || ''
  const limpio = telefono.replace(/\D/g, '')
  const mensaje = `Hola ${orden.value?.clientes?.nombre || ''}, te escribimos de TechSoul. Tu equipo ${orden.value?.equipos?.marca || ''} ${orden.value?.equipos?.modelo || ''} está en estado: ${orden.value?.estado}. Folio: ${orden.value?.folio}. Saldo pendiente: ${moneda(saldoOrden.value)}.`
  return `https://wa.me/52${limpio}?text=${encodeURIComponent(mensaje)}`
}

async function cargarDetalle() {
  const id = route.params.id

  const { data: dataOrden, error } = await supabase
    .from('ordenes')
    .select('*, clientes(*), equipos(*)')
    .eq('id', id)
    .single()

  if (error) {
    alert(error.message)
    return
  }

  orden.value = dataOrden
  nombreFirmante.value = dataOrden.clientes?.nombre || ''

  const [{ data: fotos }, { data: checks }, { data: garantias }, { data: movs }, { data: dataFirmas }, historialResult, { data: dataNegocio }] = await Promise.all([
    supabase.from('evidencias').select('*').eq('orden_id', id).order('id', { ascending: false }),
    supabase.from('checklist_orden').select('*').eq('orden_id', id).order('id'),
    supabase.from('garantias').select('*').eq('orden_id', id).order('id', { ascending: false }),
    supabase.from('movimientos_caja').select('*').eq('referencia_tipo', 'orden').eq('referencia_id', id).order('id', { ascending: false }),
    supabase.from('firmas_orden').select('*').eq('orden_id', id).order('id', { ascending: false }),
    supabase.from('orden_historial').select('*').eq('orden_id', id).order('created_at', { ascending: false }),
    supabase.from('configuracion_negocio').select('*').order('id').limit(1).single()
  ])

  evidencias.value = fotos || []
  checklist.value = checks || []
  garantia.value = (garantias || [])[0] || null
  movimientos.value = movs || []
  firmas.value = dataFirmas || []
  historial.value = historialResult.data || []
  if (dataNegocio) negocio.value = dataNegocio

  await nextTick()
  prepararCanvas()
}

function abrirTicketOrdenServicio() {
  if (!orden.value) return
  const ultimoPago = movimientos.value.find(m => m.tipo === 'Entrada')
  const metodoPago = ultimoPago?.metodo_pago || orden.value?.metodo_pago || orden.value?.forma_pago || 'No especificado'
  ticketActual.value = buildTicketOrdenServicio({
    orden: orden.value,
    negocio: negocio.value,
    paymentMethod: metodoPago,
    firma: firmas.value[0] || null
  })
}

function abrirReciboMovimiento(movimiento) {
  if (!orden.value || movimiento?.tipo !== 'Entrada') return
  const pagosOrdenados = movimientos.value
    .filter(m => m.tipo === 'Entrada')
    .slice()
    .sort((a,b) => Number(a.id) - Number(b.id))
  const pagadoAnterior = pagosOrdenados
    .filter(m => Number(m.id) < Number(movimiento.id))
    .reduce((sum, m) => sum + Number(m.monto || 0), 0)
  ticketActual.value = buildReciboOrden({ movimiento, orden: orden.value, negocio: negocio.value, pagadoAnterior })
}

function prepararCanvas() {
  const canvas = canvasFirma.value
  if (!canvas) return

  const rect = canvas.getBoundingClientRect()
  canvas.width = Math.max(320, rect.width)
  canvas.height = 180

  const ctx = canvas.getContext('2d')
  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.strokeStyle = '#111827'
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
}

function posicion(event) {
  const canvas = canvasFirma.value
  const rect = canvas.getBoundingClientRect()
  const e = event.touches ? event.touches[0] : event
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}

function iniciarFirma(event) {
  dibujando.value = true
  const ctx = canvasFirma.value.getContext('2d')
  const p = posicion(event)
  ctx.beginPath()
  ctx.moveTo(p.x, p.y)
}

function dibujarFirma(event) {
  if (!dibujando.value) return
  event.preventDefault()
  const ctx = canvasFirma.value.getContext('2d')
  const p = posicion(event)
  ctx.lineTo(p.x, p.y)
  ctx.stroke()
}

function terminarFirma() {
  dibujando.value = false
}

function limpiarFirma() {
  prepararCanvas()
}

async function guardarFirma() {
  if (!nombreFirmante.value.trim()) {
    alert('Escribe el nombre de quien firma')
    return
  }

  if (!aceptaCondiciones.value) {
    alert('El cliente debe aceptar las condiciones antes de firmar')
    return
  }

  const firmaBase64 = canvasFirma.value.toDataURL('image/png')
  const { error } = await supabase.from('firmas_orden').insert({
    orden_id: orden.value.id,
    firma_base64: firmaBase64,
    nombre_firmante: nombreFirmante.value.trim()
  })

  if (error) {
    alert(error.message)
    return
  }

  alert('Firma guardada')
  await cargarDetalle()
}

function seleccionarNuevaFoto(event) {
  nuevaFoto.value = event.target.files[0] || null
}

async function agregarEvidencia() {
  if (!nuevaFoto.value) {
    alert('Selecciona una foto')
    return
  }

  subiendoFoto.value = true
  try {
    const url = await subirEvidencia(nuevaFoto.value, `orden-${orden.value.id}`)
    const { error } = await supabase.from('evidencias').insert({
      orden_id: orden.value.id,
      tipo: 'Extra',
      url_imagen: url,
      descripcion: nuevaFoto.value.name
    })
    if (error) throw error
    nuevaFoto.value = null
    await cargarDetalle()
    alert('Evidencia agregada')
  } catch (error) {
    alert(error.message)
  } finally {
    subiendoFoto.value = false
  }
}

function escaparHtml(valor = '') {
  return String(valor ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function filaChecklist() {
  if (!checklist.value.length) return '<p class="muted">Sin checklist registrado.</p>'
  return `<div class="check-grid">${checklist.value.map((item) => `
    <div class="check-item">
      <span>${escaparHtml(item.item)}</span>
      <b>${escaparHtml(item.estado || 'Pendiente')}</b>
      ${item.notas ? `<small>${escaparHtml(item.notas)}</small>` : ''}
    </div>`).join('')}</div>`
}

function generarPdfOrden() {
  if (!orden.value) return
  const o = orden.value
  const cliente = o.clientes || {}
  const equipo = o.equipos || {}
  const firma = firmas.value[0]
  const popup = window.open('', '_blank')
  if (!popup) {
    alert('El navegador bloqueó la ventana del PDF. Permite ventanas emergentes para TechSoul e inténtalo otra vez.')
    return
  }

  const html = `<!doctype html>
  <html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Orden-${escaparHtml(o.folio || o.id)}</title>
  <style>
    @page{size:A4;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#172033;margin:0;background:#fff;font-size:11px;line-height:1.45}.sheet{max-width:186mm;margin:0 auto}.header{display:flex;justify-content:space-between;gap:20px;border-bottom:3px solid #2563eb;padding-bottom:14px;margin-bottom:14px}.brand h1{font-size:24px;margin:0;color:#101828}.brand p{margin:3px 0;color:#667085}.folio{text-align:right}.folio span{display:block;color:#667085;text-transform:uppercase;letter-spacing:.08em;font-size:9px}.folio strong{display:block;font-size:20px;color:#2563eb;margin:2px 0}.status{display:inline-block;border-radius:999px;background:#eef4ff;color:#1849a9;padding:4px 9px;font-weight:700}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px}.card{border:1px solid #dfe5ee;border-radius:9px;padding:11px;break-inside:avoid}.card h2{font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:#475467;margin:0 0 8px}.row{display:grid;grid-template-columns:95px 1fr;gap:8px;margin:4px 0}.row span{color:#667085}.row b{font-weight:600;overflow-wrap:anywhere}.wide{grid-column:1/-1}.text-block{min-height:42px;border-radius:7px;background:#f8fafc;padding:9px;white-space:pre-wrap}.totals{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.total{background:#f8fafc;border-radius:8px;padding:9px}.total span{display:block;color:#667085;font-size:9px;text-transform:uppercase}.total b{display:block;font-size:15px;margin-top:2px}.total.balance b{color:#b42318}.check-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}.check-item{border-bottom:1px solid #edf0f4;padding:5px 0;display:grid;grid-template-columns:1fr auto;gap:4px}.check-item b{font-size:9px;color:#344054}.check-item small{grid-column:1/-1;color:#667085}.signature{height:72px;display:flex;align-items:flex-end;justify-content:center}.signature img{max-height:58px;max-width:220px}.signature-line{border-top:1px solid #667085;padding-top:5px;text-align:center;color:#475467}.conditions{margin-top:12px;border-top:1px solid #dfe5ee;padding-top:9px;color:#667085;font-size:9px}.muted{color:#98a2b3}.footer{margin-top:10px;text-align:center;color:#98a2b3;font-size:9px}@media print{.no-print{display:none!important}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style></head><body><main class="sheet">
    <header class="header"><div class="brand"><h1>${escaparHtml(negocio.value.nombre_negocio || 'TechSoul')}</h1><p>Especialistas en celulares</p><p>${escaparHtml(negocio.value.direccion || '')}</p><p>${escaparHtml(negocio.value.telefono || '')}</p></div><div class="folio"><span>Orden de servicio</span><strong>${escaparHtml(o.folio || o.id)}</strong><span class="status">${escaparHtml(o.estado || 'Recibido')}</span><p>${escaparHtml(fecha(o.fecha_ingreso))}</p></div></header>
    <section class="grid">
      <article class="card"><h2>Cliente</h2><div class="row"><span>Nombre</span><b>${escaparHtml(cliente.nombre || 'No registrado')}</b></div><div class="row"><span>Teléfono</span><b>${escaparHtml(cliente.telefono || cliente.whatsapp || 'No registrado')}</b></div><div class="row"><span>Correo</span><b>${escaparHtml(cliente.correo || 'No registrado')}</b></div></article>
      <article class="card"><h2>Equipo</h2><div class="row"><span>Equipo</span><b>${escaparHtml([equipo.marca,equipo.modelo].filter(Boolean).join(' ') || 'No registrado')}</b></div><div class="row"><span>Tipo / color</span><b>${escaparHtml([equipo.tipo_equipo,equipo.color].filter(Boolean).join(' · ') || 'No registrado')}</b></div><div class="row"><span>IMEI / Serie</span><b>${escaparHtml(equipo.imei_serie || 'No registrado')}</b></div><div class="row"><span>Accesorios</span><b>${escaparHtml(o.accesorios || equipo.accesorios || 'Ninguno registrado')}</b></div></article>
      <article class="card wide"><h2>Falla reportada</h2><div class="text-block">${escaparHtml(o.falla_reportada || 'Sin información')}</div></article>
      <article class="card"><h2>Diagnóstico</h2><div class="text-block">${escaparHtml(o.diagnostico || 'Pendiente')}</div></article>
      <article class="card"><h2>Trabajo realizado</h2><div class="text-block">${escaparHtml(o.trabajo_realizado || 'Pendiente')}</div></article>
      <article class="card wide"><h2>Checklist de recepción</h2>${filaChecklist()}</article>
      <article class="card wide"><h2>Resumen financiero</h2><div class="totals"><div class="total"><span>Total</span><b>${escaparHtml(moneda(o.costo_total))}</b></div><div class="total"><span>Anticipo / pagado</span><b>${escaparHtml(moneda(o.anticipo))}</b></div><div class="total balance"><span>Saldo pendiente</span><b>${escaparHtml(moneda(Math.max(0, Number(o.costo_total || 0) - Number(o.anticipo || 0))))}</b></div></div>${cargoAlmacenamiento.value > 0 ? `<p style="margin-top:8px;color:#b42318"><b>Cargo por almacenamiento:</b> ${escaparHtml(moneda(cargoAlmacenamiento.value))} (${diasConCargo.value} día${diasConCargo.value === 1 ? '' : 's'} después del periodo de gracia). No incluido en el saldo mostrado arriba; se agrega al momento de pagar y recoger el equipo.</p>` : ''}</article>
      ${garantia.value ? `<article class="card wide"><h2>Garantía</h2><div class="row"><span>Servicio</span><b>${escaparHtml(garantia.value.tipo_servicio || 'Servicio registrado')}</b></div><div class="row"><span>Vigencia</span><b>${escaparHtml(garantia.value.dias_garantia || 0)} días, a partir de que se notifica que el equipo está listo</b></div><div class="row"><span>Condiciones</span><b>${escaparHtml(garantia.value.condiciones || 'Sin condiciones adicionales')}</b></div></article>` : ''}
      <article class="card"><h2>Firma de recepción / conformidad</h2><div class="signature">${firma?.firma_base64 ? `<img src="${firma.firma_base64}" alt="Firma">` : ''}</div><div class="signature-line">${escaparHtml(firma?.nombre_firmante || cliente.nombre || 'Nombre y firma del cliente')}</div></article>
      <article class="card"><h2>Responsable</h2><div class="signature">${negocio.value?.firma_url ? `<img src="${escaparHtml(negocio.value.firma_url)}" alt="Firma del responsable">` : ''}</div><div class="signature-line">${escaparHtml(negocio.value?.responsable_nombre || o.tecnico || 'Técnico / recepción')}</div></article>
    </section>
    <p class="conditions"><b>Condiciones del servicio:</b> (1) La garantía cubre exclusivamente el trabajo o la pieza indicada arriba y no cubre golpes, humedad, mal uso, manipulación por terceros ni fallas ajenas al trabajo realizado. (2) La vigencia de la garantía comienza a partir de la fecha en que se notifica al cliente que el equipo está listo para recoger, no desde el ingreso del equipo. (3) Equipos no recogidos después de ${escaparHtml(diasGraciaAlmacenamiento.value)} días de esa notificación generarán una cuota de almacenamiento de ${escaparHtml(moneda(Number(negocio.value?.cuota_almacenamiento_dia || 0)))} por día adicional. (4) La entrega del equipo está sujeta a que el saldo se encuentre completamente liquidado. Al firmar, el cliente declara haber leído y aceptado estas condiciones.</p>
    <p class="footer">Documento generado por TechSoul OS · ${escaparHtml(new Date().toLocaleString('es-MX'))}</p>
    <div class="no-print" style="position:fixed;right:18px;bottom:18px"><button onclick="window.print()" style="border:0;border-radius:9px;background:#2563eb;color:white;padding:11px 16px;font-weight:700;cursor:pointer">Guardar como PDF / Imprimir</button></div>
  </main><script>setTimeout(()=>window.print(),350)<\/script></body></html>`
  popup.document.open()
  popup.document.write(html)
  popup.document.close()
}

onMounted(cargarDetalle)
</script>

<template>
  <div v-if="orden" class="ts-order-detail-page">
    <header class="ts-order-detail-header no-print">
      <div>
        <router-link to="/ordenes" class="ts-back-link">← Volver a órdenes</router-link>
        <div class="ts-order-detail-title-row">
          <div>
            <span class="ts-order-eyebrow">Orden {{ orden.folio }}</span>
            <h1>{{ orden.equipos?.marca }} {{ orden.equipos?.modelo }}</h1>
            <p>{{ orden.clientes?.nombre }} · Ingresó {{ fecha(orden.fecha_ingreso) }}</p>
          </div>
          <span class="ts-order-state-badge" :class="estadoOrdenClase()">{{ orden.estado }}</span>
        </div>
      </div>

      <div class="ts-order-detail-actions">
        <router-link class="ts-action-primary ts-edit-order-action" :to="`/ordenes/${orden.id}/editar`">
          <span class="ts-action-icon" aria-hidden="true">✎</span>
          <span>Editar orden</span>
        </router-link>
        <a class="ts-action-secondary ts-whatsapp-button" :href="whatsappLink()" target="_blank" rel="noopener">WhatsApp</a>
        <button class="ts-action-secondary" type="button" @click="abrirTicketOrdenServicio">Comprobante de pago</button>
        <button class="ts-action-secondary" type="button" @click="generarPdfOrden">Orden de servicio PDF</button>
      </div>
    </header>

    <nav class="ts-order-tabs no-print" aria-label="Secciones de la orden">
      <button v-for="tab in [
        ['resumen','Resumen'],['historial','Historial'],['evidencias','Evidencias'],['finanzas','Finanzas'],['firma','Firma']
      ]" :key="tab[0]" type="button" :class="{ active: seccionActiva === tab[0] }" @click="seccionActiva = tab[0]; tab[0] === 'firma' && nextTick(prepararCanvas)">
        {{ tab[1] }}
      </button>
    </nav>

    <section v-if="seccionActiva === 'resumen'" class="ts-order-detail-layout">
      <main class="ts-order-detail-main">
        <article class="ts-detail-card ts-order-hero-card">
          <div class="ts-order-device-icon">{{ orden.equipos?.tipo_equipo === 'Tablet' ? '▰' : '▯' }}</div>
          <div>
            <span class="ts-detail-label">Equipo recibido</span>
            <h2>{{ orden.equipos?.marca }} {{ orden.equipos?.modelo }}</h2>
            <p>{{ orden.equipos?.tipo_equipo || 'Equipo' }}<span v-if="orden.equipos?.color"> · {{ orden.equipos.color }}</span></p>
          </div>
          <dl class="ts-order-device-meta">
            <div><dt>IMEI / Serie</dt><dd>{{ orden.equipos?.imei_serie || 'No registrado' }}</dd></div>
            <div><dt>Código</dt><dd>{{ orden.equipos?.codigo_bloqueo || 'No registrado' }}</dd></div>
            <div><dt>Técnico</dt><dd>{{ orden.tecnico || 'Sin asignar' }}</dd></div>
          </dl>
        </article>

        <article class="ts-detail-card">
          <div class="ts-detail-card-heading">
            <div><span class="ts-detail-label">Recepción técnica</span><h2>Problema y diagnóstico</h2></div>
          </div>
          <div class="ts-diagnosis-grid">
            <div class="ts-diagnosis-block is-reported"><span>Falla reportada</span><p>{{ orden.falla_reportada || 'Sin información' }}</p></div>
            <div class="ts-diagnosis-block"><span>Diagnóstico</span><p>{{ orden.diagnostico || 'Aún no se ha registrado un diagnóstico.' }}</p></div>
            <div class="ts-diagnosis-block"><span>Trabajo realizado</span><p>{{ orden.trabajo_realizado || 'Pendiente de registrar.' }}</p></div>
          </div>
        </article>

        <article class="ts-detail-card" v-if="checklist.length">
          <div class="ts-detail-card-heading">
            <div><span class="ts-detail-label">Estado al recibir</span><h2>Checklist del equipo</h2></div>
            <div class="ts-check-summary">
              <span class="is-good">{{ checklistAgrupado.bien.length }} bien</span>
              <span class="is-bad">{{ checklistAgrupado.falla.length }} con falla</span>
              <span>{{ checklistAgrupado.pendiente.length }} pendientes</span>
            </div>
          </div>
          <div class="ts-checklist-detail-grid">
            <div v-for="c in checklist" :key="c.id" class="ts-checklist-detail-item" :class="`is-${normalizarEstado(c.estado)}`">
              <span class="ts-check-status-dot"></span>
              <div><strong>{{ c.item }}</strong><small>{{ c.estado }}<template v-if="c.notas"> · {{ c.notas }}</template></small></div>
            </div>
          </div>
        </article>

        <article class="ts-detail-card" v-if="garantia">
          <div class="ts-detail-card-heading"><div><span class="ts-detail-label">Protección del servicio</span><h2>Garantía</h2></div></div>
          <div class="ts-warranty-detail-grid">
            <div><span>Servicio</span><strong>{{ garantia.tipo_servicio || 'Servicio registrado' }}</strong></div>
            <div><span>Vigencia</span><strong>{{ garantia.dias_garantia }} días</strong></div>
            <div class="is-wide"><span>Condiciones</span><p>{{ garantia.condiciones || 'Sin condiciones adicionales.' }}</p></div>
          </div>
        </article>
      </main>

      <aside class="ts-order-detail-sidebar">
        <article class="ts-detail-card ts-client-mini-card">
          <span class="ts-detail-label">Cliente</span>
          <div class="ts-client-mini-head"><div class="ts-client-avatar">{{ (orden.clientes?.nombre || 'C').charAt(0).toUpperCase() }}</div><div><h3>{{ orden.clientes?.nombre }}</h3><p>{{ orden.clientes?.telefono || 'Sin teléfono' }}</p></div></div>
          <a :href="whatsappLink()" target="_blank" rel="noopener">Enviar actualización por WhatsApp</a>
        </article>

        <article class="ts-detail-card ts-payment-detail-card">
          <span class="ts-detail-label">Estado de pago</span>
          <div class="ts-payment-detail-total"><span>Total</span><strong>{{ moneda(orden.costo_total) }}</strong></div>
          <div class="ts-detail-progress"><span :style="{ width: porcentajePagado + '%' }"></span></div>
          <div class="ts-payment-detail-grid"><div><span>Pagado</span><strong>{{ moneda(orden.anticipo) }}</strong></div><div><span>Saldo</span><strong class="is-danger">{{ moneda(saldoOrden) }}</strong></div></div>
          <small>{{ porcentajePagado }}% cubierto</small>
        </article>

        <article class="ts-detail-card ts-order-quick-info">
          <span class="ts-detail-label">Información rápida</span>
          <dl>
            <div><dt>Folio</dt><dd>{{ orden.folio }}</dd></div>
            <div><dt>Ingreso</dt><dd>{{ fecha(orden.fecha_ingreso, false) }}</dd></div>
            <div><dt>Listo / notificado</dt><dd>{{ orden.fecha_listo ? fecha(orden.fecha_listo, false) : 'Aún no' }}</dd></div>
            <div><dt>Evidencias</dt><dd>{{ evidencias.length }}</dd></div>
            <div><dt>Firmas</dt><dd>{{ firmas.length }}</dd></div>
          </dl>
        </article>

        <article class="ts-detail-card" v-if="orden.fecha_listo && orden.estado !== 'Entregado'" :style="diasConCargo > 0 ? 'border-color:#f2b8b5;background:#fff8f7' : ''">
          <span class="ts-detail-label">Tiempo en espera</span>
          <div class="ts-payment-detail-total"><span>Días desde que se avisó</span><strong>{{ diasEnEspera }}</strong></div>
          <p v-if="diasConCargo > 0" style="color:#b42318;font-weight:600;margin-top:6px">⚠ Ya generó {{ moneda(cargoAlmacenamiento) }} de almacenamiento ({{ diasConCargo }} día{{ diasConCargo === 1 ? '' : 's' }} extra)</p>
          <p v-else style="color:#667085;margin-top:6px">Dentro del periodo de gracia ({{ diasGraciaAlmacenamiento }} días)</p>
        </article>
      </aside>
    </section>


    <section v-else-if="seccionActiva === 'historial'" class="ts-detail-card ts-detail-section-panel">
      <div class="ts-detail-card-heading">
        <div><span class="ts-detail-label">Seguimiento completo</span><h2>Línea de tiempo</h2><p>Cambios de estado y actualizaciones realizadas en la orden.</p></div>
      </div>
      <div v-if="historial.length" class="ts-order-timeline">
        <article v-for="evento in historial" :key="evento.id" class="ts-order-timeline-item" :class="`is-${evento.tipo || 'actividad'}`">
          <span class="ts-order-timeline-marker"></span>
          <div class="ts-order-timeline-content">
            <div><strong>{{ evento.titulo }}</strong><time>{{ fecha(evento.created_at) }}</time></div>
            <p v-if="evento.descripcion">{{ evento.descripcion }}</p>
            <span v-if="evento.estado_anterior && evento.estado_nuevo" class="ts-order-timeline-change">{{ evento.estado_anterior }} <b>→</b> {{ evento.estado_nuevo }}</span>
          </div>
        </article>
      </div>
      <div v-else class="ts-empty-detail-state"><strong>Aún no hay actividad registrada</strong><p>Los próximos cambios de estado, pagos y ediciones aparecerán aquí automáticamente.</p></div>
    </section>

    <section v-else-if="seccionActiva === 'evidencias'" class="ts-detail-card ts-detail-section-panel">
      <div class="ts-detail-card-heading no-print">
        <div><span class="ts-detail-label">Registro visual</span><h2>Evidencias de la orden</h2><p>Fotografías de recepción, proceso y entrega.</p></div>
        <label class="ts-upload-evidence-button"><input type="file" accept="image/*" @change="seleccionarNuevaFoto"><span>{{ nuevaFoto ? nuevaFoto.name : 'Seleccionar imagen' }}</span></label>
      </div>
      <div class="ts-upload-evidence-actions no-print" v-if="nuevaFoto"><button class="ts-action-primary" type="button" :disabled="subiendoFoto" @click="agregarEvidencia">{{ subiendoFoto ? 'Subiendo...' : 'Subir evidencia' }}</button></div>
      <div v-if="evidencias.length" class="ts-evidence-gallery">
        <figure v-for="foto in evidencias" :key="foto.id"><img :src="foto.url_imagen" :alt="foto.descripcion || 'Evidencia de la orden'"><figcaption>{{ foto.descripcion || foto.tipo || 'Evidencia' }}</figcaption></figure>
      </div>
      <div v-else class="ts-empty-detail-state"><strong>Aún no hay fotografías</strong><p>Selecciona una imagen para comenzar el registro visual.</p></div>
    </section>

    <section v-else-if="seccionActiva === 'finanzas'" class="ts-finance-detail-grid">
      <article class="ts-detail-card ts-finance-summary-card"><span class="ts-detail-label">Ingresos</span><strong>{{ moneda(ingresos) }}</strong><small>Pagos vinculados a esta orden</small></article>
      <article class="ts-detail-card ts-finance-summary-card"><span class="ts-detail-label">Gastos</span><strong>{{ moneda(gastos) }}</strong><small>Refacciones y gastos registrados</small></article>
      <article class="ts-detail-card ts-finance-summary-card is-profit"><span class="ts-detail-label">Utilidad estimada</span><strong>{{ moneda(utilidad) }}</strong><small>Ingresos menos gastos</small></article>
      <article class="ts-detail-card ts-detail-movements-card">
        <div class="ts-detail-card-heading"><div><span class="ts-detail-label">Historial financiero</span><h2>Movimientos</h2></div></div>
        <div v-if="movimientos.length" class="ts-detail-movement-list">
          <div v-for="m in movimientos" :key="m.id" class="ts-detail-movement-item"><span class="ts-movement-type" :class="m.tipo === 'Entrada' ? 'is-entry' : 'is-exit'">{{ m.tipo === 'Entrada' ? '+' : '−' }}</span><div><strong>{{ m.concepto }}</strong><small>{{ fecha(m.fecha_movimiento) }}</small></div><b>{{ moneda(m.monto) }}</b><button v-if="m.tipo === 'Entrada'" class="ts-receipt-link no-print" type="button" @click="abrirReciboMovimiento(m)">Recibo</button></div>
        </div>
        <div v-else class="ts-empty-detail-state"><strong>Sin movimientos vinculados</strong><p>Los ingresos y gastos de esta orden aparecerán aquí.</p></div>
      </article>
    </section>

    <section v-else class="ts-signature-detail-layout">
      <article class="ts-detail-card">
        <div class="ts-detail-card-heading"><div><span class="ts-detail-label">Aceptación del cliente</span><h2>Firma digital</h2><p>Registra la entrega, autorización o conformidad del cliente.</p></div></div>
        <div style="background:#f8fafc;border:1px solid #dfe5ee;border-radius:9px;padding:12px;font-size:13px;line-height:1.5;color:#344054;margin-bottom:12px">
          <strong>Condiciones del servicio</strong>
          <ol style="margin:8px 0 0;padding-left:18px">
            <li>La garantía no cubre golpes, humedad, mal uso ni manipulación por terceros.</li>
            <li>La garantía comienza a contar desde que se notifica al cliente que el equipo está listo, no desde el ingreso.</li>
            <li>Equipos no recogidos después de {{ diasGraciaAlmacenamiento }} días de esa notificación generan una cuota de almacenamiento de {{ moneda(Number(negocio?.cuota_almacenamiento_dia || 0)) }} por día.</li>
            <li>La entrega del equipo requiere que el saldo esté completamente liquidado.</li>
          </ol>
        </div>
        <label class="ts-signature-name"><span>Nombre de quien firma</span><input v-model="nombreFirmante" placeholder="Nombre completo"></label>
        <canvas ref="canvasFirma" class="ts-signature-canvas" @mousedown="iniciarFirma" @mousemove="dibujarFirma" @mouseup="terminarFirma" @mouseleave="terminarFirma" @touchstart="iniciarFirma" @touchmove="dibujarFirma" @touchend="terminarFirma"></canvas>
        <label class="ts-toggle-row" style="display:flex;align-items:center;gap:8px;margin-top:10px">
          <input v-model="aceptaCondiciones" type="checkbox">
          <span>El cliente leyó y acepta las condiciones anteriores.</span>
        </label>
        <div class="ts-signature-actions"><button class="ts-action-secondary" type="button" @click="limpiarFirma">Limpiar</button><button class="ts-action-primary" type="button" :disabled="!aceptaCondiciones" @click="guardarFirma">Guardar firma</button></div>
      </article>
      <article class="ts-detail-card">
        <div class="ts-detail-card-heading"><div><span class="ts-detail-label">Historial</span><h2>Firmas guardadas</h2></div></div>
        <div v-if="firmas.length" class="ts-saved-signatures"><figure v-for="firma in firmas" :key="firma.id"><img :src="firma.firma_base64" alt="Firma guardada"><figcaption><strong>{{ firma.nombre_firmante }}</strong><small>{{ fecha(firma.fecha_firma) }}</small></figcaption></figure></div>
        <div v-else class="ts-empty-detail-state"><strong>Sin firmas registradas</strong><p>La primera firma guardada aparecerá aquí.</p></div>
      </article>
    </section>

    <footer class="ts-detail-conditions">La garantía no cubre golpes, humedad, mal uso, manipulación por terceros o fallas ajenas al trabajo realizado.</footer>
  </div>

  <div v-else class="ts-detail-loading"><span></span><p>Cargando orden...</p></div>
  <TicketPreviewModal :ticket="ticketActual" @close="ticketActual = null" />
</template>

<style scoped>
.ts-receipt-link{border:1px solid #bfdbfe;background:#eff6ff;color:#175cff;border-radius:9px;padding:7px 10px;font-weight:800;font-size:.75rem;cursor:pointer}

/* Acciones principales del detalle de orden */
.ts-order-detail-actions{
  display:flex;
  align-items:center;
  justify-content:flex-end;
  gap:10px;
  flex-wrap:wrap;
}
.ts-order-detail-actions > *{
  min-height:42px;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  white-space:nowrap;
  text-decoration:none;
}
.ts-edit-order-action{
  gap:8px;
  min-width:142px;
  box-shadow:0 8px 20px rgba(37,99,235,.18);
}
.ts-action-icon{
  font-size:1rem;
  line-height:1;
}

@media(max-width:900px){
  .ts-order-detail-actions{
    width:100%;
    display:grid;
    grid-template-columns:repeat(2,minmax(0,1fr));
  }
  .ts-order-detail-actions > *{width:100%;box-sizing:border-box}
  .ts-edit-order-action{grid-column:1/-1}
}

@media(max-width:600px){
  .ts-order-detail-actions{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
  .ts-edit-order-action{grid-column:1/-1}
  .ts-whatsapp-button{grid-column:auto}
  .ts-order-detail-actions > :last-child{grid-column:1/-1}
  .ts-detail-movement-item{display:grid!important;grid-template-columns:auto minmax(0,1fr)!important;gap:8px 10px!important}
  .ts-detail-movement-item>b,.ts-receipt-link{grid-column:2!important;justify-self:start}
}

@media(max-width:420px){
  .ts-order-detail-actions{grid-template-columns:1fr}
  .ts-order-detail-actions > *,
  .ts-edit-order-action,
  .ts-order-detail-actions > :last-child{grid-column:1}
}
</style>
