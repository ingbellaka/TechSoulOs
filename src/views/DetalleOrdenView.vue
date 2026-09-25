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
const firmaGarantiaRemota = ref(null)
const errorImagenFirma = ref(false)

function normalizarFirmaDataUrl(valor) {
  if (!valor) return ''
  let firma = String(valor).trim()

  // Corrige valores que pudieron llegar con comillas o espacios/saltos de línea.
  if ((firma.startsWith('"') && firma.endsWith('"')) || (firma.startsWith("'") && firma.endsWith("'"))) {
    firma = firma.slice(1, -1)
  }
  firma = firma.replace(/\r|\n/g, '').replace(/\s+/g, '')

  // La firma pública se guarda como PNG base64.
  if (firma.startsWith('data:image/')) return firma
  if (/^[A-Za-z0-9+/=]+$/.test(firma)) return `data:image/png;base64,${firma}`
  return firma
}

const firmaGarantiaSrc = computed(() =>
  normalizarFirmaDataUrl(firmaGarantiaRemota.value?.firma_data_url)
)

function onErrorFirmaGarantia() {
  errorImagenFirma.value = true
}

function onLoadFirmaGarantia() {
  errorImagenFirma.value = false
}
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

  const [{ data: fotos }, { data: checks }, { data: garantias }, { data: movs }, { data: dataFirmas }, firmaRemotaResult, historialResult, { data: dataNegocio }] = await Promise.all([
    supabase.from('evidencias').select('*').eq('orden_id', id).order('id', { ascending: false }),
    supabase.from('checklist_orden').select('*').eq('orden_id', id).order('id'),
    supabase.from('garantias').select('*').eq('orden_id', id).order('id', { ascending: false }),
    supabase.from('movimientos_caja').select('*').eq('referencia_tipo', 'orden').eq('referencia_id', id).order('id', { ascending: false }),
    supabase.from('firmas_orden').select('*').eq('orden_id', id).order('id', { ascending: false }),
    supabase.from('garantia_firmas_remotas').select('*').eq('orden_id', id).eq('acepto_condiciones', true).not('firmado_en', 'is', null).not('firma_data_url', 'is', null).order('firmado_en', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('orden_historial').select('*').eq('orden_id', id).order('created_at', { ascending: false }),
    supabase.from('configuracion_negocio').select('*').order('id').limit(1).single()
  ])

  evidencias.value = fotos || []
  checklist.value = checks || []
  garantia.value = (garantias || [])[0] || null
  movimientos.value = movs || []
  firmas.value = dataFirmas || []
  firmaGarantiaRemota.value = firmaRemotaResult.data || null
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


function valorPrimero(...valores) {
  return valores.find((v) => v !== undefined && v !== null && String(v).trim() !== '') || ''
}

function estadoChecklistPdf(item) {
  const estado = normalizarEstado(item?.estado)
  if (estado === 'bien') return { icono: '✓', texto: 'Correcto', clase: 'ok' }
  if (estado === 'falla') return { icono: '!', texto: item?.estado || 'Con falla', clase: 'bad' }
  if (estado === 'no-aplica') return { icono: '–', texto: 'No aplica', clase: 'na' }
  return { icono: '•', texto: item?.estado || 'Pendiente', clase: 'pending' }
}

function checklistPdfHtml() {
  if (!checklist.value.length) return '<div class="empty-box">Sin checklist registrado.</div>'
  const mitad = Math.ceil(checklist.value.length / 2)
  const columnas = [checklist.value.slice(0, mitad), checklist.value.slice(mitad)]

  return `<div class="check-columns">${columnas.map((columna) => `
    <table class="compact-table check-table">
      <thead><tr><th>Función</th><th>Estado</th></tr></thead>
      <tbody>${columna.map((item) => {
        const estado = estadoChecklistPdf(item)
        return `<tr>
          <td>${escaparHtml(item.item || 'Prueba')}</td>
          <td><span class="check-state ${estado.clase}"><i>${estado.icono}</i>${escaparHtml(estado.texto)}</span>${item.notas ? `<small>${escaparHtml(item.notas)}</small>` : ''}</td>
        </tr>`
      }).join('')}</tbody>
    </table>`).join('')}</div>`
}

function clasificarEvidenciasPdf() {
  const grupos = {
    recepcion: [],
    proceso: [],
    final: [],
    otras: []
  }

  for (const foto of evidencias.value) {
    const texto = `${foto.tipo || ''} ${foto.descripcion || ''}`.toLowerCase()
    if (['recepcion', 'recepción', 'ingreso', 'antes'].some((k) => texto.includes(k))) grupos.recepcion.push(foto)
    else if (['proceso', 'reparacion', 'reparación', 'diagnostico', 'diagnóstico', 'desarm'].some((k) => texto.includes(k))) grupos.proceso.push(foto)
    else if (['entrega', 'final', 'resultado', 'despues', 'después', 'salida'].some((k) => texto.includes(k))) grupos.final.push(foto)
    else grupos.otras.push(foto)
  }

  // Si las evidencias antiguas no tienen categoría, las distribuimos visualmente sin modificar la BD.
  if (!grupos.recepcion.length && grupos.otras.length) grupos.recepcion.push(...grupos.otras.splice(0, Math.min(3, grupos.otras.length)))
  if (!grupos.proceso.length && grupos.otras.length > 3) grupos.proceso.push(...grupos.otras.splice(0, Math.min(3, grupos.otras.length)))
  if (!grupos.final.length && grupos.otras.length) grupos.final.push(...grupos.otras.splice(-Math.min(3, grupos.otras.length)))

  return grupos
}

function evidenciaGrupoHtml(titulo, fotos, numeroRef) {
  if (!fotos.length) return ''
  return `
    <section class="evidence-group">
      <div class="evidence-band">${escaparHtml(titulo)}</div>
      <div class="photo-grid">
        ${fotos.slice(0, 9).map((foto) => `
          <figure>
            <img src="${escaparHtml(foto.url_imagen || '')}" alt="${escaparHtml(foto.descripcion || foto.tipo || 'Evidencia')}">
            <figcaption>${numeroRef.valor++}. ${escaparHtml(foto.descripcion || foto.tipo || 'Evidencia')}</figcaption>
          </figure>`).join('')}
      </div>
    </section>`
}

function fechaCortaPdf(valor) {
  if (!valor) return 'No registrada'
  return new Date(valor).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
}

function generarPdfOrden() {
  if (!orden.value) return

  const o = orden.value
  const cliente = o.clientes || {}
  const equipo = o.equipos || {}
  const firma = firmaGarantiaRemota.value || firmas.value[0] || null
  const grupos = clasificarEvidenciasPdf()
  const fotoEquipo = grupos.recepcion[0]?.url_imagen || evidencias.value[0]?.url_imagen || ''
  const pagado = Number(o.anticipo || 0)
  const total = Number(o.costo_total || 0)
  const saldo = Math.max(0, total - pagado)
  const servicio = valorPrimero(o.servicio, o.tipo_servicio, garantia.value?.tipo_servicio, o.falla_reportada, 'Servicio técnico')
  const descripcionServicio = valorPrimero(o.trabajo_realizado, o.diagnostico, o.falla_reportada, 'Pendiente de descripción')
  const garantiaDias = Number(garantia.value?.dias_garantia || 0)
  const folioGarantia = valorPrimero(firmaGarantiaRemota.value?.folio_garantia, garantia.value?.folio, garantia.value?.id ? `GAR-${String(garantia.value.id).padStart(4, '0')}` : '')
  const fechaEntrega = valorPrimero(o.fecha_entrega, o.entregado_en, o.fecha_listo)
  const responsable = valorPrimero(negocio.value?.responsable_nombre, o.tecnico, 'TechSoul')
  const firmaResponsable = valorPrimero(negocio.value?.firma_url)
  const tokenSeguimiento = valorPrimero(o.token_publico, o.token_seguimiento, o.public_token)
  const seguimientoUrl = tokenSeguimiento ? `${window.location.origin}/seguimiento/${encodeURIComponent(tokenSeguimiento)}` : ''
  const qrUrl = seguimientoUrl ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=0&data=${encodeURIComponent(seguimientoUrl)}` : ''
  const numeroRef = { valor: 1 }

  const popup = window.open('', '_blank')
  if (!popup) {
    alert('El navegador bloqueó la ventana del PDF. Permite ventanas emergentes para TechSoul e inténtalo otra vez.')
    return
  }

  const header = (pagina) => `
    <header class="pdf-header">
      <div class="brand-lockup">
        <div class="brand-name">TechSoul</div>
        <div class="brand-sub">Servicio Técnico Especializado</div>
      </div>
      <div class="order-lockup">
        <b>ORDEN DE SERVICIO</b>
        <strong>${escaparHtml(o.folio || o.id)}</strong>
      </div>
    </header>`

  const footer = (pagina) => `
    <footer class="pdf-footer">
      <div class="trust"><span>◉ Local establecido</span><span>◷ ${garantiaDias || 3} ${garantiaDias === 1 ? 'día' : garantiaDias ? 'días de garantía' : 'meses de garantía'}</span><span>◉ Atención rápida</span><span>◈ Calidad premium</span></div>
      <div class="footer-bottom"><span>⌖ TechSoul &nbsp; | &nbsp; ${escaparHtml(negocio.value?.direccion || 'Blvd. Jardín de las Orquídeas 2584-B, Santa Fe, Culiacán')}</span><b>Pág. ${pagina} de 4</b></div>
    </footer>`

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Orden-${escaparHtml(o.folio || o.id)}</title>
<style>
@page{size:A4;margin:0}
*{box-sizing:border-box}
:root{--blue:#0B43FF;--navy:#09275f;--ink:#13233f;--muted:#60708b;--line:#cfdced;--soft:#eef5ff;--green:#19a866;--red:#d92d20}
html,body{margin:0;padding:0;background:#d9dde4;font-family:Arial,Helvetica,sans-serif;color:var(--ink);font-size:10.2px;line-height:1.32}
.page{width:210mm;height:297mm;margin:0 auto 7mm;background:white;padding:9mm 10mm 8mm;position:relative;overflow:hidden;page-break-after:always}
.page:last-of-type{page-break-after:auto}
.pdf-header{height:25mm;display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid #dbe5f2;padding-bottom:3mm;margin-bottom:3mm}
.brand-name{font-size:31px;line-height:.95;font-weight:950;letter-spacing:-1.8px;color:#0b2b66}.brand-sub{font-size:9px;margin-top:3px;color:#243b63}
.order-lockup{text-align:right}.order-lockup>b{display:block;color:#0b2b66;font-size:9px}.order-lockup>strong{display:inline-block;margin-top:4px;background:var(--blue);color:white;border-radius:6px;padding:5px 10px;font-size:11px;box-shadow:0 3px 7px rgba(11,67,255,.18)}
.intro-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:3mm}.meta-box{display:flex;gap:7px;align-items:center;border:1px solid var(--line);border-radius:7px;padding:7px 9px}.meta-box i{font-style:normal;color:#0b2b66;font-size:15px}.meta-box small{display:block;color:var(--muted);font-size:7.5px}.meta-box b{font-size:9px}
.section{margin:0 0 3.2mm}.section-title{height:8mm;display:flex;align-items:center;background:linear-gradient(90deg,var(--blue) 0 39%,#edf4fc 39%);border-radius:4px;color:white;font-size:9px;font-weight:900;letter-spacing:.025em;padding:0 7px;text-transform:uppercase}.section-title.short{background:linear-gradient(90deg,var(--blue) 0 28%,#edf4fc 28%)}.section-title.tiny{background:linear-gradient(90deg,var(--blue) 0 23%,#edf4fc 23%)}
.info-card{border:1px solid var(--line);border-radius:7px;overflow:hidden}.client-grid{display:grid;grid-template-columns:1fr 1fr 1.35fr}.client-cell{padding:7px 10px;border-right:1px solid var(--line)}.client-cell:last-child{border-right:0}.client-cell small{display:block;color:var(--muted);font-size:7.5px}.client-cell b{display:block;margin-top:1px;font-size:9px;overflow-wrap:anywhere}
.device-grid{display:grid;grid-template-columns:31% 69%;min-height:44mm}.device-photo{display:flex;align-items:center;justify-content:center;border-right:1px solid var(--line);background:#fbfdff}.device-photo img{width:88%;height:39mm;object-fit:contain}.device-placeholder{font-size:9px;color:#98a2b3;text-align:center}.data-table,.compact-table{width:100%;border-collapse:collapse}.data-table th,.data-table td,.compact-table th,.compact-table td{border-bottom:1px solid var(--line);padding:5px 8px;text-align:left}.data-table tr:last-child th,.data-table tr:last-child td,.compact-table tr:last-child td{border-bottom:0}.data-table th{width:35%;font-weight:500;color:#344765}.data-table td{font-weight:750}.service-table th,.service-table td{padding:6px 8px;border-right:1px solid var(--line)}.service-table th:last-child,.service-table td:last-child{border-right:0}.service-table thead{background:#edf4fc}.service-table th{font-size:8px}.service-table td:last-child,.service-table th:last-child{text-align:right;width:21%;font-weight:800}
.status-grid{display:grid;grid-template-columns:1fr 1fr;border:1px solid var(--line);border-radius:7px;padding:6px 9px;gap:0 16px}.status-item{display:grid;grid-template-columns:1fr auto;gap:5px;padding:4px 0;border-bottom:1px solid #edf1f6}.status-item:nth-last-child(-n+2){border-bottom:0}.status-item span{font-weight:650}.status-item b{font-size:8px}.status-item .ok{color:var(--green)}.status-item .bad{color:var(--red)}
.text-box{border:1px solid var(--line);border-radius:7px;padding:8px 10px;min-height:13mm;white-space:pre-wrap}
.pdf-footer{position:absolute;left:10mm;right:10mm;bottom:6mm;border-top:1px solid #dbe5f2;padding-top:3px;color:#173763}.trust{display:flex;justify-content:space-between;gap:6px;font-size:7px}.footer-bottom{display:flex;justify-content:space-between;margin-top:4px;font-size:7px}.footer-bottom b{color:#344765}
.check-columns{display:grid;grid-template-columns:1fr 1fr;gap:8px}.compact-table{border:1px solid var(--line);border-radius:6px;overflow:hidden}.compact-table thead{background:#eaf2fb}.compact-table th{font-size:8px;text-align:center}.check-table td:first-child{width:58%}.check-state{display:flex;align-items:center;justify-content:center;gap:5px;font-size:8px}.check-state i{display:inline-grid;place-items:center;width:12px;height:12px;border-radius:50%;font-style:normal;font-size:8px;color:white}.check-state.ok i{background:var(--green)}.check-state.bad i{background:var(--red)}.check-state.na i,.check-state.pending i{background:#98a2b3}.check-state.bad{color:var(--red)}.check-table small{display:block;color:#667085;font-size:6.5px;text-align:center;margin-top:2px}
.finance-table td:first-child{font-weight:650}.finance-table td:last-child{text-align:right;font-weight:800}.finance-table tr.total-row{background:#edf4fc;color:#0b2b66;font-size:10px}.finance-table tr.total-row td{font-weight:900}
.warranty-table th{width:31%;font-weight:750}.warranty-table td{font-weight:500}
.signature-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.signature-card{height:50mm;border:1px solid var(--line);border-radius:7px;padding:8px 10px;display:flex;flex-direction:column}.signature-card h3{margin:0;font-size:8px;color:#344765;text-transform:uppercase}.signature-area{flex:1;display:flex;align-items:flex-end;justify-content:center;padding:5px}.signature-area img{max-width:85%;max-height:26mm;object-fit:contain}.signature-line{border-top:1px solid #536781;text-align:center;padding-top:4px;font-size:7.5px}.signature-pending{color:#98a2b3;font-size:8px;align-self:center;margin:auto}
.evidence-band{height:7mm;background:linear-gradient(90deg,#eaf2fb 0 100%);border-left:5px solid var(--blue);border-radius:4px;padding:5px 7px;color:#0b2b66;font-weight:900;font-size:9px;margin-bottom:3mm}.evidence-group{margin-bottom:4mm}.photo-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.photo-grid figure{margin:0}.photo-grid img{width:100%;height:46mm;object-fit:cover;border-radius:5px;border:1px solid #cdd8e6;background:#f5f7fa}.photo-grid figcaption{font-size:7.5px;margin-top:3px;color:#263c5e}.empty-evidence{height:165mm;border:1px dashed #cbd5e1;border-radius:8px;display:grid;place-items:center;color:#94a3b8}
.conditions-box{border:1px solid var(--line);border-radius:8px;padding:10px 12px}.conditions-box ol{margin:0;padding-left:18px}.conditions-box li{margin:0 0 7px}.qr-panel{width:145mm;margin:12mm auto 0;background:linear-gradient(135deg,#f1f7ff,#e4f0ff);border-radius:12px;min-height:62mm;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:8mm}.qr-panel img{width:32mm;height:32mm;background:white;padding:3px}.qr-panel h3{font-size:13px;color:#0b2b66;margin:5px 0 2px}.qr-panel p{font-size:8px;color:#445b7a;margin:0;max-width:85mm}.folio-qr-fallback{width:32mm;height:32mm;background:white;border:2px solid #0b2b66;display:grid;place-items:center;padding:4px;font-weight:900;color:#0b2b66;text-align:center}.closing-brand{text-align:center;margin-top:13mm}.closing-brand .brand-name{font-size:34px}.closing-brand .brand-sub{font-size:10px}
.page1 .section{margin-bottom:2.6mm}.page1 .pdf-header{margin-bottom:2.4mm}.page1 .section-title{height:7mm}.page1 .device-grid{min-height:39mm}.page1 .device-photo img{height:34mm}.page1 .text-box{min-height:11mm}
.no-print-toolbar{position:fixed;left:14px;right:14px;bottom:14px;display:flex;gap:8px;z-index:9999}.no-print-toolbar button{border-radius:10px;padding:12px 14px;font-weight:800;cursor:pointer}.back-btn{flex:1;border:1px solid #d0d5dd;background:white;color:#344054}.print-btn{flex:2;border:0;background:var(--blue);color:white}
@media print{html,body{background:white}.page{margin:0;box-shadow:none}.no-print-toolbar{display:none!important}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}}
@media screen and (max-width:760px){body{background:white}.page{width:210mm;transform-origin:top left;margin:0 0 10px}.no-print-toolbar{left:8px;right:8px;bottom:8px}}
</style>
</head>
<body>

<section class="page page1">
${header(1)}
<div class="intro-grid">
  <div><b>Fecha de ingreso:</b> ${escaparHtml(fechaCortaPdf(o.fecha_ingreso))}</div>
  <div><b>Fecha de entrega:</b> ${escaparHtml(fechaCortaPdf(fechaEntrega))}</div>
</div>

<div class="section">
  <div class="section-title short">1. DATOS DEL CLIENTE</div>
  <div class="info-card client-grid">
    <div class="client-cell"><small>Nombre</small><b>${escaparHtml(cliente.nombre || 'No registrado')}</b></div>
    <div class="client-cell"><small>Teléfono</small><b>${escaparHtml(cliente.telefono || cliente.whatsapp || 'No registrado')}</b></div>
    <div class="client-cell"><small>Correo</small><b>${escaparHtml(cliente.correo || cliente.email || 'No registrado')}</b></div>
  </div>
</div>

<div class="section">
  <div class="section-title short">2. DATOS DEL EQUIPO</div>
  <div class="info-card device-grid">
    <div class="device-photo">${fotoEquipo ? `<img src="${escaparHtml(fotoEquipo)}" alt="Equipo">` : '<div class="device-placeholder">Sin fotografía<br>del equipo</div>'}</div>
    <table class="data-table"><tbody>
      <tr><th>Modelo</th><td>${escaparHtml([equipo.marca, equipo.modelo].filter(Boolean).join(' ') || 'No registrado')}</td></tr>
      <tr><th>Color</th><td>${escaparHtml(equipo.color || 'No registrado')}</td></tr>
      <tr><th>Capacidad</th><td>${escaparHtml(valorPrimero(equipo.capacidad, equipo.almacenamiento, 'No registrado'))}</td></tr>
      <tr><th>IMEI / Serie</th><td>${escaparHtml(valorPrimero(equipo.imei_serie, equipo.imei, equipo.numero_serie, 'No registrado'))}</td></tr>
      <tr><th>Accesorios</th><td>${escaparHtml(valorPrimero(o.accesorios, equipo.accesorios, 'Sin accesorios registrados'))}</td></tr>
    </tbody></table>
  </div>
</div>

<div class="section">
  <div class="section-title short">3. SERVICIO(S) REALIZADO(S)</div>
  <div class="info-card"><table class="data-table service-table"><thead><tr><th>Servicio</th><th>Descripción</th><th>Precio</th></tr></thead><tbody>
    <tr><td>${escaparHtml(servicio)}</td><td>${escaparHtml(descripcionServicio)}</td><td>${escaparHtml(moneda(total))}</td></tr>
  </tbody></table></div>
</div>

<div class="section">
  <div class="section-title">4. ESTADO GENERAL DEL EQUIPO AL INGRESO</div>
  ${checklist.value.length ? `<div class="status-grid">${checklist.value.slice(0, 10).map((item) => {
    const e = estadoChecklistPdf(item)
    return `<div class="status-item"><span>${escaparHtml(item.item || 'Prueba')}</span><b class="${e.clase}">${escaparHtml(e.texto)}</b></div>`
  }).join('')}</div>` : '<div class="text-box">Sin checklist de recepción registrado.</div>'}
</div>

<div class="section">
  <div class="section-title tiny">5. DIAGNÓSTICO</div>
  <div class="text-box">${escaparHtml(o.diagnostico || o.falla_reportada || 'Pendiente')}</div>
</div>

<div class="section">
  <div class="section-title tiny">6. OBSERVACIONES</div>
  <div class="text-box">${escaparHtml(valorPrimero(o.observaciones, o.notas, o.accesorios ? `Accesorios recibidos: ${o.accesorios}` : '', 'Sin observaciones adicionales'))}</div>
</div>
${footer(1)}
</section>

<section class="page">
${header(2)}
<div class="section">
  <div class="section-title">7. CHECKLIST DE FUNCIONAMIENTO (ENTREGA)</div>
  ${checklistPdfHtml()}
</div>

<div class="section">
  <div class="section-title tiny">8. FINANZAS</div>
  <div class="info-card"><table class="data-table finance-table"><tbody>
    <tr><td>Concepto</td><td>Monto</td></tr>
    <tr><td>${escaparHtml(servicio)}</td><td>${escaparHtml(moneda(total))}</td></tr>
    <tr><td>Pagado / anticipo</td><td>${escaparHtml(moneda(pagado))}</td></tr>
    <tr><td>Saldo pendiente</td><td>${escaparHtml(moneda(saldo))}</td></tr>
    ${cargoAlmacenamiento.value > 0 ? `<tr><td>Almacenamiento</td><td>${escaparHtml(moneda(cargoAlmacenamiento.value))}</td></tr>` : ''}
    <tr class="total-row"><td>Total</td><td>${escaparHtml(moneda(total + cargoAlmacenamiento.value))}</td></tr>
  </tbody></table></div>
</div>

<div class="section">
  <div class="section-title tiny">9. GARANTÍA</div>
  <div class="info-card"><table class="data-table warranty-table"><tbody>
    <tr><th>Folio de garantía</th><td>${escaparHtml(folioGarantia || 'Pendiente')}</td></tr>
    <tr><th>Duración</th><td>${garantiaDias ? `${garantiaDias} días` : 'No especificada'}</td></tr>
    <tr><th>Cobertura</th><td>${escaparHtml(valorPrimero(garantia.value?.condiciones, 'Trabajo o pieza indicada en esta orden'))}</td></tr>
    <tr><th>No cubre</th><td>Golpes, humedad, mal uso, manipulación por terceros o fallas ajenas al trabajo realizado.</td></tr>
  </tbody></table></div>
</div>

<div class="section">
  <div class="section-title tiny">10. FIRMAS</div>
  <div class="signature-grid">
    <div class="signature-card">
      <h3>Firma digital de garantía</h3>
      <div class="signature-area">${firma && (firma.firma_data_url || firma.firma_base64) ? `<img src="${firma.firma_data_url || firma.firma_base64}" alt="Firma digital">` : '<span class="signature-pending">Firma digital pendiente</span>'}</div>
      <div class="signature-line">${escaparHtml(valorPrimero(firma?.firmante_nombre, firma?.nombre_firmante, cliente.nombre, 'Cliente'))}</div>
    </div>
    <div class="signature-card">
      <h3>Responsable / recibió el equipo</h3>
      <div class="signature-area">${firmaResponsable ? `<img src="${escaparHtml(firmaResponsable)}" alt="Firma responsable">` : '<span class="signature-pending">Registro TechSoul</span>'}</div>
      <div class="signature-line">${escaparHtml(responsable)}</div>
    </div>
  </div>
</div>
${footer(2)}
</section>

<section class="page">
${header(3)}
<div class="section">
  <div class="section-title short">11. EVIDENCIAS DEL EQUIPO</div>
</div>
${evidencias.value.length ? `
  ${evidenciaGrupoHtml('RECEPCIÓN', grupos.recepcion, numeroRef)}
  ${evidenciaGrupoHtml('PROCESO', grupos.proceso, numeroRef)}
  ${evidenciaGrupoHtml('RESULTADO FINAL', grupos.final, numeroRef)}
  ${evidenciaGrupoHtml('OTRAS EVIDENCIAS', grupos.otras, numeroRef)}
` : '<div class="empty-evidence">Esta orden todavía no tiene evidencias fotográficas.</div>'}
${footer(3)}
</section>

<section class="page">
${header(4)}
<div class="section">
  <div class="section-title short">12. CONDICIONES DEL SERVICIO</div>
  <div class="conditions-box">
    <ol>
      <li>La garantía cubre exclusivamente el trabajo o la pieza indicada en esta orden durante la vigencia registrada.</li>
      <li>No cubre golpes, humedad, mal uso, manipulación por terceros ni fallas ajenas al trabajo realizado.</li>
      <li>En caso de modificación o intervención por terceros, la garantía puede perder validez.</li>
      <li>La vigencia de la garantía comienza a partir de la fecha en que se notifica al cliente que el equipo está listo para recoger.</li>
      <li>Equipos no recogidos después de ${escaparHtml(diasGraciaAlmacenamiento.value)} días de esa notificación generarán una cuota de almacenamiento de ${escaparHtml(moneda(Number(negocio.value?.cuota_almacenamiento_dia || 0)))} por día adicional.</li>
      <li>La entrega del equipo está sujeta a que el saldo se encuentre completamente liquidado.</li>
      <li>La firma digital registrada en TechSoul OS representa la aceptación de las condiciones de servicio y garantía asociadas a esta orden.</li>
    </ol>
  </div>
</div>

<div class="qr-panel">
  ${qrUrl ? `<img src="${qrUrl}" alt="QR de seguimiento">` : `<div class="folio-qr-fallback">${escaparHtml(o.folio || o.id)}</div>`}
  <h3>${qrUrl ? 'Consulta el estatus de tu orden' : 'Referencia de tu orden'}</h3>
  <p>${qrUrl ? 'Escanea este código para consultar la información pública disponible de tu equipo.' : 'El seguimiento público aparecerá aquí cuando la orden tenga un token público configurado.'}</p>
</div>

<div class="closing-brand">
  <div class="brand-name">TechSoul</div>
  <div class="brand-sub">Servicio Técnico Especializado</div>
</div>
${footer(4)}
</section>

<div class="no-print-toolbar">
  <button class="back-btn" onclick="if(window.opener){window.close()}else{history.back()}">← Regresar</button>
  <button class="print-btn" onclick="window.print()">Guardar como PDF / Imprimir</button>
</div>
</body></html>`

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
            <div><dt>Firma digital</dt><dd>{{ firmaGarantiaRemota?.firmado_en ? 'Firmada' : 'Pendiente' }}</dd></div>
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
        <div class="ts-detail-card-heading"><div><span class="ts-detail-label">Garantía digital</span><h2>Firma del cliente</h2><p>La firma realizada desde el enlace público de garantía aparece aquí automáticamente.</p></div></div>
        <div v-if="firmaGarantiaRemota?.firmado_en" class="ts-remote-signature-card">
          <div class="ts-remote-signature-status">✓ Garantía firmada</div>
          <img v-if="firmaGarantiaRemota.firma_data_url" :src="firmaGarantiaSrc"
                    @load="onLoadFirmaGarantia"
                    @error="onErrorFirmaGarantia" alt="Firma digital del cliente">
          <dl>
            <div><dt>Firmó</dt><dd>{{ firmaGarantiaRemota.firmante_nombre || orden.clientes?.nombre }}</dd></div>
            <div><dt>Fecha y hora</dt><dd>{{ fecha(firmaGarantiaRemota.firmado_en) }}</dd></div>
            <div><dt>Folio de garantía</dt><dd>{{ firmaGarantiaRemota.folio_garantia }}</dd></div>
            <div><dt>Aceptó condiciones</dt><dd>{{ firmaGarantiaRemota.acepto_condiciones ? 'Sí' : 'No' }}</dd></div>
          </dl>
        </div>
        <div v-else class="ts-empty-detail-state"><strong>Firma digital pendiente</strong><p>Cuando el cliente firme desde el enlace de WhatsApp o el QR del ticket, la firma aparecerá en esta orden.</p></div>
      </article>
      <article v-if="firmas.length" class="ts-detail-card">
        <div class="ts-detail-card-heading"><div><span class="ts-detail-label">Historial anterior</span><h2>Firmas registradas manualmente</h2></div></div>
        <div class="ts-saved-signatures"><figure v-for="firma in firmas" :key="firma.id"><img :src="firma.firma_base64" alt="Firma guardada"><figcaption><strong>{{ firma.nombre_firmante }}</strong><small>{{ fecha(firma.fecha_firma) }}</small></figcaption></figure></div>
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

.ts-remote-signature-card{border:1px solid #b7e4c7;background:#f6fff8;border-radius:14px;padding:16px}
.ts-remote-signature-status{display:inline-flex;align-items:center;border-radius:999px;background:#dcfce7;color:#166534;padding:6px 10px;font-weight:800;margin-bottom:14px}
.ts-remote-signature-card>img{display:block;max-width:320px;width:100%;max-height:180px;object-fit:contain;background:white;border:1px solid #e5e7eb;border-radius:10px;margin:0 auto 14px}
.ts-remote-signature-card dl{margin:0;display:grid;gap:8px}
.ts-remote-signature-card dl>div{display:grid;grid-template-columns:150px 1fr;gap:10px;border-top:1px solid #dbeafe;padding-top:8px}
.ts-remote-signature-card dt{color:#667085}.ts-remote-signature-card dd{margin:0;font-weight:700;color:#172033}
@media(max-width:600px){.ts-remote-signature-card dl>div{grid-template-columns:1fr;gap:2px}}

</style>
