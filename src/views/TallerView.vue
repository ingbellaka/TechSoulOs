<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { supabase } from '../lib/supabase'
import { destinoRespuestaCliente, pruebasAprobadas } from '../utils/flujo-taller'
import { MOTIVOS_NO_REPARACION, ESTADOS_DEVOLUCION, validarNoReparacion, mensajeNoReparacion } from '../utils/no-reparacion'
import { subirEvidencia } from '../lib/storage'
import { asegurarFirmaGarantiaPorOrden, abrirWhatsAppFirma } from '../services/garantia-firma.service'

const cargando = ref(true)
const guardando = ref(null)
const ordenes = ref([])
const citas = ref([])
const filtroEstado = ref('activas')
const filtroTexto = ref('')
const filtroFecha = ref('todas')
const filtroPrioridad = ref('todas')
const fechaPanel = ref(hoyLocal())
const editandoFechaId = ref(null)
const fechaTemporalDia = ref('')
const fechaTemporalHora = ref('10:00')
const ahora = ref(Date.now())
const modalEvidencia = ref(null)
const fotoInterna = ref(null)
const previewInterna = ref('')
const guardandoEvidencia = ref(false)
const modalRespuestaCliente = ref(null)
const respuestaClienteForm = ref({ respuesta: 'autoriza', faltaRefaccion: false, nota: '' })
const guardandoRespuestaCliente = ref(false)
function abrirRespuestaCliente(orden) {
  if (!orden.diagnostico?.trim()) return abrirDiagnostico(orden)
  modalRespuestaCliente.value = orden
  respuestaClienteForm.value = { respuesta: 'autoriza', faltaRefaccion: false, nota: '' }
}
function cerrarRespuestaCliente() {
  if (!guardandoRespuestaCliente.value) modalRespuestaCliente.value = null
}
async function guardarRespuestaCliente() {
  const orden = modalRespuestaCliente.value
  if (!orden || guardandoRespuestaCliente.value) return
  const form = respuestaClienteForm.value
  const destino = destinoRespuestaCliente(form.respuesta, form.faltaRefaccion)
  if (!destino) return notificar('Selecciona la respuesta del cliente.', 'error')
  if (!form.nota.trim()) return notificar('Registra quién respondió y por qué medio confirmó su decisión.', 'error')
  if (form.respuesta === 'rechaza') {
    modalRespuestaCliente.value = null
    abrirNoReparacion(orden)
    noReparacionForm.value.motivo = 'Cliente no autorizó la cotización'
    noReparacionForm.value.explicacion = `El cliente no autorizó el trabajo propuesto. ${form.nota.trim()}`
    return
  }
  guardandoRespuestaCliente.value = true
  try {
    await cambiarEstado(orden, destino)
    if (orden.estado !== destino) return
    const historialGuardado = await registrarHistorial(orden, 'Autorización del cliente registrada', `${form.nota.trim()}\n${form.faltaRefaccion ? 'Se espera refacción.' : 'Se puede iniciar la reparación.'}`, { tipo: 'autorizacion' })
    modalRespuestaCliente.value = null
    if (!historialGuardado) return notificar('El estado cambió, pero no se pudo registrar la confirmación en el historial. Conserva el mensaje del cliente y revisa la orden.', 'error')
    notificar(form.faltaRefaccion ? 'Autorizado: esperando refacción.' : 'Autorizado: en reparación.')
  } catch (error) { notificar(error.message, 'error') }
  finally { guardandoRespuestaCliente.value = false }
}

const modalNoReparacion = ref(null)
const devolviendoEquipo = ref(false)
const guardandoNoReparacion = ref(false)
const noReparacionForm = ref({ motivo: '', diagnostico: '', explicacion: '', notas: '' })

function abrirNoReparacion(orden, devolver = false) {
  modalNoReparacion.value = orden
  devolviendoEquipo.value = devolver
  noReparacionForm.value = {
    motivo: orden.motivo_no_reparacion || '',
    diagnostico: modalDiagnostico.value?.id === orden.id ? diagnosticoForm.value.diagnostico : orden.diagnostico || '',
    explicacion: orden.explicacion_no_reparacion || '', notas: orden.notas_devolucion || ''
  }
}
function cerrarNoReparacion() {
  if (!guardandoNoReparacion.value) modalNoReparacion.value = null
}
async function guardarNoReparacion() {
  const orden = modalNoReparacion.value
  if (!orden || guardandoNoReparacion.value) return
  const errorFormulario = validarNoReparacion(noReparacionForm.value, devolviendoEquipo.value)
  if (errorFormulario) return notificar(errorFormulario, 'error')
  guardandoNoReparacion.value = true
  try {
    if (modalDiagnostico.value?.id === orden.id && !devolviendoEquipo.value) {
      for (const [indice, foto] of fotosDiagnostico.value.entries()) {
        if (!foto) continue
        const url = await subirEvidencia(foto, `orden-${orden.id}/diagnostico`)
        const descripcion = `Diagnóstico · Foto ${indice + 1} obligatoria`
        const { data: existentes, error: consultaError } = await supabase.from('evidencias').select('id').eq('orden_id', orden.id).eq('tipo', 'Diagnóstico').eq('descripcion', descripcion).limit(1)
        if (consultaError) throw consultaError
        const evidencia = { orden_id: orden.id, tipo: 'Diagnóstico', descripcion, url_imagen: url }
        const resultado = existentes?.length ? await supabase.from('evidencias').update(evidencia).eq('id', existentes[0].id) : await supabase.from('evidencias').insert(evidencia)
        if (resultado.error) throw resultado.error
      }
    }
    const anterior = orden.estado
    const estado = devolviendoEquipo.value ? 'Devuelto sin reparación' : 'Pendiente de devolución'
    const payload = {
      estado, diagnostico: noReparacionForm.value.diagnostico.trim(),
      motivo_no_reparacion: noReparacionForm.value.motivo,
      explicacion_no_reparacion: noReparacionForm.value.explicacion.trim(),
      ...(devolviendoEquipo.value ? { notas_devolucion: noReparacionForm.value.notas.trim(), fecha_devolucion: new Date().toISOString() } : {})
    }
    const { data, error } = await supabase.from('ordenes').update(payload).eq('id', orden.id).eq('estado', anterior).select('id').single()
    if (error || !data) throw error || new Error('La orden cambió en otro dispositivo. Recarga Taller antes de continuar.')
    Object.assign(orden, payload)
    if (orden.produccion?.corriendo) await pausarSilencioso(orden)
    await guardarProduccion(orden, { corriendo: false, etapa: 'listo', finalizado_en: new Date().toISOString() })
    await registrarHistorial(orden, estado, `${payload.motivo_no_reparacion}: ${payload.explicacion_no_reparacion}${payload.notas_devolucion ? '\nDevolución: ' + payload.notas_devolucion : ''}`, { tipo: 'estado', estado_anterior: anterior, estado_nuevo: estado })
    modalNoReparacion.value = null
    if (modalDiagnostico.value?.id === orden.id) cerrarDiagnostico()
    notificar(devolviendoEquipo.value ? 'Equipo devuelto sin reparación.' : 'Equipo pendiente de devolución. Puedes copiar el aviso para el cliente.')
  } catch (error) { notificar(error.message, 'error') }
  finally { guardandoNoReparacion.value = false }
}
async function copiarAvisoNoReparacion(orden) {
  try { await navigator.clipboard.writeText(mensajeNoReparacion(orden)); notificar('Mensaje copiado. Revísalo antes de enviarlo al cliente.') }
  catch { notificar('No se pudo copiar el mensaje. Abre la orden para consultar el motivo.', 'error') }
}

const modalDiagnostico = ref(null)
const diagnosticoForm = ref({ diagnostico: '', solucion: '', costo: '' })
const guardandoDiagnostico = ref(false)
const fotosDiagnostico = ref([null, null])
const previewsDiagnostico = ref(['', ''])
const camaraDestino = ref(null)
const videoCamara = ref(null)
const errorCamara = ref('')
const iniciandoCamara = ref(false)
let streamCamara = null
let solicitudCamara = 0

function limpiarFotosDiagnostico() {
  previewsDiagnostico.value.forEach(url => { if (url) URL.revokeObjectURL(url) })
  previewsDiagnostico.value = ['', '']
  fotosDiagnostico.value = [null, null]
}

function asignarFotoDiagnostico(file, indice) {
  if (!file) return
  if (!file.type.startsWith('image/')) return notificar('Selecciona una imagen.', 'error')
  if (previewsDiagnostico.value[indice]) URL.revokeObjectURL(previewsDiagnostico.value[indice])
  fotosDiagnostico.value[indice] = file
  previewsDiagnostico.value[indice] = URL.createObjectURL(file)
}

function seleccionarFotoDiagnostico(event, indice) {
  asignarFotoDiagnostico(event.target.files?.[0], indice)
  event.target.value = ''
}

function cerrarCamara() {
  solicitudCamara++
  streamCamara?.getTracks().forEach(track => track.stop())
  streamCamara = null
  if (videoCamara.value) videoCamara.value.srcObject = null
  camaraDestino.value = null
  iniciandoCamara.value = false
}

async function abrirCamara(destino) {
  cerrarCamara()
  camaraDestino.value = destino
  errorCamara.value = ''
  iniciandoCamara.value = true
  const solicitud = solicitudCamara
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('La cámara requiere HTTPS y un navegador compatible. Puedes usar la opción de cámara o galería del dispositivo.')
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
    if (solicitud !== solicitudCamara || !camaraDestino.value) { stream.getTracks().forEach(track => track.stop()); return }
    streamCamara = stream
    await nextTick()
    if (!videoCamara.value) throw new Error('No se pudo iniciar la vista previa.')
    videoCamara.value.srcObject = stream
    await videoCamara.value.play()
  } catch (error) {
    if (solicitud !== solicitudCamara) return
    streamCamara?.getTracks().forEach(track => track.stop())
    streamCamara = null
    errorCamara.value = error.name === 'NotAllowedError' ? 'Permite el acceso a la cámara para tomar la foto. También puedes usar cámara o galería del dispositivo.' : error.message
  } finally {
    if (solicitud === solicitudCamara) iniciandoCamara.value = false
  }
}

async function capturarFoto() {
  const video = videoCamara.value
  const destino = camaraDestino.value
  if (!video?.videoWidth || !destino) return
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth; canvas.height = video.videoHeight
  canvas.getContext('2d').drawImage(video, 0, 0)
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9))
  if (!blob || destino !== camaraDestino.value) return
  const file = new File([blob], `evidencia-${Date.now()}.jpg`, { type: 'image/jpeg' })
  if (destino.tipo === 'diagnostico') asignarFotoDiagnostico(file, destino.indice)
  else asignarFotoInterna(file)
  cerrarCamara()
}

// UI TechSoul
const toast = ref({ visible: false, mensaje: '', tipo: 'success' })
let toastTimer = null
const modalTrabajo = ref(null)
const trabajoTemporal = ref('')
const modalConfirmacion = ref(null)
let resolverConfirmacion = null

function notificar(mensaje, tipo = 'success') {
  if (toastTimer) window.clearTimeout(toastTimer)
  toast.value = { visible: true, mensaje: String(mensaje || ''), tipo }
  toastTimer = window.setTimeout(() => {
    toast.value.visible = false
  }, 2800)
}

function abrirModalTrabajo(orden) {
  trabajoTemporal.value = orden.trabajo_realizado || ''
  modalTrabajo.value = orden
}

function cerrarModalTrabajo() {
  modalTrabajo.value = null
  trabajoTemporal.value = ''
}

async function guardarTrabajoFinal() {
  const orden = modalTrabajo.value
  const trabajo = trabajoTemporal.value.trim()
  if (!orden) return
  if (!trabajo) {
    notificar('Debes registrar el trabajo realizado.', 'error')
    return
  }

  guardando.value = orden.id
  const { error } = await supabase
    .from('ordenes')
    .update({ trabajo_realizado: trabajo })
    .eq('id', orden.id)
  guardando.value = null

  if (error) {
    notificar(error.message, 'error')
    return
  }

  orden.trabajo_realizado = trabajo
  cerrarModalTrabajo()
  await cambiarEstado(orden, 'Reparado')
  notificar('Reparación terminada correctamente.')
}

function confirmarTechSoul(titulo, mensaje, confirmarTexto = 'Confirmar') {
  return new Promise(resolve => {
    resolverConfirmacion = resolve
    modalConfirmacion.value = { titulo, mensaje, confirmarTexto }
  })
}

function responderConfirmacion(valor) {
  const resolver = resolverConfirmacion
  resolverConfirmacion = null
  modalConfirmacion.value = null
  if (resolver) resolver(valor)
}

let reloj = null

const NOMBRE_TECNICO = 'Jorge Ortegón'

const HORARIOS_TALLER = {
  1: { abre: '10:00', cierra: '18:00' },
  2: { abre: '10:00', cierra: '18:00' },
  3: { abre: '10:00', cierra: '18:00' },
  4: { abre: '10:00', cierra: '18:00' },
  5: { abre: '10:00', cierra: '17:00' },
  6: { abre: '10:00', cierra: '15:00' }
}
const INTERVALO_MIN = 30

function minutosDeHora(hora) {
  const [h, m] = String(hora).split(':').map(Number)
  return (h * 60) + m
}

function horaDeMinutos(total) {
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function horarioDeFecha(fecha) {
  if (!fecha) return null
  const dia = new Date(`${fecha}T12:00:00`).getDay()
  return HORARIOS_TALLER[dia] || null
}

const horasFechaDisponibles = computed(() => {
  const horario = horarioDeFecha(fechaTemporalDia.value)
  if (!horario) return []
  const abre = minutosDeHora(horario.abre)
  const cierra = minutosDeHora(horario.cierra)
  const horas = []
  for (let min = abre; min < cierra; min += INTERVALO_MIN) horas.push(horaDeMinutos(min))
  return horas
})

function asegurarHoraFechaValida() {
  if (!horasFechaDisponibles.value.includes(fechaTemporalHora.value)) {
    fechaTemporalHora.value = horasFechaDisponibles.value[0] || ''
  }
}

function etiquetaHorario(fecha) {
  const h = horarioDeFecha(fecha)
  return h ? `${h.abre}–${h.cierra}` : 'Cerrado'
}

const estados = [
  { value: 'Recibido', label: 'Recibido' },
  { value: 'Diagnóstico', label: 'Diagnóstico' },
  { value: 'Esperando autorización', label: 'Esperando autorización' },
  { value: 'Esperando pieza', label: 'Esperando refacción' },
  { value: 'En reparación', label: 'En reparación' },
  { value: 'Reparado', label: 'Reparado' },
  { value: 'En pruebas', label: 'En pruebas' },
  { value: 'Listo', label: 'Listo' },
  { value: 'Entregado', label: 'Entregado' },
  { value: 'Garantía', label: 'Garantía' },
  { value: 'Pendiente de devolución', label: 'Pendiente de devolución' },
  { value: 'Devuelto sin reparación', label: 'Devuelto sin reparación' },
  { value: 'Cancelado', label: 'Cancelado' }
]

const prioridades = [
  { value: 'baja', label: 'Baja' },
  { value: 'normal', label: 'Normal' },
  { value: 'alta', label: 'Prioridad alta' },
  { value: 'urgente', label: 'Urgente' }
]

const pesosPrioridad = { urgente: 4, alta: 3, normal: 2, baja: 1 }

function hoyLocal() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function produccionDe(row) {
  const p = Array.isArray(row.orden_produccion) ? row.orden_produccion[0] : row.orden_produccion
  return p || {
    orden_id: row.id,
    prioridad: 'normal',
    tecnico_id: null,
    tiempo_estimado_min: 60,
    tiempo_acumulado_seg: 0,
    corriendo: false,
    ultima_reanudacion_en: null,
    iniciado_en: null,
    finalizado_en: null
  }
}

function inicioDia(fecha) {
  return new Date(`${fecha}T00:00:00`)
}

function finDia(fecha) {
  const d = inicioDia(fecha)
  d.setDate(d.getDate() + 1)
  return d
}

function mismoDia(valor, fecha = fechaPanel.value) {
  if (!valor) return false
  const d = new Date(valor)
  const ini = inicioDia(fecha)
  const fin = finDia(fecha)
  return d >= ini && d < fin
}

function mananaISO(base = hoyLocal()) {
  const d = new Date(`${base}T12:00:00`)
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

function citaDeOrden(orden) {
  return citas.value
    .filter(c => Number(c.orden_id) === Number(orden.id) && !['Cancelada', 'Cancelado'].includes(c.estado))
    .sort((a, b) => new Date(a.inicio) - new Date(b.inicio))[0] || null
}

function fechaOrden(orden) {
  return citaDeOrden(orden)?.inicio || orden.fecha_programada || null
}

function categoriaFecha(orden) {
  const valor = fechaOrden(orden)
  if (!valor) return 'sin_fecha'
  if (mismoDia(valor, hoyLocal())) return 'hoy'
  if (mismoDia(valor, mananaISO())) return 'manana'
  const d = new Date(valor)
  return d < inicioDia(hoyLocal()) ? 'vencidas' : 'futuras'
}

function prioridadEfectiva(orden) {
  if (['Entregado', 'Cancelado', 'Devuelto sin reparación'].includes(orden.estado)) return orden.produccion?.prioridad || 'normal'

  const categoria = categoriaFecha(orden)
  if (categoria === 'vencidas' || categoria === 'hoy') return 'urgente'
  if (categoria === 'manana') return 'alta'

  // Sin fecha o con fecha posterior a mañana: conserva la prioridad manual existente.
  return orden.produccion?.prioridad || 'normal'
}

const ordenesVisibles = computed(() => {
  const q = filtroTexto.value.trim().toLowerCase()

  return ordenes.value
    .filter(o => {
      if (filtroEstado.value === 'activas') return !['Entregado', 'Cancelado', 'Devuelto sin reparación'].includes(o.estado)
      if (filtroEstado.value === 'todos') return true
      return o.estado === filtroEstado.value
    })
    .filter(o => filtroPrioridad.value === 'todas' || (o.estado !== 'Listo' && prioridadEfectiva(o) === filtroPrioridad.value))
    .filter(o => filtroFecha.value === 'todas' || categoriaFecha(o) === filtroFecha.value)
    .filter(o => !q || [o.folio, o.clientes?.nombre, o.equipos?.marca, o.equipos?.modelo, o.falla_reportada]
      .filter(Boolean)
      .some(v => String(v).toLowerCase().includes(q)))
    .sort((a, b) => {
      const pa = pesosPrioridad[prioridadEfectiva(a)] || 0
      const pb = pesosPrioridad[prioridadEfectiva(b)] || 0
      if (pb !== pa) return pb - pa
      const fa = fechaOrden(a) ? new Date(fechaOrden(a)).getTime() : Number.MAX_SAFE_INTEGER
      const fb = fechaOrden(b) ? new Date(fechaOrden(b)).getTime() : Number.MAX_SAFE_INTEGER
      if (fa !== fb) return fa - fb
      return new Date(a.fecha_ingreso || a.created_at) - new Date(b.fecha_ingreso || b.created_at)
    })
})

const resumen = computed(() => ({
  pendientes: ordenes.value.filter(o => !['Listo', 'Entregado', 'Cancelado', 'Pendiente de devolución', 'Devuelto sin reparación'].includes(o.estado)).length,
  proceso: ordenes.value.filter(o => ['Diagnóstico', 'En reparación', 'Reparado', 'En pruebas', 'Esperando autorización', 'Esperando pieza'].includes(o.estado)).length,
  listas: ordenes.value.filter(o => o.estado === 'Listo').length,
  entregadosHoy: ordenes.value.filter(o => o.estado === 'Entregado' && mismoDia(o.updated_at || o.fecha_salida || o.fecha_entrega)).length,
  citasHoy: citas.value.filter(c => mismoDia(c.inicio, hoyLocal()) && !['Cancelada', 'Cancelado'].includes(c.estado)).length,
  urgentes: ordenes.value.filter(o => !['Listo', 'Entregado', 'Cancelado', 'Pendiente de devolución', 'Devuelto sin reparación'].includes(o.estado) && prioridadEfectiva(o) === 'urgente').length
}))

async function cargar() {
  cargando.value = true
  const [ordenesRes, citasRes] = await Promise.all([
    supabase
      .from('ordenes')
      .select('id,folio,estado,falla_reportada,diagnostico,motivo_no_reparacion,explicacion_no_reparacion,notas_devolucion,fecha_devolucion,trabajo_realizado,costo_total,anticipo,fecha_ingreso,created_at,updated_at,fecha_programada,duracion_estimada_min,clientes(nombre,telefono),equipos(tipo_equipo,marca,modelo),orden_servicios(tipo_servicio,descripcion,precio,orden_visual),orden_produccion(*)')
      .order('fecha_ingreso', { ascending: false })
      .limit(300),
    supabase
      .from('citas_agenda')
      .select('id,orden_id,nombre_cliente,telefono,equipo,servicio,inicio,duracion_min,estado,notas')
      .order('inicio', { ascending: true })
  ])

  cargando.value = false
  if (ordenesRes.error) {
    notificar(`No se pudo cargar el panel: ${ordenesRes.error.message}`, 'error')
    return
  }
  if (citasRes.error && !String(citasRes.error.message || '').toLowerCase().includes('citas_agenda')) {
    console.warn('Agenda:', citasRes.error.message)
  }

  ordenes.value = (ordenesRes.data || []).map(row => ({ ...row, produccion: produccionDe(row) }))
  citas.value = citasRes.data || []
}

function etiquetaEstado(estado) {
  return estados.find(e => e.value === estado)?.label || estado
}

function tecnicoNombre() {
  return NOMBRE_TECNICO
}

function segundosTrabajados(orden) {
  const p = orden.produccion || {}
  let segundos = Number(p.tiempo_acumulado_seg || 0)
  if (p.corriendo && p.ultima_reanudacion_en) {
    segundos += Math.max(0, Math.floor((ahora.value - new Date(p.ultima_reanudacion_en).getTime()) / 1000))
  }
  return segundos
}

function formatoTiempo(segundos) {
  const totalMin = Math.floor(Number(segundos || 0) / 60)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h <= 0) return `${m} min`
  return `${h} h ${m} min`
}

function clasePrioridad(prioridad) {
  return `priority-card-${prioridad || 'normal'}`
}

function claseTarjeta(orden) {
  if (orden.estado === 'Listo') return 'order-card-listo'
  return clasePrioridad(prioridadEfectiva(orden))
}

function encabezadoTarjeta(orden) {
  if (orden.estado === 'Listo') {
    return { icono: '✓', titulo: 'LISTO', subtitulo: 'Equipo listo para entregar' }
  }
  const prioridad = prioridadEfectiva(orden)
  return {
    icono: prioridadIcono(prioridad),
    titulo: prioridadLabel(prioridad).toUpperCase(),
    subtitulo: prioridadSubtitulo(prioridad)
  }
}

function prioridadLabel(prioridad) {
  return prioridades.find(p => p.value === prioridad)?.label || 'Normal'
}

function prioridadSubtitulo(prioridad) {
  if (prioridad === 'urgente') return 'Atender primero'
  if (prioridad === 'alta') return 'Atender hoy'
  if (prioridad === 'baja') return 'Puede esperar'
  return 'En tiempo'
}

function prioridadIcono(prioridad) {
  if (prioridad === 'urgente') return '⚠'
  if (prioridad === 'alta') return '!'
  return '⚑'
}

function fechaBonita(valor) {
  if (!valor) return 'Sin fecha'
  const d = new Date(valor)
  const hoy = hoyLocal()
  const man = mananaISO()
  const prefijo = mismoDia(valor, hoy) ? 'Hoy' : mismoDia(valor, man) ? 'Mañana' : ''
  const fecha = d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
  const hora = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
  return `${prefijo ? `${prefijo}, ` : ''}${fecha} · ${hora}`
}

function fechaHeader() {
  return new Date(`${fechaPanel.value}T12:00:00`).toLocaleDateString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })
}

function moverDia(delta) {
  const d = new Date(`${fechaPanel.value}T12:00:00`)
  d.setDate(d.getDate() + delta)
  fechaPanel.value = d.toISOString().slice(0, 10)
}

function abrirFecha(orden) {
  editandoFechaId.value = orden.id
  const actual = fechaOrden(orden)
  if (actual) {
    const d = new Date(actual)
    const pad = n => String(n).padStart(2, '0')
    fechaTemporalDia.value = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
    fechaTemporalHora.value = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  } else {
    fechaTemporalDia.value = fechaPanel.value
    fechaTemporalHora.value = horarioDeFecha(fechaTemporalDia.value)?.abre || ''
  }
  asegurarHoraFechaValida()
}

async function guardarFecha(orden) {
  if (!fechaTemporalDia.value || !fechaTemporalHora.value) return
  const horario = horarioDeFecha(fechaTemporalDia.value)
  if (!horario) return notificar('El taller está cerrado los domingos. Selecciona otro día.', 'error')
  if (!horasFechaDisponibles.value.includes(fechaTemporalHora.value)) {
    return notificar(`Selecciona una hora dentro del horario ${horario.abre} a ${horario.cierra}.`, 'error')
  }
  guardando.value = orden.id
  const iso = new Date(`${fechaTemporalDia.value}T${fechaTemporalHora.value}:00`).toISOString()
  const { error } = await supabase.from('ordenes').update({ fecha_programada: iso }).eq('id', orden.id)
  guardando.value = null
  if (error) return notificar(error.message, 'error')
  orden.fecha_programada = iso
  editandoFechaId.value = null
  await registrarHistorial(orden, 'Fecha programada', `La orden se programó para ${fechaBonita(iso)}.`, { tipo: 'agenda' })
}

async function quitarFecha(orden) {
  guardando.value = orden.id
  const { error } = await supabase.from('ordenes').update({ fecha_programada: null }).eq('id', orden.id)
  guardando.value = null
  if (error) return notificar(error.message, 'error')
  orden.fecha_programada = null
  editandoFechaId.value = null
}

async function registrarHistorial(orden, titulo, descripcion, extra = {}) {
  const { data } = await supabase.auth.getUser()
  const { error } = await supabase.from('orden_historial').insert({
    orden_id: orden.id,
    tipo: extra.tipo || 'produccion',
    titulo,
    descripcion,
    estado_anterior: extra.estado_anterior || null,
    estado_nuevo: extra.estado_nuevo || null,
    usuario_id: data.user?.id || null
  })
  if (error) console.warn('Historial:', error.message)
  return !error
}

async function guardarProduccion(orden, cambios, historial = null) {
  guardando.value = orden.id
  const { data, error } = await supabase
    .from('orden_produccion')
    .upsert({ orden_id: orden.id, ...cambios }, { onConflict: 'orden_id' })
    .select()
    .single()
  guardando.value = null

  if (error) {
    notificar(error.message, 'error')
    return false
  }

  orden.produccion = { ...orden.produccion, ...data }
  if (historial) await registrarHistorial(orden, historial.titulo, historial.descripcion)
  return true
}

async function pausarSilencioso(orden) {
  if (!orden.produccion?.corriendo) return
  const acumulado = segundosTrabajados(orden)
  await guardarProduccion(orden, { corriendo: false, tiempo_acumulado_seg: acumulado, ultima_reanudacion_en: null })
}

function seleccionarFotoInterna(event) {
  const file = event.target.files?.[0] || null
  if (!file) return
  asignarFotoInterna(file)
  event.target.value = ''
}

function asignarFotoInterna(file) {
  if (!file?.type.startsWith('image/')) return notificar('Selecciona una imagen.', 'error')
  fotoInterna.value = file
  if (previewInterna.value) URL.revokeObjectURL(previewInterna.value)
  previewInterna.value = file ? URL.createObjectURL(file) : ''
}

function cerrarEvidenciaInterna() {
  if (guardandoEvidencia.value) return
  cerrarCamara()
  if (previewInterna.value) URL.revokeObjectURL(previewInterna.value)
  modalEvidencia.value = null
  fotoInterna.value = null
  previewInterna.value = ''
}

async function solicitarEvidenciaInterna(orden) {
  const { data, error } = await supabase
    .from('evidencias')
    .select('id')
    .eq('orden_id', orden.id)
    .eq('tipo', 'Blindajes antes de cierre')
    .limit(1)
  if (error) throw error
  if (data?.length) return true
  modalEvidencia.value = orden
  return false
}

async function guardarEvidenciaInterna() {
  const orden = modalEvidencia.value
  if (!orden || guardandoEvidencia.value) return
  if (!fotoInterna.value) return notificar('Toma una fotografía del interior con los blindajes colocados antes de cerrar el equipo.', 'error')
  guardandoEvidencia.value = true
  try {
    const url = await subirEvidencia(fotoInterna.value, `orden-${orden.id}/reparacion-interna`)
    const { error } = await supabase.from('evidencias').insert({
      orden_id: orden.id,
      tipo: 'Blindajes antes de cierre',
      url_imagen: url,
      descripcion: 'Interior con blindajes colocados antes del cierre.'
    })
    if (error) throw error
    await supabase.from('orden_historial').insert({
      orden_id: orden.id,
      tipo: 'evidencia',
      titulo: 'Blindajes documentados antes del cierre',
      descripcion: 'Se documentaron los blindajes colocados antes de cerrar el equipo.'
    })
    guardandoEvidencia.value = false
    cerrarEvidenciaInterna()
    await cambiarEstado(orden, 'En pruebas', true)
  } catch (error) {
    notificar(error.message, 'error')
  } finally {
    guardandoEvidencia.value = false
  }
}

function sugerirSolucion(orden) {
  const servicios = [...(orden.orden_servicios || [])].sort((a, b) => (a.orden_visual || 0) - (b.orden_visual || 0))
  return servicios.map(servicio => {
    const tipo = String(servicio.tipo_servicio || '').toLowerCase()
    const detalle = String(servicio.descripcion || '').toLowerCase()
    let componente = ''
    if (/cristal.*cámara/.test(tipo)) componente = 'el cristal protector de la cámara'
    else if (/cristal trasero/.test(detalle)) componente = 'el cristal trasero'
    else if (/tapa/.test(tipo)) componente = 'la tapa trasera'
    else if (/pantalla/.test(tipo)) componente = 'la pantalla'
    else if (/batería/.test(tipo)) componente = 'la batería'
    if (componente) return `Para darle solución al problema de su equipo, es necesario reemplazar ${componente}.`
    if (/centro de carga/.test(tipo)) return 'Para darle solución al problema de carga de su equipo, es necesario intervenir el centro de carga conforme al diagnóstico.'
    if (/diagnóstico/.test(tipo)) return 'Es necesario realizar pruebas en su equipo para identificar la causa del problema y definir la reparación adecuada.'
    return `Para atender el problema de su equipo, proponemos realizar el servicio de ${servicio.tipo_servicio}.`
  }).join('\n\n')
}

function nombreServicioCliente(servicio) {
  const detalle = String(servicio.descripcion || '').toLowerCase()
  if (/cristal trasero/.test(detalle)) return 'Reemplazo de cristal trasero'
  if (/cristal de cámara|cristal.*cámara/.test(detalle)) return 'Reemplazo de cristal de cámara'
  return servicio.tipo_servicio || 'Servicio de reparación'
}

function mensajeDiagnostico(orden) {
  const equipo = [orden.equipos?.marca, orden.equipos?.modelo].filter(Boolean).join(' ') || 'No especificado'
  const moneda = monto => Number(monto || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
  const servicios = [...(orden.orden_servicios || [])].sort((a, b) => (a.orden_visual || 0) - (b.orden_visual || 0))
  const cotizacion = servicios.length ? servicios.map(servicio => [
    `• Servicio: ${nombreServicioCliente(servicio)}`,
    `• Precio: *${moneda(servicios.length === 1 ? orden.costo_total : servicio.precio)}*`
  ].join('\n')).join('\n\n') : `• Precio: *${moneda(orden.costo_total)}*`
  const diagnostico = String(orden.diagnostico || '').trim()
  return `Hola 💙 Le compartimos el resultado de la revisión de su equipo.\n\n📱 *Equipo:* ${equipo}\n\n🔎 *Lo que encontramos:*\n${diagnostico}\n\n🛠️ *Solución propuesta:*\n${solucionParaCliente(orden)}\n\n💰 *Cotización:*\n${cotizacion}${servicios.length > 1 ? `\n\n*Total cotizado: ${moneda(orden.costo_total)}*` : ''}\n\n¿Nos autoriza a realizar el trabajo?\nQuedamos atentos a su confirmación. 💙\n\n*TechSoul*`
}

function solucionParaCliente(orden) {
  const actual = String(orden.trabajo_realizado || '').trim()
  const servicios = orden.orden_servicios || []
  const resumen = servicios.map(s => String(s.descripcion || s.tipo_servicio || '').trim()).filter(Boolean).join(', ')
  // Amplía únicamente el resumen automático; conserva el texto escrito por el técnico.
  return (!actual || actual === resumen) ? (sugerirSolucion(orden) || actual) : actual
}

function abrirDiagnostico(orden) {
  modalDiagnostico.value = orden
  limpiarFotosDiagnostico()
  diagnosticoForm.value = {
    diagnostico: orden.diagnostico || '',
    solucion: solucionParaCliente(orden),
    costo: Number(orden.costo_total || 0) || ''
  }
}

function compartirDiagnostico(orden) {
  const telefono = String(orden.clientes?.telefono || '').replace(/\D/g, '')
  if (!telefono) return notificar('Este cliente no tiene teléfono registrado.', 'error')
  const numero = telefono.length === 10 ? `52${telefono}` : telefono
  const mensaje = mensajeDiagnostico(orden)
  const parametros = new URLSearchParams({ phone: numero, text: mensaje })
  window.open(`https://api.whatsapp.com/send?${parametros.toString()}`, '_blank', 'noopener,noreferrer')
}

async function copiarDiagnostico(orden) {
  try {
    await navigator.clipboard.writeText(mensajeDiagnostico(orden))
    notificar('Mensaje copiado. Pégalo en WhatsApp para conservar los emojis.', 'success')
  } catch {
    notificar('No se pudo copiar. Permite el acceso al portapapeles e inténtalo de nuevo.', 'error')
  }
}

function cerrarDiagnostico() {
  if (guardandoDiagnostico.value) return
  cerrarCamara()
  modalDiagnostico.value = null
  limpiarFotosDiagnostico()
  diagnosticoForm.value = { diagnostico: '', solucion: '', costo: '' }
}

async function guardarDiagnosticoYAutorizar() {
  const orden = modalDiagnostico.value
  if (!orden || guardandoDiagnostico.value) return
  const diagnostico = diagnosticoForm.value.diagnostico.trim()
  const solucion = diagnosticoForm.value.solucion.trim()
  const costo = Number(diagnosticoForm.value.costo || 0)
  if (!diagnostico) return notificar('Ingresa el diagnóstico técnico.', 'error')
  if (!solucion) return notificar('Ingresa la solución o reparación propuesta.', 'error')
  if (!Number.isFinite(costo) || costo < 0) return notificar('Ingresa un costo válido.', 'error')
  if (!fotosDiagnostico.value.every(Boolean)) return notificar('Toma las dos fotografías obligatorias del diagnóstico.', 'error')
  guardandoDiagnostico.value = true
  try {
    for (const [indice, foto] of fotosDiagnostico.value.entries()) {
      const descripcion = `Diagnóstico · Foto ${indice + 1} obligatoria`
      const url = await subirEvidencia(foto, `orden-${orden.id}/diagnostico`)
      const { data: existentes, error: errorConsulta } = await supabase.from('evidencias').select('id').eq('orden_id', orden.id).eq('tipo', 'Diagnóstico').eq('descripcion', descripcion).limit(1)
      if (errorConsulta) throw errorConsulta
      const payload = { orden_id: orden.id, tipo: 'Diagnóstico', url_imagen: url, descripcion }
      const resultado = existentes?.length
        ? await supabase.from('evidencias').update(payload).eq('id', existentes[0].id)
        : await supabase.from('evidencias').insert(payload)
      if (resultado.error) throw resultado.error
    }
    const { error } = await supabase.from('ordenes').update({ diagnostico, trabajo_realizado: solucion, costo_total: costo }).eq('id', orden.id)
    if (error) throw error
    orden.diagnostico = diagnostico
    orden.trabajo_realizado = solucion
    orden.costo_total = costo
    guardandoDiagnostico.value = false
    cerrarDiagnostico()
    await cambiarEstado(orden, 'Esperando autorización', true)
  } catch (error) {
    notificar(error.message, 'error')
  } finally {
    guardandoDiagnostico.value = false
  }
}

async function accionPrincipal(orden) {
  if (guardando.value === orden.id) return
  if (orden.estado === 'Pendiente de devolución') return abrirNoReparacion(orden, true)
  if (orden.estado === 'Recibido') return cambiarEstado(orden, 'Diagnóstico')
  if (orden.estado === 'Diagnóstico') return abrirDiagnostico(orden)
  if (orden.estado === 'Esperando pieza') return cambiarEstado(orden, 'En reparación')
  if (orden.estado === 'En reparación') {
    abrirModalTrabajo(orden)
    return
  }
  if (orden.estado === 'Reparado') return cambiarEstado(orden, 'En pruebas')
  if (orden.estado === 'Listo') return cambiarEstado(orden, 'Entregado')
}

function etiquetaAccion(orden) {
  const mapa = {
    'Recibido': '🔎 Iniciar diagnóstico',
    'Diagnóstico': '📋 Registrar diagnóstico',
    'Esperando pieza': '🔧 Refacción recibida · Reparar',
    'En reparación': '✓ Terminar reparación',
    'Reparado': '🧪 Pasar a pruebas',
    'Pendiente de devolución': 'Registrar devolución sin reparación',
    'Listo': '📦 Marcar entregado'
  }
  return mapa[orden.estado] || ''
}

async function cambiarEstado(orden, nuevoEstado, evidenciaValidada = false) {
  if (guardando.value === orden.id) return
  if (orden.estado === nuevoEstado) return
  if (ESTADOS_DEVOLUCION.includes(nuevoEstado)) {
    if (nuevoEstado === 'Devuelto sin reparación' && orden.estado !== 'Pendiente de devolución') return notificar('Primero registra el motivo y deja el equipo pendiente de devolución.', 'error')
    abrirNoReparacion(orden, nuevoEstado === 'Devuelto sin reparación'); return
  }
  if (ESTADOS_DEVOLUCION.includes(orden.estado)) return notificar('Esta orden sigue el flujo de devolución sin reparación.', 'error')
  if (nuevoEstado === 'Esperando autorización' && !evidenciaValidada) { abrirDiagnostico(orden); return }
  if (nuevoEstado === 'En pruebas' && !evidenciaValidada) {
    try {
      const ok = await solicitarEvidenciaInterna(orden)
      if (!ok) return
    } catch (error) {
      notificar(error.message, 'error')
      return
    }
  }
  if (nuevoEstado === 'Listo') {
    const [{ data: controles, error: ec }, { data: fotos, error: ef }] = await Promise.all([
      supabase.from('control_calidad_orden').select('estado').eq('orden_id', orden.id),
      supabase.from('evidencias').select('tipo').eq('orden_id', orden.id).eq('tipo', 'Salida')
    ])
    if (ec || ef || !pruebasAprobadas(controles || []) || !fotos?.length) {
      notificar('Para marcar como Listo, las pruebas deben funcionar o no aplicar y debe estar completa la evidencia de salida.', 'error')
      return
    }
  }
  if (nuevoEstado === 'Entregado' && Number(orden.costo_total || 0) > Number(orden.anticipo || 0)) return notificar('Registra el pago pendiente antes de entregar el equipo.', 'error')
  guardando.value = orden.id

  if (['Esperando autorización', 'Esperando pieza', 'Listo', 'Entregado', 'Cancelado', 'Pendiente de devolución', 'Devuelto sin reparación'].includes(nuevoEstado) && orden.produccion?.corriendo) await pausarSilencioso(orden)

  const anterior = orden.estado
  const { data: estadoGuardado, error } = await supabase.from('ordenes').update({ estado: nuevoEstado }).eq('id', orden.id).eq('estado', anterior).select('id').single()
  guardando.value = null
  if (error || !estadoGuardado) return notificar(error?.message || 'La orden cambió en otro dispositivo. Recarga Taller.', 'error')

  orden.estado = nuevoEstado
  orden.updated_at = new Date().toISOString()
  if (nuevoEstado === 'Diagnóstico' && !orden.produccion?.iniciado_en) {
    const iso = new Date().toISOString()
    await guardarProduccion(orden, { corriendo: true, iniciado_en: iso, ultima_reanudacion_en: iso })
  }

  const etapaMap = {
    'Recibido': 'por_hacer', 'Diagnóstico': 'diagnostico', 'Esperando autorización': 'diagnostico',
    'Esperando pieza': 'reparacion', 'En reparación': 'reparacion', 'Reparado': 'reparacion', 'En pruebas': 'pruebas', 'Listo': 'listo',
    'Entregado': 'listo', 'Garantía': 'por_hacer', 'Cancelado': 'por_hacer'
  }

  const produccionCambios = { etapa: etapaMap[nuevoEstado] || 'por_hacer' }
  if (nuevoEstado === 'En reparación' && !orden.produccion?.corriendo) { produccionCambios.corriendo = true; produccionCambios.ultima_reanudacion_en = new Date().toISOString() }
  if (nuevoEstado === 'Listo') produccionCambios.finalizado_en = new Date().toISOString()
  if (!['Listo', 'Entregado'].includes(nuevoEstado)) produccionCambios.finalizado_en = null
  await guardarProduccion(orden, produccionCambios)

  await registrarHistorial(orden, `Estado cambiado a ${etiquetaEstado(nuevoEstado)}`,
    `La orden cambió de ${etiquetaEstado(anterior)} a ${etiquetaEstado(nuevoEstado)} desde el Panel de Taller.`,
    { tipo: 'estado', estado_anterior: anterior, estado_nuevo: nuevoEstado })

  if (nuevoEstado === 'Listo') {
    try {
      const firma = await asegurarFirmaGarantiaPorOrden(orden.id)
      if (firma) {
        const enviar = await confirmarTechSoul(
          'Equipo listo ✓',
          '¿Enviar al cliente su garantía para firma digital por WhatsApp?',
          'Enviar por WhatsApp'
        )
        if (enviar) abrirWhatsAppFirma(firma)
      }
    } catch (e) {
      console.warn('Firma digital de garantía:', e)
      notificar(`La orden quedó como Listo, pero no se pudo preparar la firma digital: ${e.message}`, 'error')
    }
  }
}

async function cambiarPrioridad(orden, prioridad) {
  await guardarProduccion(orden, { prioridad }, {
    titulo: `Prioridad ${prioridad}`,
    descripcion: `La prioridad de ${orden.folio} cambió a ${prioridad}.`
  })
}

async function iniciar(orden) {
  if (orden.produccion?.corriendo) return
  const iso = new Date().toISOString()

  await guardarProduccion(orden, {
    corriendo: true,
    ultima_reanudacion_en: iso,
    iniciado_en: orden.produccion?.iniciado_en || iso,
    finalizado_en: null
  }, { titulo: 'Trabajo iniciado', descripcion: `${tecnicoNombre()} inició tiempo de trabajo.` })
}

async function pausar(orden) {
  if (!orden.produccion?.corriendo) return
  const acumulado = segundosTrabajados(orden)
  await guardarProduccion(orden, {
    corriendo: false,
    tiempo_acumulado_seg: acumulado,
    ultima_reanudacion_en: null
  }, { titulo: 'Trabajo pausado', descripcion: `Tiempo acumulado: ${formatoTiempo(acumulado)}.` })
}

onMounted(async () => {
  reloj = window.setInterval(() => { ahora.value = Date.now() }, 1000)
  await cargar()
})

onBeforeUnmount(() => {
  cerrarCamara()
  limpiarFotosDiagnostico()
  if (previewInterna.value) URL.revokeObjectURL(previewInterna.value)
  if (reloj) window.clearInterval(reloj)
  if (toastTimer) window.clearTimeout(toastTimer)
  if (resolverConfirmacion) resolverConfirmacion(false)
})
</script>

<template>
  <section class="workshop-page">
    <header class="workshop-header">
      <div>
        <span class="eyebrow">Taller · TechSoul</span>
        <h1>Control de órdenes</h1>
        <p>Gestiona el flujo de reparaciones, prioridades y fechas de entrega.</p>
      </div>
      <div class="header-actions">
        <div class="day-control">
          <button type="button" @click="moverDia(-1)" aria-label="Día anterior">‹</button>
          <label>
            <span>📅</span>
            <strong>{{ fechaHeader() }}</strong>
            <input v-model="fechaPanel" type="date" aria-label="Fecha del panel">
          </label>
          <button type="button" @click="moverDia(1)" aria-label="Día siguiente">›</button>
        </div>
        <router-link to="/agenda" class="calendar-action">▣ Ver calendario</router-link>
        <router-link to="/nueva-orden" class="primary-action">＋ Nueva orden</router-link>
      </div>
    </header>

    <div class="metrics">
      <button type="button" @click="filtroEstado = 'activas'">
        <span class="metric-icon blue">◷</span><span class="metric-copy">Pendientes<strong>{{ resumen.pendientes }}</strong></span>
      </button>
      <button type="button" @click="filtroEstado = 'En reparación'">
        <span class="metric-icon blue">⌁</span><span class="metric-copy">En proceso<strong>{{ resumen.proceso }}</strong></span>
      </button>
      <button type="button" @click="filtroEstado = 'Listo'">
        <span class="metric-icon green">✓</span><span class="metric-copy">Listos<strong>{{ resumen.listas }}</strong></span>
      </button>
      <button type="button" @click="filtroEstado = 'Entregado'">
        <span class="metric-icon blue">▣</span><span class="metric-copy">Entregados hoy<strong>{{ resumen.entregadosHoy }}</strong></span>
      </button>
      <router-link to="/agenda" class="metric-link">
        <span class="metric-icon blue">▦</span><span class="metric-copy">Citas hoy<strong>{{ resumen.citasHoy }}</strong></span>
      </router-link>
      <button type="button" class="urgent-metric" @click="filtroPrioridad = 'urgente'">
        <span class="metric-icon red">△</span><span class="metric-copy">Urgentes<strong>{{ resumen.urgentes }}</strong></span>
      </button>
    </div>

    <div class="toolbar">
      <label class="search-box">
        <span>⌕</span>
        <input v-model="filtroTexto" placeholder="Buscar folio, cliente, equipo o falla...">
      </label>

      <select v-model="filtroFecha">
        <option value="todas">📅 Todas las fechas</option>
        <option value="hoy">Hoy</option>
        <option value="manana">Mañana</option>
        <option value="sin_fecha">Sin fecha</option>
        <option value="vencidas">Vencidas</option>
        <option value="futuras">Próximas</option>
      </select>

      <select v-model="filtroEstado">
        <option value="activas">Todos los estados activos</option>
        <option v-for="e in estados" :key="e.value" :value="e.value">{{ e.label }}</option>
        <option value="todos">Todos los estados</option>
      </select>

      <select v-model="filtroPrioridad">
        <option value="todas">⚑ Todas las prioridades</option>
        <option v-for="p in prioridades" :key="p.value" :value="p.value">{{ p.label }}</option>
      </select>

      <button class="refresh-btn" type="button" @click="cargar">↻ Actualizar</button>
    </div>

    <div v-if="cargando" class="empty">Cargando órdenes…</div>
    <div v-else-if="!ordenesVisibles.length" class="empty">No hay órdenes con estos filtros.</div>

    <div v-else class="orders-grid">
      <article v-for="orden in ordenesVisibles" :key="orden.id" class="order-card" :class="claseTarjeta(orden)">
        <div class="priority-banner">
          <div class="priority-copy">
            <span class="priority-icon">{{ encabezadoTarjeta(orden).icono }}</span>
            <div>
              <strong class="priority-title">{{ encabezadoTarjeta(orden).titulo }}</strong>
              <small>{{ encabezadoTarjeta(orden).subtitulo }}</small>
            </div>
          </div>

          <button class="date-block" type="button" @click="abrirFecha(orden)">
            <span class="date-icon">▣</span>
            <span><small>Entrega / cita</small><strong>{{ fechaBonita(fechaOrden(orden)) }}</strong></span>
            <b>›</b>
          </button>
        </div>

        <div v-if="editandoFechaId === orden.id" class="date-editor">
          <div class="date-field">
            <label>Fecha</label>
            <input v-model="fechaTemporalDia" type="date" @change="asegurarHoraFechaValida">
          </div>
          <div class="date-field">
            <label>Hora</label>
            <select v-model="fechaTemporalHora" :disabled="!horasFechaDisponibles.length">
              <option v-for="horaSlot in horasFechaDisponibles" :key="horaSlot" :value="horaSlot">{{ horaSlot }}</option>
            </select>
          </div>
          <small class="date-schedule">{{ horarioDeFecha(fechaTemporalDia) ? `Horario ${etiquetaHorario(fechaTemporalDia)}` : 'Domingo · taller cerrado' }}</small>
          <button type="button" class="save-date" :disabled="guardando === orden.id || !horasFechaDisponibles.length" @click="guardarFecha(orden)">Guardar</button>
          <button v-if="orden.fecha_programada" type="button" class="clear-date" @click="quitarFecha(orden)">Quitar</button>
          <button type="button" class="cancel-date" @click="editandoFechaId = null">×</button>
        </div>

        <div class="card-body">
          <router-link :to="`/ordenes/${orden.id}`" class="folio">{{ orden.folio }}</router-link>
          <router-link :to="`/ordenes/${orden.id}`" class="equipment-link">
            <strong>{{ [orden.equipos?.marca, orden.equipos?.modelo].filter(Boolean).join(' ') || orden.equipos?.tipo_equipo || 'Equipo' }}</strong>
          </router-link>
          <p class="client">♙ {{ orden.clientes?.nombre || 'Sin cliente' }}</p>
          <p class="failure">▧ {{ orden.falla_reportada || 'Sin falla reportada' }}</p>

          <div class="main-controls">
            <div class="stage-box">
              <span>Etapa actual</span>
              <strong>{{ etiquetaEstado(orden.estado) }}</strong>
            </div>

            <div class="worked-time">
              <span>Tiempo trabajado</span>
              <strong>◷ {{ formatoTiempo(segundosTrabajados(orden)) }}</strong>
            </div>
          </div>

          <p v-if="orden.motivo_no_reparacion" class="return-summary"><strong>{{ orden.motivo_no_reparacion }}</strong><br>{{ orden.explicacion_no_reparacion }}</p>
          <div class="workflow-actions">
            <button v-if="etiquetaAccion(orden)" type="button" class="workflow-primary" :disabled="guardando === orden.id" @click="accionPrincipal(orden)">{{ etiquetaAccion(orden) }}</button>
            <template v-if="orden.estado === 'Esperando autorización'">
              <button type="button" class="workflow-primary" @click="orden.diagnostico ? compartirDiagnostico(orden) : abrirDiagnostico(orden)">Enviar diagnóstico y cotización</button>
              <button type="button" class="workflow-secondary" :disabled="guardando === orden.id" @click="abrirRespuestaCliente(orden)">Registrar respuesta del cliente</button>
            </template>
            <button v-if="['Diagnóstico', 'Esperando autorización', 'Esperando pieza', 'En reparación', 'En pruebas'].includes(orden.estado)" type="button" class="workflow-secondary" :disabled="guardando === orden.id" @click="abrirNoReparacion(orden)">No podemos continuar</button>
            <button v-if="orden.motivo_no_reparacion && ESTADOS_DEVOLUCION.includes(orden.estado)" type="button" class="workflow-secondary" @click="copiarAvisoNoReparacion(orden)">Copiar aviso al cliente</button>
            <router-link v-if="orden.estado === 'En pruebas'" :to="`/taller/${orden.id}/control`" class="quality-link">Realizar pruebas y evidencia final</router-link>
            <button v-if="orden.estado === 'En pruebas'" type="button" class="workflow-secondary" :disabled="guardando === orden.id" @click="cambiarEstado(orden, 'Diagnóstico')">Pruebas fallidas · Volver a diagnóstico</button>
            <details v-if="orden.estado === 'Esperando autorización' && orden.diagnostico" class="workflow-more">
              <summary>Más opciones</summary>
              <button type="button" class="workflow-secondary" @click="copiarDiagnostico(orden)">Copiar mensaje</button>
              <button type="button" class="workflow-secondary" @click="abrirDiagnostico(orden)">Revisar diagnóstico y cotización</button>
            </details>
          </div>
          <div class="card-footer">
            <div class="fixed-tech">
              <span>Técnico</span>
              <strong>♟ {{ NOMBRE_TECNICO }}</strong>
            </div>

            <button v-if="orden.produccion?.corriendo" type="button" class="timer-btn pause"
              :disabled="guardando === orden.id" @click="pausar(orden)">Ⅱ Pausar</button>
            <span v-else class="finished-label">{{ etiquetaEstado(orden.estado) }}</span>
          </div>
        </div>
      </article>
    </div>

    <div v-if="modalRespuestaCliente" class="evidence-modal-backdrop response-modal" @click.self="cerrarRespuestaCliente">
      <section class="evidence-modal" role="dialog" aria-modal="true" aria-labelledby="response-title">
        <div class="evidence-modal-head"><div><span>{{ modalRespuestaCliente.folio }}</span><h2 id="response-title">Respuesta del cliente</h2></div><button type="button" :disabled="guardandoRespuestaCliente" @click="cerrarRespuestaCliente">×</button></div>
        <label class="repair-description"><span>¿Qué decidió el cliente?</span><select v-model="respuestaClienteForm.respuesta"><option value="autoriza">Autorizó el trabajo</option><option value="rechaza">No autorizó la cotización</option></select></label>
        <label v-if="respuestaClienteForm.respuesta === 'autoriza'" class="repair-description"><span>¿Podemos iniciar?</span><select v-model="respuestaClienteForm.faltaRefaccion"><option :value="false">Sí, iniciar reparación</option><option :value="true">Falta refacción, esperar su llegada</option></select></label>
        <label class="repair-description"><span>Confirmación recibida *</span><textarea v-model="respuestaClienteForm.nota" rows="3" placeholder="Ej. Alejandro autorizó por WhatsApp el precio y el servicio cotizado."></textarea></label>
        <p v-if="respuestaClienteForm.respuesta === 'rechaza'">Registrarás el motivo y la explicación antes de dejar el equipo pendiente de devolución.</p>
        <div class="evidence-modal-actions"><button type="button" class="cancel-evidence" :disabled="guardandoRespuestaCliente" @click="cerrarRespuestaCliente">Cancelar</button><button type="button" class="save-evidence" :disabled="guardandoRespuestaCliente" @click="guardarRespuestaCliente">{{ guardandoRespuestaCliente ? 'Guardando...' : 'Registrar respuesta' }}</button></div>
      </section>
    </div>

    <div v-if="modalNoReparacion" class="evidence-modal-backdrop return-modal" @click.self="cerrarNoReparacion">
      <section class="evidence-modal" role="dialog" aria-modal="true" aria-labelledby="return-title">
        <div class="evidence-modal-head"><div><span>{{ modalNoReparacion.folio }}</span><h2 id="return-title">{{ devolviendoEquipo ? 'Devolver sin reparación' : 'No podemos continuar' }}</h2></div><button type="button" :disabled="guardandoNoReparacion" @click="cerrarNoReparacion">×</button></div>
        <label class="repair-description"><span>Motivo *</span><select v-model="noReparacionForm.motivo" :disabled="devolviendoEquipo"><option value="">Selecciona un motivo</option><option v-for="motivo in MOTIVOS_NO_REPARACION" :key="motivo">{{ motivo }}</option></select></label>
        <label class="repair-description"><span>Diagnóstico y pruebas realizadas *</span><textarea v-model="noReparacionForm.diagnostico" rows="3"></textarea></label>
        <label class="repair-description"><span>Explicación para el cliente *</span><textarea v-model="noReparacionForm.explicacion" rows="4" placeholder="Explica por qué no podemos realizar el trabajo. Evita afirmar que no tiene solución si no se pudo completar el diagnóstico."></textarea></label>
        <p>Las evidencias existentes se conservan. Puedes agregar pruebas y fotografías desde el apartado de Evidencias de la orden.</p>
        <label v-if="devolviendoEquipo" class="repair-description"><span>Recibió el equipo y acuerdo de pagos *</span><textarea v-model="noReparacionForm.notas" rows="4" placeholder="Nombre de quien recibe, estado del equipo, cobro de diagnóstico y anticipo devuelto o pendiente. Si no hubo pagos, indícalo."></textarea></label>
        <p>Revisa los cobros y anticipos antes de devolver el equipo. Esta acción registra el acuerdo; los movimientos de dinero se registran por separado en Caja.</p>
        <div class="evidence-modal-actions"><button type="button" class="cancel-evidence" :disabled="guardandoNoReparacion" @click="cerrarNoReparacion">Cancelar</button><button type="button" class="save-evidence" :disabled="guardandoNoReparacion" @click="guardarNoReparacion">{{ guardandoNoReparacion ? 'Guardando...' : devolviendoEquipo ? 'Confirmar devolución' : 'Guardar · Pendiente de devolución' }}</button></div>
      </section>
    </div>

    <div v-if="modalDiagnostico" class="evidence-modal-backdrop" @click.self="cerrarDiagnostico">
      <section class="evidence-modal">
        <div class="evidence-modal-head"><div><span>DIAGNÓSTICO TÉCNICO</span><h2>Enviar a autorización</h2></div><button type="button" @click="cerrarDiagnostico">×</button></div>
        <button type="button" class="workflow-secondary" :disabled="guardandoDiagnostico" @click="abrirNoReparacion(modalDiagnostico)">No podemos continuar con este servicio</button>
        <p>Antes de esperar la autorización del cliente, deja documentado qué se encontró y qué se propone hacer.</p>
        <label class="repair-description"><span>Diagnóstico encontrado *</span><textarea v-model="diagnosticoForm.diagnostico" rows="3" placeholder="Ej. Consumo anormal en circuito de carga; batería degradada."></textarea></label>
        <label class="repair-description"><span>Solución Propuesta: (Ser específico y claro para el cliente) *</span><textarea v-model="diagnosticoForm.solucion" rows="5" placeholder="Describe qué componente del equipo se reparará o reemplazará, cómo se resolverá la falla y qué funcionamiento se espera recuperar. Ej. En tu iPhone 12 Pro reemplazaremos la pantalla dañada porque presenta líneas y no responde al tacto. Después comprobaremos la imagen y la respuesta táctil."></textarea></label>
        <p>La solución se sugiere a partir de los servicios seleccionados. Revísala y precisa el componente, la calidad de la pieza y el alcance antes de enviarla.</p>
        <label class="repair-description"><span>Costo cotizado *</span><input v-model="diagnosticoForm.costo" type="number" min="0" step="1" placeholder="0"></label>
        <div class="diagnostic-photo-grid">
          <article v-for="indice in [0, 1]" :key="indice" class="diagnostic-photo-slot">
            <strong>Foto {{ indice + 1 }} del diagnóstico *</strong>
            <img v-if="previewsDiagnostico[indice]" :src="previewsDiagnostico[indice]" :alt="`Foto ${indice + 1} del diagnóstico`">
            <div v-else class="photo-empty">Interior del equipo · obligatoria</div>
            <button type="button" class="photo-camera-button" :disabled="guardandoDiagnostico" @click="abrirCamara({ tipo: 'diagnostico', indice })">📷 {{ fotosDiagnostico[indice] ? 'Volver a tomar' : 'Tomar foto' }}</button>
            <label class="photo-file-button">Cámara o galería del dispositivo<input type="file" accept="image/*" capture="environment" :disabled="guardandoDiagnostico" @change="seleccionarFotoDiagnostico($event, indice)"></label>
          </article>
        </div>
        <small>{{ fotosDiagnostico.filter(Boolean).length }} / 2 fotografías capturadas. Ambas son obligatorias.</small>
        <div class="evidence-modal-actions"><button type="button" class="cancel-evidence" @click="cerrarDiagnostico">Cancelar</button><button type="button" class="save-evidence" :disabled="guardandoDiagnostico" @click="guardarDiagnosticoYAutorizar">{{ guardandoDiagnostico ? 'Guardando...' : 'Guardar y esperar autorización' }}</button></div>
      </section>
    </div>

    <div v-if="modalEvidencia" class="evidence-modal-backdrop" @click.self="cerrarEvidenciaInterna">
      <section class="evidence-modal">
        <div class="evidence-modal-head">
          <div><span>EVIDENCIA DE REPARACIÓN</span><h2>Blindajes antes de cerrar</h2></div>
          <button type="button" @click="cerrarEvidenciaInterna">×</button>
        </div>
        <p>Toma una fotografía del interior con los blindajes colocados, antes de cerrar el equipo y pasar a pruebas. Esta evidencia quedará vinculada permanentemente a la orden <strong>{{ modalEvidencia.folio }}</strong>.</p>
        <label class="internal-photo-box">
          <img v-if="previewInterna" :src="previewInterna" alt="Evidencia interna de reparación">
          <div v-else><b>Interior con blindajes colocados</b><small>Foto obligatoria antes de cerrar</small></div>
          <input type="file" accept="image/*" capture="environment" :disabled="guardandoEvidencia" @change="seleccionarFotoInterna">
        </label>
        <button type="button" class="photo-camera-button" :disabled="guardandoEvidencia" @click="abrirCamara({ tipo: 'blindajes' })">📷 {{ fotoInterna ? 'Volver a tomar foto de blindajes' : 'Tomar foto de blindajes' }}</button>
        <div class="evidence-modal-actions"><button type="button" class="cancel-evidence" @click="cerrarEvidenciaInterna">Cancelar</button><button type="button" class="save-evidence" :disabled="guardandoEvidencia" @click="guardarEvidenciaInterna">{{ guardandoEvidencia ? 'Guardando...' : 'Guardar y pasar a pruebas' }}</button></div>
      </section>
    </div>

    <div v-if="camaraDestino" class="camera-backdrop">
      <section class="camera-dialog" role="dialog" aria-modal="true" aria-label="Tomar evidencia">
        <header><strong>{{ camaraDestino.tipo === 'diagnostico' ? `Foto ${camaraDestino.indice + 1} del diagnóstico` : 'Blindajes antes de cerrar' }}</strong><button type="button" @click="cerrarCamara" aria-label="Cerrar cámara">×</button></header>
        <video ref="videoCamara" autoplay muted playsinline></video>
        <p v-if="iniciandoCamara">Iniciando cámara…</p>
        <p v-if="errorCamara" role="alert">{{ errorCamara }}</p>
        <button type="button" class="photo-camera-button" :disabled="iniciandoCamara || !!errorCamara" @click="capturarFoto">📷 Capturar foto</button>
      </section>
    </div>

    <Transition name="toast-techsoul">
      <div v-if="toast.visible" class="techsoul-toast" :class="`toast-${toast.tipo}`" role="status">
        <span class="toast-icon">{{ toast.tipo === 'error' ? '!' : '✓' }}</span>
        <span>{{ toast.mensaje }}</span>
      </div>
    </Transition>

    <div v-if="modalTrabajo" class="techsoul-modal-backdrop" @click.self="cerrarModalTrabajo">
      <section class="techsoul-modal" role="dialog" aria-modal="true">
        <div class="techsoul-modal-head">
          <div><span>REPARACIÓN</span><h2>Finalizar reparación</h2></div>
          <button type="button" @click="cerrarModalTrabajo">×</button>
        </div>
        <p>Describe el trabajo realizado antes de marcar la reparación como terminada.</p>
        <label class="techsoul-modal-field">
          <span>Trabajo realizado *</span>
          <textarea v-model="trabajoTemporal" rows="5" placeholder="Ej. Se reemplazó cristal de cámara, se realizó limpieza y pruebas de funcionamiento."></textarea>
        </label>
        <div class="techsoul-modal-actions">
          <button type="button" class="modal-cancel" @click="cerrarModalTrabajo">Cancelar</button>
          <button type="button" class="modal-confirm" :disabled="!trabajoTemporal.trim() || guardando === modalTrabajo.id" @click="guardarTrabajoFinal">
            {{ guardando === modalTrabajo.id ? 'Guardando…' : '✓ Finalizar reparación' }}
          </button>
        </div>
      </section>
    </div>

    <div v-if="modalConfirmacion" class="techsoul-modal-backdrop" @click.self="responderConfirmacion(false)">
      <section class="techsoul-modal techsoul-confirm" role="dialog" aria-modal="true">
        <div class="confirm-icon">✓</div>
        <h2>{{ modalConfirmacion.titulo }}</h2>
        <p>{{ modalConfirmacion.mensaje }}</p>
        <div class="techsoul-modal-actions">
          <button type="button" class="modal-cancel" @click="responderConfirmacion(false)">Ahora no</button>
          <button type="button" class="modal-confirm" @click="responderConfirmacion(true)">{{ modalConfirmacion.confirmarTexto }}</button>
        </div>
      </section>
    </div>

  </section>
</template>

<style scoped>
.workflow-more summary{cursor:pointer;color:#64748b;font-size:.75rem;padding:8px}.workflow-more[open]{display:grid;gap:8px}.workflow-more button{width:100%;margin-top:6px}.response-modal select{width:100%;padding:12px;border:1px solid #cbd5e1;border-radius:10px}
.return-modal{z-index:1200}.return-summary{padding:12px;border-radius:10px;background:#fff7ed;color:#9a3412;white-space:pre-wrap}.return-modal select{width:100%;padding:12px;border:1px solid #cbd5e1;border-radius:10px}
.diagnostic-photo-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.diagnostic-photo-slot{display:grid;gap:9px;padding:12px;border:1px solid #dbe3ee;border-radius:14px}.diagnostic-photo-slot>strong{font-size:.85rem}.diagnostic-photo-slot img{width:100%;height:155px;object-fit:contain;border-radius:9px;background:#f1f5f9}.photo-empty{height:120px;display:grid;place-items:center;padding:12px;text-align:center;color:#64748b;border:1px dashed #cbd5e1;border-radius:9px;font-size:.8rem}.photo-camera-button{border:0;border-radius:10px;padding:12px;background:#0B43FF;color:#fff;font-weight:700;cursor:pointer}.photo-camera-button:disabled{opacity:.55;cursor:default}.photo-file-button{display:grid;gap:5px;color:#64748b;font-size:.75rem;overflow:hidden}.photo-file-button input{max-width:100%;font-size:.72rem}.camera-backdrop{position:fixed;inset:0;z-index:6000;background:rgba(15,23,42,.85);display:grid;place-items:center;padding:16px}.camera-dialog{width:min(640px,100%);max-height:95dvh;overflow:auto;background:white;border-radius:18px;padding:16px;display:grid;gap:12px;color:#101828}.camera-dialog header{display:flex;justify-content:space-between;align-items:center}.camera-dialog header button{border:0;background:#f1f5f9;border-radius:50%;width:36px;height:36px;font-size:24px}.camera-dialog video{width:100%;max-height:65dvh;object-fit:contain;background:#0B0F17;border-radius:10px}.evidence-modal{max-height:92dvh;overflow-y:auto}.evidence-modal-actions{position:sticky;bottom:-20px;background:#fff;padding-block:12px;z-index:1}@media(max-width:520px){.diagnostic-photo-grid{grid-template-columns:1fr}.diagnostic-photo-slot img{height:180px}}

.workshop-page{padding:4px 0 36px;color:#102044}.workshop-header{display:flex;align-items:flex-start;justify-content:space-between;gap:22px;margin-bottom:20px}.eyebrow{display:block;color:#34445f;font-size:.76rem;font-weight:850;letter-spacing:.06em;text-transform:uppercase;margin-bottom:4px}.workshop-header h1{font-size:clamp(1.9rem,2.6vw,2.55rem);margin:0;font-weight:900;letter-spacing:-.045em;color:#102044}.workshop-header p{margin:6px 0 0;color:#566782;font-size:.92rem}.header-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end}.day-control{display:flex;height:44px;background:#fff;border:1px solid #dce4ef;border-radius:11px;overflow:hidden}.day-control>button{width:42px;border:0;background:#fff;color:#7b8ca7;font-size:1.45rem;cursor:pointer}.day-control>button:hover{background:#f6f9fd}.day-control label{position:relative;display:flex;align-items:center;gap:8px;padding:0 14px;border-left:1px solid #edf1f6;border-right:1px solid #edf1f6;min-width:275px;text-transform:capitalize}.day-control label span{color:#0b43ff}.day-control label strong{font-size:.82rem;white-space:nowrap}.day-control input{position:absolute;inset:0;opacity:0;cursor:pointer}.calendar-action,.primary-action{height:44px;display:flex;align-items:center;border-radius:11px;padding:0 16px;text-decoration:none;font-weight:800;font-size:.82rem;white-space:nowrap}.calendar-action{border:1px solid #bdd0ff;background:#f8fbff;color:#1749b8}.primary-action{background:#0b43ff;color:#fff;border:1px solid #0b43ff}.metrics{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;margin-bottom:16px}.metrics button,.metric-link{min-width:0;display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #e1e7ef;border-radius:13px;padding:12px 14px;text-align:left;color:#42526d;cursor:pointer;text-decoration:none}.metrics button:hover,.metric-link:hover{border-color:#c2cedd}.metric-icon{flex:0 0 38px;width:38px;height:38px;display:grid;place-items:center;border-radius:50%;font-size:1.15rem;font-weight:900}.metric-icon.blue{background:#eef4ff;color:#0b43ff}.metric-icon.green{background:#eafaf6;color:#0b9a78}.metric-icon.red{background:#ffe9e7;color:#d92d20}.metric-copy{display:flex;flex-direction:column;min-width:0;font-size:.73rem;white-space:nowrap}.metric-copy strong{font-size:1.4rem;line-height:1.1;color:#102044;margin-top:2px}.urgent-metric{background:#fff8f7!important;border-color:#ffb4ad!important}.urgent-metric .metric-copy{color:#d92d20}.urgent-metric .metric-copy strong{color:#d92d20}.toolbar{display:grid;grid-template-columns:minmax(280px,1.4fr) repeat(4,minmax(150px,.55fr));gap:9px;margin-bottom:18px}.search-box{display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #dfe5ee;border-radius:11px;padding:0 13px}.search-box input{border:0;outline:0;width:100%;padding:11px 0;background:transparent;color:#243551}.toolbar>select,.refresh-btn{border:1px solid #dfe5ee;background:#fff;border-radius:11px;padding:0 11px;color:#344054;min-height:44px;font-size:.77rem}.refresh-btn{font-weight:800}.orders-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;align-items:start}.order-card{overflow:hidden;background:#fff;border:1px solid #dfe5ee;border-radius:14px;box-shadow:0 4px 12px rgba(16,32,68,.055);transition:.15s ease}.order-card:hover{transform:translateY(-1px);box-shadow:0 8px 22px rgba(16,32,68,.08)}.priority-banner{display:grid;grid-template-columns:1fr minmax(180px,.92fr);min-height:70px;border-bottom:1px solid rgba(16,32,68,.08)}.priority-copy{display:flex;align-items:center;gap:10px;padding:12px 14px}.priority-icon{width:36px;height:36px;display:grid;place-items:center;border-radius:50%;font-weight:950;font-size:1.1rem}.priority-copy>div{min-width:0;display:flex;flex-direction:column}.priority-copy select{appearance:none;border:0;background:transparent;outline:0;font-size:.92rem;font-weight:950;padding:0;color:inherit;max-width:155px}

.priority-title {
  display: block;
  font-size: 16px;
  font-weight: 900;
  letter-spacing: .01em;
}
.priority-copy small{font-size:.68rem;font-weight:700;margin-top:2px}.date-block{border:0;border-left:1px solid rgba(16,32,68,.1);background:rgba(255,255,255,.35);display:grid;grid-template-columns:28px 1fr auto;align-items:center;gap:7px;text-align:left;padding:10px 12px;cursor:pointer;color:inherit}.date-icon{font-size:1.2rem}.date-block span:nth-child(2){display:flex;flex-direction:column;min-width:0}.date-block small{font-size:.63rem}.date-block strong{font-size:.69rem;line-height:1.25;margin-top:2px}.date-block b{font-size:1.25rem}.order-card-listo{border-color:#7ad9b3}.order-card-listo .priority-banner{background:linear-gradient(90deg,#dff8ed,#effcf6);color:#087a55}.order-card-listo .priority-icon{background:#12b76a;color:#fff}.order-card-listo .date-block{color:#087a55}
.priority-card-urgente{border-color:#ff8379}.priority-card-urgente .priority-banner{background:linear-gradient(90deg,#ffd5d1,#ffe8e5);color:#bd1c12}.priority-card-urgente .priority-icon{background:#d92d20;color:#fff}.priority-card-alta{border-color:#f7bc52}.priority-card-alta .priority-banner{background:linear-gradient(90deg,#ffe8b7,#fff3d2);color:#d96b00}.priority-card-alta .priority-icon{background:#f79009;color:#fff}.priority-card-normal .priority-banner{background:#f8fafc;color:#102044}.priority-card-normal .priority-icon{background:#dce4ef;color:#34445f}.priority-card-baja .priority-banner{background:#f0faf5;color:#137a55}.priority-card-baja .priority-icon{background:#d8f2e6;color:#137a55}.date-editor{display:grid;grid-template-columns:1fr auto auto auto;gap:6px;padding:9px 12px;background:#f8fbff;border-bottom:1px solid #e0e7f0}.date-field{display:flex;flex-direction:column;gap:4px}.date-field label{font-size:.62rem;font-weight:800;color:var(--ts-muted,#64748b)}.date-editor select{border:1px solid var(--ts-border,#dbe3ee);border-radius:9px;padding:8px 9px;background:var(--ts-surface,#fff);color:var(--ts-text,#0f172a)}.date-schedule{grid-column:1/-1;color:var(--ts-muted,#64748b);font-size:.64rem;font-weight:700}.date-editor input{min-width:0;border:1px solid #cdd8e6;border-radius:8px;padding:7px 8px}.date-editor button{border:0;border-radius:8px;padding:7px 9px;font-weight:800;font-size:.68rem;cursor:pointer}.save-date{background:#0b43ff;color:white}.clear-date{background:#fff1f0;color:#b42318}.cancel-date{background:#eef2f7;color:#53627a}.card-body{padding:14px}.folio{color:#0b43ff;text-decoration:none;font-size:.72rem;font-weight:900}.equipment-link{display:block;color:#102044;text-decoration:none;margin:6px 0 3px}.equipment-link strong{font-size:1rem;line-height:1.28}.client{margin:0 0 8px;color:#50617d;font-size:.76rem}.failure{font-size:.76rem;color:#42526d;line-height:1.42;margin:0 0 14px;min-height:2.15em;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.main-controls{display:grid;grid-template-columns:1fr .72fr;gap:14px;align-items:end}.main-controls label,.worked-time,.fixed-tech{display:flex;flex-direction:column;gap:5px}.main-controls label>span,.worked-time>span,.fixed-tech>span{font-size:.65rem;font-weight:750;color:#6a7890}.main-controls select{width:100%;min-width:0;border:1px solid #d3dce8;background:#fff;border-radius:9px;padding:9px;color:#243551;font-size:.75rem}.worked-time strong{font-size:.78rem;color:#102044;padding:8px 0}.card-footer{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;border-top:1px solid #eef1f5;margin-top:12px;padding-top:11px}.fixed-tech strong{background:#edf2f8;border-radius:7px;padding:6px 9px;font-size:.72rem;color:#233653}.timer-btn{min-width:128px;border:0;border-radius:8px;padding:10px 13px;font-size:.74rem;font-weight:850;cursor:pointer}.timer-btn.start{background:#0b43ff;color:#fff}.timer-btn.pause{background:#102044;color:#fff}.timer-btn:disabled{opacity:.45}.finished-label{font-weight:850;color:#526079;background:#edf2f8;border-radius:999px;padding:7px 10px;font-size:.7rem}.empty{background:#fff;border:1px solid #e4e7ec;border-radius:14px;padding:36px;text-align:center;color:#667085}@media(max-width:1300px){.metrics{grid-template-columns:repeat(3,1fr)}.toolbar{grid-template-columns:1.4fr repeat(2,1fr)}.toolbar .search-box{grid-column:1/-1}.orders-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:900px){.workshop-header{flex-direction:column}.header-actions{width:100%;justify-content:flex-start}.day-control{flex:1}.day-control label{min-width:0;flex:1}.metrics{grid-template-columns:repeat(2,1fr)}.toolbar{grid-template-columns:1fr 1fr}.orders-grid{grid-template-columns:1fr}}@media(max-width:560px){.header-actions{display:grid;grid-template-columns:1fr 1fr}.day-control{grid-column:1/-1}.calendar-action,.primary-action{justify-content:center;padding:0 9px}.metrics{grid-template-columns:1fr 1fr}.toolbar{grid-template-columns:1fr}.toolbar>*{grid-column:1!important}.priority-banner{grid-template-columns:1fr}.date-block{border-left:0;border-top:1px solid rgba(16,32,68,.1)}.date-editor{grid-template-columns:1fr 1fr}.date-editor input{grid-column:1/-1}.main-controls{grid-template-columns:1fr}.card-footer{align-items:stretch;flex-direction:column}.timer-btn{width:100%}}
.quality-link{display:block;margin-top:10px;border:1px solid #bdd0ff;background:#f5f8ff;color:#0b43ff;border-radius:9px;padding:9px 10px;text-align:center;text-decoration:none;font-size:.72rem;font-weight:850}

.evidence-modal-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.58);display:grid;place-items:center;padding:20px;z-index:1000}.evidence-modal{width:min(620px,100%);background:#fff;border-radius:18px;padding:22px;box-shadow:0 24px 70px rgba(15,23,42,.28)}.evidence-modal-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.evidence-modal-head span{font-size:.68rem;font-weight:900;letter-spacing:.08em;color:#0b43ff}.evidence-modal-head h2{margin:4px 0 0;font-size:1.45rem}.evidence-modal-head>button{border:0;background:#eef2f7;border-radius:50%;width:34px;height:34px;font-size:1.35rem;cursor:pointer}.evidence-modal>p{color:#64748b;font-size:.82rem;line-height:1.5}.internal-photo-box{display:block;border:2px dashed #b9c8dd;border-radius:14px;overflow:hidden;background:#f8fbff;cursor:pointer;margin:16px 0}.internal-photo-box input{display:none}.internal-photo-box img{display:block;width:100%;height:260px;object-fit:cover}.internal-photo-box>div{height:190px;display:grid;place-items:center;align-content:center;gap:7px;color:#0b43ff}.internal-photo-box small{color:#64748b}.repair-description{display:flex;flex-direction:column;gap:6px}.repair-description span{font-size:.72rem;font-weight:850}.repair-description textarea{border:1px solid #d7e0eb;border-radius:10px;padding:10px;resize:vertical;font:inherit}.evidence-modal-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:16px}.evidence-modal-actions button{border-radius:10px;padding:10px 14px;font-weight:850;cursor:pointer}.cancel-evidence{background:#fff;border:1px solid #d7e0eb;color:#344054}.save-evidence{border:1px solid #0b43ff;background:#0b43ff;color:#fff}.save-evidence:disabled{opacity:.5}

.stage-box{display:flex;flex-direction:column;gap:5px}.stage-box span{font-size:.65rem;font-weight:750;color:#6a7890}.stage-box strong{border:1px solid #d7e0eb;background:#f8fbff;border-radius:9px;padding:9px 10px;color:#0b43ff;font-size:.78rem}.workflow-actions{display:grid;gap:8px;margin-top:10px}.workflow-primary,.workflow-secondary{border-radius:9px;padding:10px 12px;font-size:.74rem;font-weight:850;cursor:pointer}.workflow-primary{border:1px solid #0b43ff;background:#0b43ff;color:#fff}.workflow-secondary{border:1px solid #cbd5e1;background:#fff;color:#334155}.workflow-primary:disabled{opacity:.5}.repair-description input{border:1px solid #d7e0eb;border-radius:10px;padding:10px;font:inherit}.quality-link{display:block;margin-top:0!important}


.techsoul-toast{position:fixed;right:20px;bottom:22px;z-index:1200;display:flex;align-items:center;gap:10px;max-width:min(420px,calc(100vw - 28px));padding:13px 16px;border-radius:14px;background:#101828;color:#fff;box-shadow:0 16px 38px rgba(16,24,40,.22);font-size:.82rem;font-weight:800}.toast-icon{width:24px;height:24px;display:grid;place-items:center;flex:0 0 24px;border-radius:50%;background:#12b76a;color:#fff}.toast-error .toast-icon{background:#d92d20}.toast-techsoul-enter-active,.toast-techsoul-leave-active{transition:.2s ease}.toast-techsoul-enter-from,.toast-techsoul-leave-to{opacity:0;transform:translateY(10px)}
.techsoul-modal-backdrop{position:fixed;inset:0;z-index:1150;display:grid;place-items:center;padding:18px;background:rgba(15,23,42,.52);backdrop-filter:blur(3px)}.techsoul-modal{width:min(540px,100%);background:#fff;border:1px solid #e4e7ec;border-radius:20px;padding:22px;box-shadow:0 24px 70px rgba(16,24,40,.25);color:#102044}.techsoul-modal-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px}.techsoul-modal-head span{font-size:.68rem;font-weight:900;letter-spacing:.08em;color:#0b43ff}.techsoul-modal-head h2,.techsoul-confirm h2{margin:4px 0 0;font-size:1.35rem}.techsoul-modal-head>button{border:0;background:#eef2f7;border-radius:50%;width:34px;height:34px;font-size:1.3rem;cursor:pointer}.techsoul-modal>p{color:#667085;line-height:1.5;font-size:.84rem;margin:12px 0 16px}.techsoul-modal-field{display:flex;flex-direction:column;gap:6px}.techsoul-modal-field>span{font-size:.72rem;font-weight:850}.techsoul-modal-field textarea{width:100%;box-sizing:border-box;border:1.5px solid #d0d5dd;border-radius:12px;padding:12px;resize:vertical;font:inherit;color:#102044;outline:none}.techsoul-modal-field textarea:focus{border-color:#0b43ff;box-shadow:0 0 0 3px rgba(11,67,255,.1)}.techsoul-modal-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:18px}.techsoul-modal-actions button{min-height:42px;border-radius:10px;padding:0 15px;font-weight:850;cursor:pointer}.modal-cancel{border:1px solid #d0d5dd;background:#fff;color:#344054}.modal-confirm{border:1px solid #0b43ff;background:#0b43ff;color:#fff}.modal-confirm:disabled{opacity:.45;cursor:not-allowed}.techsoul-confirm{text-align:center;max-width:440px}.confirm-icon{width:48px;height:48px;display:grid;place-items:center;margin:0 auto 10px;border-radius:50%;background:#eafaf6;color:#0b9a78;font-size:1.4rem;font-weight:950}.techsoul-confirm .techsoul-modal-actions{justify-content:center}
@media(max-width:560px){.techsoul-toast{left:14px;right:14px;bottom:18px}.techsoul-modal-backdrop{align-items:end;padding:0}.techsoul-modal{border-radius:20px 20px 0 0;padding:20px 17px calc(18px + env(safe-area-inset-bottom))}.techsoul-modal-actions{display:grid;grid-template-columns:1fr 1fr}.techsoul-modal-actions button{width:100%}}

</style>
