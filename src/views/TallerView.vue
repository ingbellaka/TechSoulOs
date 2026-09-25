<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { supabase } from '../lib/supabase'
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
const descripcionInterna = ref('')
const guardandoEvidencia = ref(false)
const modalDiagnostico = ref(null)
const diagnosticoForm = ref({ diagnostico: '', solucion: '', costo: '' })
const guardandoDiagnostico = ref(false)

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
  { value: 'Esperando pieza', label: 'Esperando pieza' },
  { value: 'En reparación', label: 'En reparación' },
  { value: 'Reparado', label: 'Reparado' },
  { value: 'En pruebas', label: 'En pruebas' },
  { value: 'Listo', label: 'Listo' },
  { value: 'Entregado', label: 'Entregado' },
  { value: 'Garantía', label: 'Garantía' },
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
  if (['Entregado', 'Cancelado'].includes(orden.estado)) return orden.produccion?.prioridad || 'normal'

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
      if (filtroEstado.value === 'activas') return !['Entregado', 'Cancelado'].includes(o.estado)
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
  pendientes: ordenes.value.filter(o => !['Listo', 'Entregado', 'Cancelado'].includes(o.estado)).length,
  proceso: ordenes.value.filter(o => ['Diagnóstico', 'En reparación', 'Reparado', 'En pruebas', 'Esperando autorización', 'Esperando pieza'].includes(o.estado)).length,
  listas: ordenes.value.filter(o => o.estado === 'Listo').length,
  entregadosHoy: ordenes.value.filter(o => o.estado === 'Entregado' && mismoDia(o.updated_at || o.fecha_salida || o.fecha_entrega)).length,
  citasHoy: citas.value.filter(c => mismoDia(c.inicio, hoyLocal()) && !['Cancelada', 'Cancelado'].includes(c.estado)).length,
  urgentes: ordenes.value.filter(o => !['Listo', 'Entregado', 'Cancelado'].includes(o.estado) && prioridadEfectiva(o) === 'urgente').length
}))

async function cargar() {
  cargando.value = true
  const [ordenesRes, citasRes] = await Promise.all([
    supabase
      .from('ordenes')
      .select('id,folio,estado,falla_reportada,diagnostico,trabajo_realizado,costo_total,fecha_ingreso,created_at,updated_at,fecha_programada,duracion_estimada_min,clientes(nombre,telefono),equipos(tipo_equipo,marca,modelo),orden_produccion(*)')
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
  fotoInterna.value = file
  if (previewInterna.value) URL.revokeObjectURL(previewInterna.value)
  previewInterna.value = file ? URL.createObjectURL(file) : ''
}

function cerrarEvidenciaInterna() {
  if (previewInterna.value) URL.revokeObjectURL(previewInterna.value)
  modalEvidencia.value = null
  fotoInterna.value = null
  previewInterna.value = ''
  descripcionInterna.value = ''
}

async function solicitarEvidenciaInterna(orden) {
  const { data, error } = await supabase
    .from('evidencias')
    .select('id')
    .eq('orden_id', orden.id)
    .eq('tipo', 'Reparación interna')
    .limit(1)
  if (error) throw error
  if (data?.length) return true
  modalEvidencia.value = orden
  return false
}

async function guardarEvidenciaInterna() {
  const orden = modalEvidencia.value
  if (!orden) return
  if (!fotoInterna.value) return notificar('Toma o selecciona una fotografía del interior del equipo ya reparado.', 'error')
  if (!descripcionInterna.value.trim()) return notificar('Describe brevemente el trabajo realizado antes de pasar a pruebas.', 'error')
  guardandoEvidencia.value = true
  try {
    const url = await subirEvidencia(fotoInterna.value, `orden-${orden.id}/reparacion-interna`)
    const { error } = await supabase.from('evidencias').insert({
      orden_id: orden.id,
      tipo: 'Reparación interna',
      url_imagen: url,
      descripcion: descripcionInterna.value.trim()
    })
    if (error) throw error
    await supabase.from('orden_historial').insert({
      orden_id: orden.id,
      tipo: 'evidencia',
      titulo: 'Evidencia interna registrada',
      descripcion: descripcionInterna.value.trim()
    })
    cerrarEvidenciaInterna()
    await cambiarEstado(orden, 'En pruebas', true)
  } catch (error) {
    notificar(error.message, 'error')
  } finally {
    guardandoEvidencia.value = false
  }
}

function abrirDiagnostico(orden) {
  modalDiagnostico.value = orden
  diagnosticoForm.value = {
    diagnostico: orden.diagnostico || '',
    solucion: orden.trabajo_realizado || '',
    costo: Number(orden.costo_total || 0) || ''
  }
}

function cerrarDiagnostico() {
  modalDiagnostico.value = null
  diagnosticoForm.value = { diagnostico: '', solucion: '', costo: '' }
}

async function guardarDiagnosticoYAutorizar() {
  const orden = modalDiagnostico.value
  if (!orden) return
  const diagnostico = diagnosticoForm.value.diagnostico.trim()
  const solucion = diagnosticoForm.value.solucion.trim()
  const costo = Number(diagnosticoForm.value.costo || 0)
  if (!diagnostico) return notificar('Ingresa el diagnóstico técnico.', 'error')
  if (!solucion) return notificar('Ingresa la solución o reparación propuesta.', 'error')
  if (costo < 0) return notificar('Ingresa un costo válido.', 'error')
  guardandoDiagnostico.value = true
  try {
    const { error } = await supabase.from('ordenes').update({ diagnostico, trabajo_realizado: solucion, costo_total: costo }).eq('id', orden.id)
    if (error) throw error
    orden.diagnostico = diagnostico
    orden.trabajo_realizado = solucion
    orden.costo_total = costo
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
  if (orden.estado === 'Recibido') return cambiarEstado(orden, 'Diagnóstico')
  if (orden.estado === 'Diagnóstico') return abrirDiagnostico(orden)
  if (orden.estado === 'Esperando autorización') return cambiarEstado(orden, 'En reparación')
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
    'Esperando autorización': '🔧 Cliente autorizó · Reparar',
    'Esperando pieza': '🔧 Refacción recibida · Reparar',
    'En reparación': '✓ Terminar reparación',
    'Reparado': '🧪 Pasar a pruebas',
    'Listo': '📦 Marcar entregado'
  }
  return mapa[orden.estado] || ''
}

async function cambiarEstado(orden, nuevoEstado, evidenciaValidada = false) {
  if (orden.estado === nuevoEstado) return
  if (nuevoEstado === 'Esperando autorización' && !evidenciaValidada && (!orden.diagnostico || !orden.trabajo_realizado)) { abrirDiagnostico(orden); return }
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
    if (ec || ef || !controles?.length || controles.some(c => c.estado === 'No probado') || !fotos?.length) {
      notificar('Antes de marcar como Listo completa el Control de calidad y la evidencia de salida.', 'error')
      return
    }
  }
  guardando.value = orden.id

  if (['Listo', 'Entregado', 'Cancelado'].includes(nuevoEstado) && orden.produccion?.corriendo) await pausarSilencioso(orden)

  const anterior = orden.estado
  const { error } = await supabase.from('ordenes').update({ estado: nuevoEstado }).eq('id', orden.id)
  guardando.value = null
  if (error) return notificar(error.message, 'error')

  orden.estado = nuevoEstado
  orden.updated_at = new Date().toISOString()

  const etapaMap = {
    'Recibido': 'por_hacer', 'Diagnóstico': 'diagnostico', 'Esperando autorización': 'diagnostico',
    'Esperando pieza': 'reparacion', 'En reparación': 'reparacion', 'Reparado': 'reparacion', 'En pruebas': 'pruebas', 'Listo': 'listo',
    'Entregado': 'listo', 'Garantía': 'por_hacer', 'Cancelado': 'por_hacer'
  }

  const produccionCambios = { etapa: etapaMap[nuevoEstado] || 'por_hacer' }
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

          <div class="workflow-actions">
            <button v-if="etiquetaAccion(orden)" type="button" class="workflow-primary" :disabled="guardando === orden.id" @click="accionPrincipal(orden)">{{ etiquetaAccion(orden) }}</button>
            <button v-if="orden.estado === 'Esperando autorización'" type="button" class="workflow-secondary" @click="cambiarEstado(orden, 'Esperando pieza')">📦 Esperar refacción</button>
            <router-link v-if="orden.estado === 'En pruebas'" :to="`/taller/${orden.id}/control`" class="quality-link">🧪 Realizar pruebas y evidencia final</router-link>
          </div>
          <div class="card-footer">
            <div class="fixed-tech">
              <span>Técnico</span>
              <strong>♟ {{ NOMBRE_TECNICO }}</strong>
            </div>

            <button v-if="!orden.produccion?.corriendo && !['Listo','Entregado','Cancelado'].includes(orden.estado)"
              type="button" class="timer-btn start" :disabled="guardando === orden.id" @click="iniciar(orden)">▶ Iniciar</button>
            <button v-else-if="orden.produccion?.corriendo" type="button" class="timer-btn pause"
              :disabled="guardando === orden.id" @click="pausar(orden)">Ⅱ Pausar</button>
            <span v-else class="finished-label">{{ etiquetaEstado(orden.estado) }}</span>
          </div>
        </div>
      </article>
    </div>

    <div v-if="modalDiagnostico" class="evidence-modal-backdrop" @click.self="cerrarDiagnostico">
      <section class="evidence-modal">
        <div class="evidence-modal-head"><div><span>DIAGNÓSTICO TÉCNICO</span><h2>Enviar a autorización</h2></div><button type="button" @click="cerrarDiagnostico">×</button></div>
        <p>Antes de esperar la autorización del cliente, deja documentado qué se encontró y qué se propone hacer.</p>
        <label class="repair-description"><span>Diagnóstico encontrado *</span><textarea v-model="diagnosticoForm.diagnostico" rows="3" placeholder="Ej. Consumo anormal en circuito de carga; batería degradada."></textarea></label>
        <label class="repair-description"><span>Solución propuesta *</span><textarea v-model="diagnosticoForm.solucion" rows="3" placeholder="Ej. Sustituir batería y reparar circuito de carga."></textarea></label>
        <label class="repair-description"><span>Costo cotizado *</span><input v-model="diagnosticoForm.costo" type="number" min="0" step="1" placeholder="0"></label>
        <div class="evidence-modal-actions"><button type="button" class="cancel-evidence" @click="cerrarDiagnostico">Cancelar</button><button type="button" class="save-evidence" :disabled="guardandoDiagnostico" @click="guardarDiagnosticoYAutorizar">{{ guardandoDiagnostico ? 'Guardando...' : 'Guardar y esperar autorización' }}</button></div>
      </section>
    </div>

    <div v-if="modalEvidencia" class="evidence-modal-backdrop" @click.self="cerrarEvidenciaInterna">
      <section class="evidence-modal">
        <div class="evidence-modal-head">
          <div><span>EVIDENCIA DE REPARACIÓN</span><h2>Antes de pasar a pruebas</h2></div>
          <button type="button" @click="cerrarEvidenciaInterna">×</button>
        </div>
        <p>Documenta cómo quedó el interior del equipo después de la reparación. Esta evidencia quedará vinculada permanentemente a la orden <strong>{{ modalEvidencia.folio }}</strong>.</p>
        <label class="internal-photo-box">
          <img v-if="previewInterna" :src="previewInterna" alt="Evidencia interna de reparación">
          <div v-else><b>📷 Tomar foto del interior</b><small>Obligatoria para iniciar las pruebas</small></div>
          <input type="file" accept="image/*" capture="environment" @change="seleccionarFotoInterna">
        </label>
        <label class="repair-description"><span>Trabajo realizado *</span><textarea v-model="descripcionInterna" rows="3" placeholder="Ej. Reparación de circuito de carga, reemplazo de IC y limpieza de zona intervenida."></textarea></label>
        <div class="evidence-modal-actions"><button type="button" class="cancel-evidence" @click="cerrarEvidenciaInterna">Cancelar</button><button type="button" class="save-evidence" :disabled="guardandoEvidencia" @click="guardarEvidenciaInterna">{{ guardandoEvidencia ? 'Guardando...' : 'Guardar y pasar a pruebas' }}</button></div>
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
