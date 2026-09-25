<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { supabase } from '../lib/supabase'
import { subirEvidencia } from '../lib/storage'
import { useRouter } from 'vue-router'

const router = useRouter()
const clientes = ref([])
const cargando = ref(false)
const evidenciasRecepcion = ref({})
const tarifario = ref([])
const cargandoTarifario = ref(false)

const clienteExistente = ref(true)
const mostrarDatosEquipo = ref(false)
const mostrarChecklist = ref(false)
const mostrarOpcionesAvanzadas = ref(false)
const pasoActual = ref(1)

const pasos = [
  { numero: 1, titulo: 'Cliente', subtitulo: 'Datos de contacto' },
  { numero: 2, titulo: 'Equipo', subtitulo: 'Modelo y falla' },
  { numero: 3, titulo: 'Evidencia', subtitulo: 'Fotos obligatorias' },
  { numero: 4, titulo: 'Pruebas', subtitulo: 'Checklist rápido' },
  { numero: 5, titulo: 'Servicios', subtitulo: 'Trabajo y cobro' }
]

const tiposEquipo = [
  { nombre: 'Celular', icono: '📱' }, { nombre: 'Laptop', icono: '💻' },
  { nombre: 'Tablet', icono: '▣' }, { nombre: 'iPad', icono: '▤' },
  { nombre: 'Apple Watch', icono: '⌚' }, { nombre: 'Impresora', icono: '🖨️' },
  { nombre: 'PC', icono: '🖥️' }, { nombre: 'Otro', icono: '⚙️' }
]


const evidenciasPorTipo = {
  Celular: ['Frontal', 'Trasera', 'Laterales / marco', 'Cámaras'],
  Tablet: ['Frontal', 'Trasera', 'Laterales / marco', 'Cámaras'],
  iPad: ['Frontal', 'Trasera', 'Laterales / marco', 'Cámaras'],
  Laptop: ['Tapa exterior', 'Pantalla y teclado', 'Parte inferior', 'Laterales y puertos'],
  Impresora: ['Frontal', 'Trasera y conexiones', 'Bandejas / alimentación', 'Interior accesible'],
  PC: ['Frontal', 'Trasera / conexiones', 'Lateral', 'Interior / componentes visibles'],
  'Apple Watch': ['Pantalla', 'Parte trasera / sensores', 'Laterales / corona'],
  Otro: ['Vista general 1', 'Vista general 2', 'Condición física']
}
const requisitosEvidencia = computed(() => evidenciasPorTipo[equipo.value.tipo_equipo] || evidenciasPorTipo.Otro)
const evidenciaCompleta = computed(() => requisitosEvidencia.value.every(nombre => evidenciasRecepcion.value[nombre]?.file))
function manejarEvidencia(event, nombre) {
  const file = event.target.files?.[0]
  if (!file) return
  evidenciasRecepcion.value = { ...evidenciasRecepcion.value, [nombre]: { file, preview: URL.createObjectURL(file) } }
}
function quitarEvidencia(nombre) {
  const actual = evidenciasRecepcion.value[nombre]
  if (actual?.preview) URL.revokeObjectURL(actual.preview)
  const copia = { ...evidenciasRecepcion.value }; delete copia[nombre]; evidenciasRecepcion.value = copia
}

const estadosChecklist = [
  { valor: 'Funciona', corto: 'Bien', icono: '✓', clase: 'status-ok' },
  { valor: 'No funciona', corto: 'Falla', icono: '×', clase: 'status-fail' },
  { valor: 'No probado', corto: 'Pend.', icono: '–', clase: 'status-unknown' },
  { valor: 'No aplica', corto: 'N/A', icono: '○', clase: 'status-na' }
]

const cliente = ref({ cliente_id: '', nombre: '', telefono: '', whatsapp: '' })
const equipo = ref({
  tipo_equipo: 'Celular',
  marca: '',
  modelo: '',
  color: '',
  imei_serie: '',
  codigo_bloqueo: '',
  observaciones: ''
})
const orden = ref({
  falla_reportada: '',
  diagnostico: '',
  trabajo_realizado: '',
  costo_total: 0,
  anticipo: 0,
  metodo_pago: 'Efectivo',
  estado: 'Recibido',
  garantia_dias: 90,
  garantia_condiciones: 'Garantía de 90 días sobre la reparación realizada. No cubre golpes, humedad, manipulación de terceros ni daños ocasionados por el usuario.',
  tecnico: '',
  notas: '',
  fecha_programada: '',
  duracion_estimada_min: 30,
  generar_garantia: true
})


const catalogoServicios = [
  'Cambio de pantalla', 'Cambio de batería', 'Centro de carga', 'Tapa trasera',
  'Cámara', 'Cristal de cámara', 'Bocina', 'Micrófono', 'Flex', 'Face ID',
  'Touch ID', 'Reparación por humedad', 'Tarjeta lógica', 'Mantenimiento',
  'Diagnóstico', 'Software', 'Otro'
]

const crearServicioVacio = () => ({
  tipo: '',
  descripcion: '',
  precio: 0,
  estado: 'Pendiente',
  tarifa_busqueda: '',
  tarifa_abierta: false,
  tarifa_id: null
})

const servicios = ref([crearServicioVacio()])

function agregarServicio() {
  servicios.value.push(crearServicioVacio())
}


function normalizarTexto(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function nombreServicioTarifa(tarifa) {
  const categoria = normalizarTexto(tarifa?.categoria)
  const nombre = normalizarTexto(tarifa?.nombre)
  if (categoria.includes('pantalla') || nombre.includes('pantalla')) return 'Cambio de pantalla'
  if (categoria.includes('bateria') || nombre.includes('bateria')) return 'Cambio de batería'
  if (categoria.includes('tapa') || nombre.includes('cristal trasero')) return 'Tapa trasera'
  if (categoria.includes('lentes de camara') || nombre.includes('lente camara')) return 'Cristal de cámara'
  if (categoria.includes('camara') || nombre.includes('camara')) return 'Cámara'
  if (categoria.includes('otros servicios')) return tarifa.nombre || 'Otro'
  if (categoria.includes('ipad') || categoria.includes('apple watch')) return tarifa.nombre || 'Otro'
  if (categoria.includes('accesorios')) return 'Otro'
  return tarifa.nombre || 'Otro'
}

function etiquetaTarifa(tarifa) {
  return [tarifa?.modelo, tarifa?.variante].filter(Boolean).join(' · ') || tarifa?.nombre || 'Tarifa'
}

function precioTarifa(tarifa) {
  return Number(tarifa?.precio_venta || 0)
}

function resultadosTarifario(servicio) {
  const consulta = normalizarTexto(servicio?.tarifa_busqueda)
  if (!consulta || consulta.length < 2) return []
  const terminos = consulta.split(/\s+/).filter(Boolean)
  return tarifario.value
    .filter(t => {
      const texto = normalizarTexto([t.nombre, t.categoria, t.marca, t.modelo, t.variante, t.notas].filter(Boolean).join(' '))
      return terminos.every(term => texto.includes(term))
    })
    .slice(0, 10)
}

function buscarDesdeEquipo(servicio) {
  const sugerencia = [equipo.value.modelo, servicio.tipo].filter(Boolean).join(' ').trim()
  servicio.tarifa_busqueda = sugerencia || equipo.value.modelo || ''
  servicio.tarifa_abierta = true
}

function seleccionarTarifa(servicio, tarifa) {
  const tipo = nombreServicioTarifa(tarifa)
  const variante = tarifa.variante?.trim()
  const modelo = tarifa.modelo?.trim()
  servicio.tipo = catalogoServicios.includes(tipo) ? tipo : 'Otro'
  servicio.descripcion = [modelo, variante].filter(Boolean).join(' · ') || tarifa.nombre || ''
  servicio.precio = precioTarifa(tarifa)
  servicio.tarifa_id = tarifa.id
  servicio.tarifa_busqueda = etiquetaTarifa(tarifa)
  servicio.tarifa_abierta = false

  if (Number(tarifa.garantia_dias || 0) > 0) {
    orden.value.garantia_dias = Number(tarifa.garantia_dias)
  }
}

async function cargarTarifario() {
  cargandoTarifario.value = true
  try {
    const { data, error } = await supabase
      .from('catalogo_servicios')
      .select('id,nombre,categoria,marca,modelo,variante,precio_venta,garantia_dias,activo,notas')
      .eq('activo', true)
      .order('modelo', { ascending: true })
    if (error) throw error
    tarifario.value = data || []
  } catch (error) {
    console.warn('No se pudo cargar el tarifario:', error.message)
    tarifario.value = []
  } finally {
    cargandoTarifario.value = false
  }
}

function eliminarServicio(indice) {
  if (servicios.value.length === 1) {
    servicios.value[0] = crearServicioVacio()
    return
  }
  servicios.value.splice(indice, 1)
}

const subtotalServicios = computed(() => servicios.value.reduce((total, servicio) => total + Number(servicio.precio || 0), 0))
const descripcionServicios = computed(() => servicios.value
  .filter(servicio => servicio.tipo || servicio.descripcion)
  .map(servicio => servicio.descripcion?.trim() || servicio.tipo)
  .join(', '))

watch(subtotalServicios, total => {
  orden.value.costo_total = total
}, { immediate: true })

const checklist = ref([])
const itemPersonalizado = ref('')

const checksPorTipo = {
  Celular: ['Enciende', 'Pantalla táctil', 'Face ID / Touch ID', 'Cámaras', 'Bocina', 'Micrófono', 'WiFi', 'Bluetooth', 'Carga', 'Señal'],
  Laptop: ['Enciende', 'Pantalla', 'Teclado', 'Touchpad', 'Carga batería', 'WiFi', 'Bluetooth', 'Audio', 'Cámara', 'Puertos USB'],
  Tablet: ['Enciende', 'Touch', 'Cámaras', 'WiFi', 'Bluetooth', 'Carga', 'Bocinas', 'Micrófono'],
  iPad: ['Enciende', 'Touch', 'Botón home', 'Cámaras', 'WiFi', 'Bluetooth', 'Carga', 'Apple Pencil'],
  'Apple Watch': ['Enciende', 'Touch', 'Corona digital', 'Botón lateral', 'Carga', 'Bluetooth', 'Bocina', 'Micrófono'],
  Impresora: ['Enciende', 'Imprime', 'Escanea', 'WiFi', 'USB', 'Rodillos', 'Tinta / tóner', 'Atascos de papel'],
  PC: ['Enciende', 'Video', 'Disco', 'RAM', 'USB', 'Red', 'Audio'],
  Otro: ['Enciende', 'Daño visible', 'Accesorios recibidos']
}

const inicialesCliente = computed(() => (cliente.value.nombre || '?').split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase())
const iconoEquipoActual = computed(() => tiposEquipo.find(t => t.nombre === equipo.value.tipo_equipo)?.icono || '⚙️')
const checklistResumen = computed(() => {
  const fallas = checklist.value.filter(c => c.estado === 'No funciona').length
  const probados = checklist.value.filter(c => !['No probado', 'No aplica'].includes(c.estado)).length
  return fallas ? `${fallas} falla${fallas === 1 ? '' : 's'} detectada${fallas === 1 ? '' : 's'}` : `${probados} pruebas registradas`
})

const saldo = computed(() => Math.max(0, Number(orden.value.costo_total || 0) - Number(orden.value.anticipo || 0)))
const anticipoExcedeTotal = computed(() => Number(orden.value.anticipo || 0) > Number(subtotalServicios.value || 0))

function normalizarAnticipo() {
  const total = Number(subtotalServicios.value || 0)
  let valor = Number(orden.value.anticipo || 0)
  if (!Number.isFinite(valor) || valor < 0) valor = 0
  if (valor > total) valor = total
  orden.value.anticipo = valor
}

watch(subtotalServicios, total => {
  if (Number(orden.value.anticipo || 0) > Number(total || 0)) orden.value.anticipo = Number(total || 0)
})
const progreso = computed(() => {
  let completados = 0
  if ((cliente.value.cliente_id || cliente.value.nombre.trim())) completados++
  if (equipo.value.modelo.trim()) completados++
  if (orden.value.falla_reportada.trim()) completados++
  return Math.round((completados / 3) * 100)
})

function moneda(valor) {
  return Number(valor || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
}

function cargarChecklistBase() {
  checklist.value = (checksPorTipo[equipo.value.tipo_equipo] || checksPorTipo.Otro).map(item => ({
    item,
    estado: 'No probado',
    personalizado: false,
    notas: '',
    mostrarNota: false
  }))
}


function agregarCheckPersonalizado() {
  if (!itemPersonalizado.value.trim()) return
  checklist.value.push({
    item: itemPersonalizado.value,
    estado: 'No probado',
    personalizado: true,
    notas: '',
    mostrarNota: true
  })
  itemPersonalizado.value = ''
}

function cambiarTipoCliente() {
  cliente.value = { cliente_id: '', nombre: '', telefono: '', whatsapp: '' }
}

async function cargarDatos() {
  const { data: dataClientes, error } = await supabase.from('clientes').select('*').order('nombre')
  if (error) console.warn('No se pudieron cargar los clientes:', error.message)
  clientes.value = dataClientes || []
}

async function generarFolio() {
  const year = new Date().getFullYear()
  const prefijo = `TS-${year}-`

  const { data, error } = await supabase
    .from('ordenes')
    .select('folio')
    .like('folio', `${prefijo}%`)
    .order('folio', { ascending: false })
    .limit(1)

  if (error) throw error

  const ultimo = data?.[0]?.folio || ''
  const numeroActual = Number(ultimo.replace(prefijo, '')) || 0
  const consecutivo = String(numeroActual + 1).padStart(6, '0')
  return `${prefijo}${consecutivo}`
}

function seleccionarCliente() {
  const encontrado = clientes.value.find(c => c.id === Number(cliente.value.cliente_id))
  if (encontrado) {
    cliente.value.nombre = encontrado.nombre || ''
    cliente.value.telefono = encontrado.telefono || ''
    cliente.value.whatsapp = encontrado.whatsapp || ''
  }
}

function estadoClase(estado) {
  return { 'Funciona': 'state-ok', 'No funciona': 'state-fail', 'No aplica': 'state-na' }[estado] || 'state-unknown'
}

function checklistMeta(nombre) {
  const texto = String(nombre || '').toLowerCase()
  const reglas = [
    [['pantalla', 'display'], ['▣', 'Imagen, brillo y respuesta visual']],
    [['touch', 'táctil', 'tactil'], ['◉', 'Respuesta al tacto']],
    [['face id', 'touch id', 'huella'], ['◎', 'Reconocimiento biométrico']],
    [['cámara frontal', 'camara frontal'], ['◫', 'Cámara para selfies']],
    [['cámara trasera', 'camara trasera'], ['▣', 'Cámara principal']],
    [['flash'], ['✦', 'Linterna y flash LED']],
    [['auricular'], ['◖', 'Sonido de llamada']],
    [['altavoz', 'bocina'], ['◕', 'Sonido general']],
    [['micrófono', 'microfono'], ['♩', 'Grabación de audio']],
    [['batería', 'bateria'], ['▥', 'Carga y duración']],
    [['carga', 'puerto'], ['▤', 'Puerto y alimentación']],
    [['wi-fi', 'wifi'], ['⌁', 'Conexión inalámbrica']],
    [['bluetooth'], ['ᛒ', 'Conexión Bluetooth']],
    [['brillo'], ['☼', 'Sensor de brillo']],
    [['proximidad'], ['◌', 'Sensor de proximidad']],
    [['vibrador', 'vibración', 'vibracion'], ['≋', 'Respuesta háptica']],
    [['botón', 'boton'], ['◉', 'Botones físicos']]
  ]
  for (const [claves, meta] of reglas) if (claves.some(k => texto.includes(k))) return { icono: meta[0], detalle: meta[1] }
  return { icono: '✓', detalle: 'Prueba funcional del equipo' }
}

function seleccionarEstado(item, estado) {
  item.estado = estado
  if (estado === 'No funciona') item.mostrarNota = true
}

function omitirChecklist() {
  checklist.value.forEach(c => { c.estado = 'No probado'; c.notas = ''; c.mostrarNota = false })
  pasoActual.value = 5
}

function validarPaso(paso) {
  if (paso === 1 && !cliente.value.cliente_id && !cliente.value.nombre.trim()) { alert('Selecciona o captura un cliente'); return false }
  if (paso === 2 && !equipo.value.modelo.trim()) { alert('Captura el modelo del equipo'); return false }
  if (paso === 2 && !orden.value.falla_reportada.trim()) { alert('Describe la falla reportada'); return false }
  if (paso === 3 && !evidenciaCompleta.value) { alert(`Faltan fotografías obligatorias de recepción para ${equipo.value.tipo_equipo}.`); return false }
  return true
}

function pasoSiguiente() {
  if (!validarPaso(pasoActual.value)) return
  pasoActual.value = Math.min(pasos.length, pasoActual.value + 1)
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function pasoAnterior() {
  pasoActual.value = Math.max(1, pasoActual.value - 1)
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function irAPaso(numero) {
  if (numero <= pasoActual.value) pasoActual.value = numero
}

async function crearOrden() {
  if (!cliente.value.cliente_id && !cliente.value.nombre.trim()) return alert('Selecciona o captura un cliente')
  if (!equipo.value.modelo.trim()) return alert('El modelo del equipo es obligatorio')
  if (!orden.value.falla_reportada.trim()) return alert('La falla reportada es obligatoria')
  if (!evidenciaCompleta.value) return alert(`Completa las fotografías obligatorias de recepción para ${equipo.value.tipo_equipo}`)
  const serviciosValidos = servicios.value.filter(servicio => servicio.tipo && (servicio.tipo !== 'Otro' || servicio.descripcion.trim()))
  if (serviciosValidos.length === 0) return alert('Agrega al menos un servicio a realizar')
  if (Number(orden.value.anticipo || 0) > subtotalServicios.value) return alert('El anticipo no puede ser mayor al total')

  cargando.value = true

  try {
    let clienteId = cliente.value.cliente_id

    if (!clienteId) {
      const { data: nuevoCliente, error: errorCliente } = await supabase
        .from('clientes')
        .insert({ nombre: cliente.value.nombre, telefono: cliente.value.telefono, whatsapp: cliente.value.whatsapp })
        .select()
        .single()

      if (errorCliente) throw errorCliente
      clienteId = nuevoCliente.id
    }

    const { data: nuevoEquipo, error: errorEquipo } = await supabase
      .from('equipos')
      .insert({ cliente_id: clienteId, ...equipo.value })
      .select()
      .single()

    if (errorEquipo) throw errorEquipo

    const folio = await generarFolio()
    const { generar_garantia, ...ordenData } = orden.value
    ordenData.costo_total = subtotalServicios.value
    ordenData.trabajo_realizado = descripcionServicios.value

    if (ordenData.fecha_programada) ordenData.fecha_programada = new Date(ordenData.fecha_programada).toISOString()
    else ordenData.fecha_programada = null
    ordenData.duracion_estimada_min = ordenData.fecha_programada ? Number(ordenData.duracion_estimada_min || 30) : null

    // Primero crea la orden y DESPUÉS recupera su ID por folio.
    // Esto evita guardar evidencias con orden_id undefined/null en instalaciones
    // donde el INSERT no devuelve la fila completa por configuración/RLS.
    const { error: errorOrden } = await supabase
      .from('ordenes')
      .insert({ folio, cliente_id: clienteId, equipo_id: nuevoEquipo.id, ...ordenData })

    if (errorOrden) throw errorOrden

    const { data: nuevaOrden, error: errorOrdenCreada } = await supabase
      .from('ordenes')
      .select('id, folio')
      .eq('folio', folio)
      .single()

    if (errorOrdenCreada) throw errorOrdenCreada
    if (!nuevaOrden?.id) throw new Error('La orden se creó, pero no fue posible recuperar su ID. No se guardaron evidencias.')
    const ordenId = nuevaOrden.id

    const serviciosParaGuardar = servicios.value
      .filter(servicio => servicio.tipo && (servicio.tipo !== 'Otro' || servicio.descripcion.trim()))
      .map((servicio, indice) => ({
        orden_id: ordenId,
        tipo_servicio: servicio.tipo === 'Otro' ? servicio.descripcion.trim() : servicio.tipo,
        descripcion: servicio.descripcion.trim(),
        precio: Number(servicio.precio || 0),
        estado: servicio.estado || 'Pendiente',
        orden_visual: indice
      }))

    const { error: errorServicios } = await supabase.from('orden_servicios').insert(serviciosParaGuardar)
    if (errorServicios) throw errorServicios

    for (const nombre of requisitosEvidencia.value) {
      const evidencia = evidenciasRecepcion.value[nombre]
      if (!evidencia?.file) throw new Error(`Falta evidencia obligatoria: ${nombre}`)
      const urlFoto = await subirEvidencia(evidencia.file, `orden-${ordenId}/recepcion`)
      const { error: errorEvidencia } = await supabase.from('evidencias').insert({
        orden_id: ordenId,
        tipo: 'Recepción',
        url_imagen: urlFoto,
        descripcion: nombre
      })
      if (errorEvidencia) throw errorEvidencia
    }

    if (checklist.value.length > 0) {
      const { error: errorChecklist } = await supabase.from('checklist_orden').insert(
        checklist.value.map(({ mostrarNota, ...item }) => ({ orden_id: ordenId, ...item }))
      )
      if (errorChecklist) throw errorChecklist
    }

    if (orden.value.generar_garantia && Number(orden.value.garantia_dias || 0) > 0) {
      const { error: errorGarantia } = await supabase.from('garantias').insert({
        orden_id: ordenId,
        tipo_servicio: descripcionServicios.value || 'Reparación',
        dias_garantia: Number(orden.value.garantia_dias),
        fecha_inicio: new Date().toISOString(),
        condiciones: orden.value.garantia_condiciones,
        activa: true
      })
      if (errorGarantia) throw errorGarantia
    }

    const { data: auth } = await supabase.auth.getUser()
    const { error: errorHistorial } = await supabase.from('orden_historial').insert({
      orden_id: ordenId,
      tipo: 'creacion',
      titulo: 'Orden creada',
      descripcion: `Se recibió ${equipo.value.marca || ''} ${equipo.value.modelo}`.trim(),
      estado_nuevo: nuevaOrden.estado,
      usuario_id: auth.user?.id || null
    })
    if (errorHistorial) console.warn('No se pudo registrar el historial inicial:', errorHistorial.message)

    if (Number(orden.value.anticipo || 0) > 0) {
      const { error: errorCaja } = await supabase.from('movimientos_caja').insert({
        tipo: 'Entrada',
        concepto: `Anticipo orden ${folio}`,
        monto: Number(orden.value.anticipo),
        metodo_pago: orden.value.metodo_pago || 'Efectivo',
        referencia_tipo: 'orden',
        referencia_id: ordenId,
        notas: cliente.value.nombre
      })
      if (errorCaja) throw errorCaja
    }

    alert(`Orden creada: ${folio}`)
    router.push(`/ordenes/${ordenId}`)
  } catch (error) {
    alert(error.message)
  } finally {
    cargando.value = false
  }
}

onMounted(() => {
  cargarDatos()
  cargarTarifario()
  cargarChecklistBase()
})
</script>

<template>
  <div class="ts-page reception-page">
    <header class="reception-header">
      <div>
        <span class="eyebrow">Recepción rápida</span>
        <h1 class="ts-title mb-1">Nueva orden</h1>
        <p class="ts-subtitle mb-0">Registra el equipo paso a paso, sin formularios interminables.</p>
      </div>
      <div class="header-actions">
        <button class="btn btn-light" type="button" @click="router.push('/ordenes')">Cancelar</button>
        <button v-if="pasoActual === pasos.length" class="btn ts-btn-primary" type="button" :disabled="cargando" @click="crearOrden">
          {{ cargando ? 'Creando...' : 'Crear orden' }}
        </button>
      </div>
    </header>

    <nav class="stepper" aria-label="Progreso de la orden">
      <button
        v-for="paso in pasos"
        :key="paso.numero"
        type="button"
        class="stepper-item"
        :class="{ active: pasoActual === paso.numero, complete: pasoActual > paso.numero }"
        @click="irAPaso(paso.numero)"
      >
        <span class="step-dot">{{ pasoActual > paso.numero ? '✓' : paso.numero }}</span>
        <span class="step-copy"><strong>{{ paso.titulo }}</strong><small>{{ paso.subtitulo }}</small></span>
      </button>
    </nav>

    <div class="reception-layout">
      <main class="wizard-card ts-card">
        <transition name="step-fade" mode="out-in">
          <section v-if="pasoActual === 1" key="cliente" class="wizard-step">
            <div class="step-heading">
              <span class="step-kicker">Paso 1 de 5</span>
              <h2>¿Quién trae el equipo?</h2>
              <p>Selecciona un cliente registrado o captura uno nuevo.</p>
            </div>

            <div class="choice-tabs">
              <button type="button" :class="{ active: clienteExistente }" @click="clienteExistente = true; cambiarTipoCliente()">Cliente existente</button>
              <button type="button" :class="{ active: !clienteExistente }" @click="clienteExistente = false; cambiarTipoCliente()">Cliente nuevo</button>
            </div>

            <div v-if="clienteExistente" class="field-block">
              <label class="form-label">Buscar cliente</label>
              <select v-model="cliente.cliente_id" class="form-select form-select-lg" @change="seleccionarCliente">
                <option value="">Seleccionar cliente</option>
                <option v-for="c in clientes" :key="c.id" :value="c.id">{{ c.nombre }} · {{ c.telefono || 'Sin teléfono' }}</option>
              </select>
              <div v-if="cliente.cliente_id" class="selected-client">
                <div class="client-avatar">{{ inicialesCliente }}</div>
                <div><strong>{{ cliente.nombre }}</strong><span>{{ cliente.telefono || cliente.whatsapp || 'Sin teléfono' }}</span></div>
                <span class="selected-badge">Seleccionado</span>
              </div>
            </div>

            <div v-else class="form-grid two-cols">
              <div class="field-block full"><label class="form-label">Nombre completo *</label><input v-model="cliente.nombre" class="form-control form-control-lg" placeholder="Nombre del cliente"></div>
              <div class="field-block"><label class="form-label">Teléfono</label><input v-model="cliente.telefono" class="form-control" placeholder="667 000 0000"></div>
              <div class="field-block"><label class="form-label">WhatsApp</label><input v-model="cliente.whatsapp" class="form-control" placeholder="667 000 0000"></div>
            </div>
          </section>

          <section v-else-if="pasoActual === 2" key="equipo" class="wizard-step">
            <div class="step-heading">
              <span class="step-kicker">Paso 2 de 5</span>
              <h2>Equipo y problema</h2>
              <p>Captura lo necesario para identificarlo y entender qué ocurrió.</p>
            </div>

            <div class="device-type-grid">
              <button v-for="tipo in tiposEquipo" :key="tipo.nombre" type="button" :class="{ active: equipo.tipo_equipo === tipo.nombre }" @click="equipo.tipo_equipo = tipo.nombre; cargarChecklistBase()">
                <span>{{ tipo.icono }}</span><strong>{{ tipo.nombre }}</strong>
              </button>
            </div>

            <div class="form-grid three-cols mt-4">
              <div class="field-block"><label class="form-label">Marca</label><input v-model="equipo.marca" class="form-control" placeholder="Apple, Samsung..."></div>
              <div class="field-block two-span"><label class="form-label">Modelo *</label><input v-model="equipo.modelo" class="form-control" placeholder="iPhone 14 Pro"></div>
              <div class="field-block full"><label class="form-label">¿Qué le sucede? *</label><textarea v-model="orden.falla_reportada" class="form-control issue-input" rows="4" placeholder="Ej. Se mojó en alberca, comenzó a reiniciarse dos horas después y fue conectado a cargar..."></textarea></div>
            </div>

            <button type="button" class="details-toggle" @click="mostrarDatosEquipo = !mostrarDatosEquipo">
              <span><strong>Datos adicionales</strong><small>Color, IMEI, código y estado físico</small></span><b>{{ mostrarDatosEquipo ? '−' : '+' }}</b>
            </button>
            <div v-if="mostrarDatosEquipo" class="details-panel form-grid three-cols">
              <div class="field-block"><label class="form-label">Color</label><input v-model="equipo.color" class="form-control"></div>
              <div class="field-block"><label class="form-label">IMEI / Serie</label><input v-model="equipo.imei_serie" class="form-control"></div>
              <div class="field-block"><label class="form-label">Código / patrón</label><input v-model="equipo.codigo_bloqueo" class="form-control"></div>
              <div class="field-block full"><label class="form-label">Estado físico al recibir</label><input v-model="equipo.observaciones" class="form-control" placeholder="Golpes, rayones, cristal roto, piezas faltantes..."></div>
            </div>
          </section>

          <section v-else-if="pasoActual === 3" key="evidence" class="wizard-step">
            <div class="step-heading"><span class="step-kicker">REGISTRO VISUAL OBLIGATORIO</span><h2>Evidencia de recepción · {{ equipo.tipo_equipo }}</h2><p>Documenta cómo se recibe el equipo. No podrás crear la orden si falta una toma obligatoria.</p></div>
            <div class="evidence-grid">
              <article v-for="nombre in requisitosEvidencia" :key="nombre" class="evidence-slot" :class="{ complete: evidenciasRecepcion[nombre]?.file }">
                <div class="evidence-slot-head"><strong>{{ nombre }}</strong><span>{{ evidenciasRecepcion[nombre]?.file ? '✓ Capturada' : 'Obligatoria' }}</span></div>
                <label class="evidence-capture">
                  <input type="file" accept="image/*" capture="environment" @change="manejarEvidencia($event, nombre)">
                  <img v-if="evidenciasRecepcion[nombre]?.preview" :src="evidenciasRecepcion[nombre].preview" :alt="nombre">
                  <div v-else><b>📷</b><strong>Tomar foto</strong><small>o seleccionar de galería</small></div>
                </label>
                <button v-if="evidenciasRecepcion[nombre]?.file" type="button" class="remove-evidence" @click="quitarEvidencia(nombre)">Reemplazar / quitar</button>
              </article>
            </div>
            <div class="evidence-tip"><span>🛡️</span><p>Estas imágenes quedarán vinculadas a la orden como evidencia de recepción. Agrega daños o condiciones especiales en Observaciones físicas.</p></div>
          </section>

          <section v-else-if="pasoActual === 4" key="checklist" class="wizard-step checklist-step">
            <div class="step-heading checklist-heading">
              <div>
                <span class="step-kicker">Paso 4 de 5</span>
                <h2>Pruebas rápidas</h2>
                <p>Un toque por prueba. Solo se abre una nota cuando hace falta.</p>
              </div>
              <button class="btn btn-light btn-sm" type="button" @click="omitirChecklist">Omitir checklist</button>
            </div>

            <div class="legend-row">
              <span><i class="status-dot ok"></i> Funciona</span>
              <span><i class="status-dot fail"></i> No funciona</span>
              <span><i class="status-dot unknown"></i> No probado</span>
              <span><i class="status-dot na"></i> No aplica</span>
            </div>

            <div class="smart-checklist">
              <article v-for="(c, index) in checklist" :key="`${c.item}-${index}`" class="smart-check-item" :class="estadoClase(c.estado)">
                <div class="check-main">
                  <div class="check-identity">
                    <span class="check-icon">{{ checklistMeta(c.item).icono }}</span>
                    <span class="check-copy"><strong>{{ c.item }}</strong><small>{{ checklistMeta(c.item).detalle }}</small></span>
                  </div>
                  <div class="status-buttons" role="group" :aria-label="`Estado de ${c.item}`">
                    <button v-for="estado in estadosChecklist" :key="estado.valor" type="button" :class="['status-button', estado.clase, { selected: c.estado === estado.valor }]" :title="estado.valor" @click="seleccionarEstado(c, estado.valor)">
                      <span>{{ estado.icono }}</span><small>{{ estado.corto }}</small>
                    </button>
                  </div>
                  <button class="note-button" type="button" :class="{ active: c.notas || c.mostrarNota }" @click="c.mostrarNota = !c.mostrarNota" title="Agregar nota">✎</button>
                </div>
                <transition name="note-slide">
                  <div v-if="c.mostrarNota || c.estado === 'No funciona'" class="check-note">
                    <input v-model="c.notas" class="form-control" :placeholder="`¿Qué detalle presenta ${c.item.toLowerCase()}?`">
                  </div>
                </transition>
              </article>
            </div>

            <div class="custom-check-row">
              <input v-model="itemPersonalizado" class="form-control" placeholder="Agregar otra prueba, por ejemplo: cámara telefoto" @keyup.enter="agregarCheckPersonalizado">
              <button class="btn btn-outline-primary" type="button" @click="agregarCheckPersonalizado">+ Agregar</button>
            </div>
          </section>

          <section v-else key="cobro" class="wizard-step">
            <div class="step-heading">
              <span class="step-kicker">Paso 5 de 5</span>
              <h2>Servicios, garantía y cobro</h2>
              <p>Agrega uno o varios servicios. El total y el saldo se calculan automáticamente.</p>
            </div>

            <div class="services-builder">
              <article v-for="(servicio, indice) in servicios" :key="indice" class="service-row-card">
                <div class="service-row-head">
                  <strong>Servicio {{ indice + 1 }}</strong>
                  <button type="button" class="btn btn-sm btn-outline-danger" @click="eliminarServicio(indice)">Eliminar</button>
                </div>
                <div class="tariff-search-wrap">
                  <label class="form-label">Buscar en tarifario</label>
                  <div class="tariff-search-control">
                    <span class="tariff-search-icon">⌕</span>
                    <input
                      v-model="servicio.tarifa_busqueda"
                      class="form-control"
                      :placeholder="`Ej. ${equipo.modelo || 'iPhone 13 Pro Max'} pantalla incell`"
                      autocomplete="off"
                      @focus="servicio.tarifa_abierta = true"
                      @input="servicio.tarifa_abierta = true"
                      @keydown.esc="servicio.tarifa_abierta = false"
                    >
                    <button type="button" class="btn btn-light tariff-device-button" @click="buscarDesdeEquipo(servicio)">Usar equipo</button>
                  </div>
                  <div v-if="servicio.tarifa_abierta && servicio.tarifa_busqueda.length >= 2" class="tariff-results">
                    <div v-if="cargandoTarifario" class="tariff-empty">Cargando tarifario…</div>
                    <button
                      v-for="tarifa in resultadosTarifario(servicio)"
                      :key="tarifa.id"
                      type="button"
                      class="tariff-result"
                      @click="seleccionarTarifa(servicio, tarifa)"
                    >
                      <span class="tariff-result-copy">
                        <strong>{{ tarifa.modelo || tarifa.nombre }}</strong>
                        <small>{{ [tarifa.nombre, tarifa.variante].filter(Boolean).join(' · ') }}</small>
                      </span>
                      <span class="tariff-result-price" :class="{ quote: !precioTarifa(tarifa) }">{{ precioTarifa(tarifa) ? moneda(precioTarifa(tarifa)) : 'Cotizar' }}</span>
                    </button>
                    <div v-if="!cargandoTarifario && resultadosTarifario(servicio).length === 0" class="tariff-empty">No encontré coincidencias. Puedes capturar el servicio manualmente.</div>
                  </div>
                  <div v-if="servicio.tarifa_id" class="tariff-selected">✓ Precio cargado desde Tarifario. Puedes modificarlo si necesitas hacer un ajuste.</div>
                </div>

                <div class="form-grid three-cols">
                  <div class="field-block">
                    <label class="form-label">Servicio a realizar *</label>
                    <select v-model="servicio.tipo" class="form-select">
                      <option value="" disabled>Selecciona un servicio</option>
                      <option v-for="opcion in catalogoServicios" :key="opcion" :value="opcion">{{ opcion }}</option>
                    </select>
                  </div>
                  <div class="field-block">
                    <label class="form-label">Descripción</label>
                    <input v-model="servicio.descripcion" class="form-control" :placeholder="servicio.tipo === 'Otro' ? 'Describe el servicio' : 'Ej. OLED, alta capacidad, flex de proximidad'">
                  </div>
                  <div class="field-block">
                    <label class="form-label">Precio</label>
                    <input v-model.number="servicio.precio" type="number" min="0" class="form-control" placeholder="0">
                  </div>
                  <div class="field-block">
                    <label class="form-label">Estado</label>
                    <select v-model="servicio.estado" class="form-select"><option>Pendiente</option><option>En proceso</option><option>Terminado</option><option>Entregado</option></select>
                  </div>
                </div>
              </article>
              <button type="button" class="btn btn-outline-primary add-service-button" @click="agregarServicio">+ Agregar otro servicio</button>
            </div>

            <div class="payment-summary mt-4">
              <div class="payment-card total-card">
                <span class="payment-card-label">Total de servicios</span>
                <strong>{{ moneda(subtotalServicios) }}</strong>
                <small>{{ servicios.length }} servicio{{ servicios.length === 1 ? '' : 's' }} agregado{{ servicios.length === 1 ? '' : 's' }}</small>
              </div>

              <label class="payment-card advance-card" :class="{ disabled: subtotalServicios <= 0 }">
                <span class="payment-card-label">Anticipo recibido</span>
                <div class="advance-input">
                  <span>$</span>
                  <input v-model.number="orden.anticipo" type="number" min="0" :max="subtotalServicios" :disabled="subtotalServicios <= 0" placeholder="0" @blur="normalizarAnticipo">
                </div>
                <small v-if="subtotalServicios <= 0">Agrega un servicio con precio para registrar un anticipo.</small>
                <small v-else>Máximo {{ moneda(subtotalServicios) }}</small>
              </label>

              <div v-if="Number(orden.anticipo || 0) > 0" class="payment-method-block">
                <span class="payment-card-label">Método del anticipo</span>
                <div class="payment-method-options">
                  <button v-for="metodo in ['Efectivo','Transferencia','Tarjeta']" :key="metodo" type="button" :class="{ active: orden.metodo_pago === metodo }" @click="orden.metodo_pago = metodo">
                    <span class="method-icon">{{ metodo === 'Efectivo' ? '💵' : metodo === 'Transferencia' ? '🏦' : '💳' }}</span>
                    <span>{{ metodo }}</span>
                  </button>
                </div>
              </div>

              <div class="balance-card" :class="{ covered: subtotalServicios > 0 && saldo === 0 }">
                <span>Saldo pendiente</span>
                <strong>{{ moneda(saldo) }}</strong>
                <small v-if="subtotalServicios <= 0">Sin servicios cobrables todavía</small>
                <small v-else>{{ saldo > 0 ? 'Pendiente por cobrar' : 'Orden cubierta' }}</small>
              </div>
            </div>

            <div class="schedule-card mt-4">
              <div class="schedule-copy">
                <span class="step-kicker">Agenda</span>
                <strong>Programar reparación</strong>
                <small>Opcional. Si defines fecha y hora, esta orden aparecerá automáticamente en Agenda.</small>
              </div>
              <div class="schedule-fields">
                <label class="field-block"><span class="form-label">Fecha y hora</span><input v-model="orden.fecha_programada" type="datetime-local" class="form-control"></label>
                <label class="field-block"><span class="form-label">Duración estimada</span><select v-model.number="orden.duracion_estimada_min" class="form-select"><option :value="15">15 min</option><option :value="30">30 min</option><option :value="45">45 min</option><option :value="60">1 hora</option><option :value="90">1 h 30 min</option><option :value="120">2 horas</option><option :value="240">4 horas</option><option :value="480">1 día</option></select></label>
              </div>
            </div>

            <button type="button" class="details-toggle mt-4" @click="mostrarOpcionesAvanzadas = !mostrarOpcionesAvanzadas">
              <span><strong>Garantía y notas internas</strong><small>90 días por defecto; puedes cambiarlo cuando sea necesario</small></span><b>{{ mostrarOpcionesAvanzadas ? '−' : '+' }}</b>
            </button>
            <div v-if="mostrarOpcionesAvanzadas" class="details-panel form-grid three-cols">
              <div class="field-block"><label class="form-label">Generar garantía</label><select v-model="orden.generar_garantia" class="form-select"><option :value="true">Sí, generar garantía</option><option :value="false">Sin garantía</option></select></div>
              <div class="field-block"><label class="form-label">Garantía (días)</label><input v-model.number="orden.garantia_dias" type="number" min="0" class="form-control" :disabled="!orden.generar_garantia"></div>
              <div class="field-block"><label class="form-label">Técnico / recepción</label><input v-model="orden.tecnico" class="form-control"></div>
              <div class="field-block"><label class="form-label">Estado inicial</label><select v-model="orden.estado" class="form-select"><option>Recibido</option><option>Diagnóstico</option><option>Esperando autorización</option><option>Esperando pieza</option><option>En reparación</option><option>Listo</option><option>Entregado</option><option>Garantía</option><option>Cancelado</option></select></div>
              <div class="field-block two-span"><label class="form-label">Condiciones de garantía</label><textarea v-model="orden.garantia_condiciones" class="form-control" rows="3" :disabled="!orden.generar_garantia"></textarea></div>
              <div class="field-block full"><label class="form-label">Notas internas</label><textarea v-model="orden.notas" class="form-control" rows="2"></textarea></div>
            </div>

            <div class="final-review">
              <div><span>Cliente</span><strong>{{ cliente.nombre || 'Pendiente' }}</strong></div>
              <div><span>Equipo</span><strong>{{ [equipo.marca, equipo.modelo].filter(Boolean).join(' ') || 'Pendiente' }}</strong></div>
              <div><span>Falla</span><strong>{{ orden.falla_reportada || 'Pendiente' }}</strong></div>
              <div><span>Checklist</span><strong>{{ checklistResumen }}</strong></div>
              <div class="two-span"><span>Servicios</span><strong>{{ descripcionServicios || 'Pendiente' }}</strong></div>
            </div>
          </section>
        </transition>

        <footer class="wizard-footer">
          <button class="btn btn-light" type="button" :disabled="pasoActual === 1" @click="pasoAnterior">← Anterior</button>
          <span class="mobile-step-count">{{ pasoActual }} / {{ pasos.length }}</span>
          <button v-if="pasoActual < pasos.length" class="btn ts-btn-primary" type="button" @click="pasoSiguiente">Continuar →</button>
          <button v-else class="btn ts-btn-primary" type="button" :disabled="cargando" @click="crearOrden">{{ cargando ? 'Creando orden...' : 'Crear orden' }}</button>
        </footer>
      </main>

      <aside class="live-summary ts-card">
        <div class="summary-top"><span class="eyebrow">Resumen en vivo</span><span class="completion-pill">{{ progreso }}%</span></div>
        <div class="device-summary-icon">{{ iconoEquipoActual }}</div>
        <h3>{{ equipo.modelo || 'Nuevo equipo' }}</h3>
        <p>{{ cliente.nombre || 'Cliente por seleccionar' }}</p>
        <div class="summary-list">
          <div><span>Tipo</span><strong>{{ equipo.tipo_equipo }}</strong></div>
          <div><span>Total</span><strong>{{ moneda(orden.costo_total) }}</strong></div>
          <div><span>Anticipo</span><strong>{{ moneda(orden.anticipo) }}</strong></div>
          <div class="summary-balance"><span>Saldo</span><strong>{{ moneda(saldo) }}</strong></div>
        </div>
        <div class="progress-checks">
          <div :class="{ done: cliente.cliente_id || cliente.nombre.trim() }"><span>✓</span> Cliente</div>
          <div :class="{ done: equipo.modelo.trim() }"><span>✓</span> Equipo</div>
          <div :class="{ done: orden.falla_reportada.trim() }"><span>✓</span> Falla</div>
          <div :class="{ done: evidenciaCompleta }"><span>✓</span> Evidencia {{ Object.keys(evidenciasRecepcion).length }}/{{ requisitosEvidencia.length }}</div>
        </div>
        <div v-if="orden.falla_reportada" class="summary-issue"><span>Falla reportada</span><p>{{ orden.falla_reportada }}</p></div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.reception-page{max-width:1420px;margin:0 auto;padding-bottom:40px}.reception-header{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;margin-bottom:22px}.header-actions{display:flex;gap:10px}.eyebrow,.step-kicker{display:block;color:var(--ts-primary,#2563eb);font-size:.72rem;font-weight:850;letter-spacing:.09em;text-transform:uppercase;margin-bottom:6px}.stepper{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:22px}.stepper-item{border:0;background:transparent;display:flex;align-items:center;gap:9px;text-align:left;padding:8px;border-radius:13px;color:var(--ts-muted,#64748b)}.stepper-item:hover{background:var(--ts-soft,#f8fafc)}.step-dot{width:30px;height:30px;flex:0 0 30px;display:grid;place-items:center;border:1px solid var(--ts-border,#dbe3ee);border-radius:10px;background:var(--ts-surface,#fff);font-size:.78rem;font-weight:850}.stepper-item.active{color:var(--ts-text,#0f172a);background:rgba(37,99,235,.06)}.stepper-item.active .step-dot{background:#2563eb;border-color:#2563eb;color:#fff;box-shadow:0 6px 15px rgba(37,99,235,.25)}.stepper-item.complete .step-dot{background:#dcfce7;border-color:#bbf7d0;color:#15803d}.step-copy{display:flex;flex-direction:column;min-width:0}.step-copy strong{font-size:.78rem;white-space:nowrap}.step-copy small{font-size:.66rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.reception-layout{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:22px;align-items:start}.wizard-card{overflow:hidden}.wizard-step{min-height:500px;padding:32px}.step-heading{margin-bottom:26px}.step-heading h2{font-size:1.45rem;font-weight:850;margin:0 0 6px}.step-heading p{color:var(--ts-muted,#64748b);margin:0}.choice-tabs{display:inline-flex;padding:4px;background:var(--ts-soft,#f1f5f9);border-radius:13px;margin-bottom:24px}.choice-tabs button{border:0;background:transparent;color:var(--ts-muted,#64748b);padding:10px 16px;border-radius:10px;font-weight:750;font-size:.86rem}.choice-tabs button.active{background:var(--ts-surface,#fff);color:var(--ts-text,#0f172a);box-shadow:0 2px 8px rgba(15,23,42,.08)}.field-block{display:flex;flex-direction:column}.form-grid{display:grid;gap:16px}.two-cols{grid-template-columns:repeat(2,minmax(0,1fr))}.three-cols{grid-template-columns:repeat(3,minmax(0,1fr))}.full{grid-column:1/-1}.two-span{grid-column:span 2}.form-label{font-size:.78rem;font-weight:750;color:var(--ts-muted,#475569);margin-bottom:7px}.form-control,.form-select{border-radius:11px;min-height:44px}.selected-client{margin-top:14px;display:flex;align-items:center;gap:12px;padding:14px;border:1px solid #bfdbfe;background:#eff6ff;border-radius:14px}.client-avatar{width:40px;height:40px;display:grid;place-items:center;border-radius:12px;background:#2563eb;color:#fff;font-weight:850}.selected-client div:nth-child(2){display:flex;flex-direction:column;flex:1}.selected-client span{font-size:.8rem;color:#64748b}.selected-badge{padding:5px 9px;border-radius:999px;background:#dbeafe;color:#1d4ed8!important;font-weight:750}.device-type-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.device-type-grid button{border:1px solid var(--ts-border,#dbe3ee);background:var(--ts-surface,#fff);border-radius:14px;padding:15px 10px;display:flex;align-items:center;justify-content:center;gap:8px;color:var(--ts-muted,#64748b)}.device-type-grid button span{font-size:1.2rem}.device-type-grid button strong{font-size:.82rem}.device-type-grid button.active{border-color:#2563eb;background:#eff6ff;color:#1d4ed8;box-shadow:0 0 0 2px rgba(37,99,235,.08)}.issue-input{min-height:105px}.details-toggle{width:100%;border:1px dashed var(--ts-border,#cbd5e1);background:transparent;border-radius:14px;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;text-align:left;margin-top:18px}.details-toggle span{display:flex;flex-direction:column}.details-toggle strong{font-size:.86rem}.details-toggle small{color:var(--ts-muted,#64748b);margin-top:2px}.details-toggle b{font-size:1.2rem;color:#2563eb}.details-panel{margin-top:12px;padding:18px;background:var(--ts-soft,#f8fafc);border:1px solid var(--ts-border,#e2e8f0);border-radius:14px}.camera-card{position:relative;min-height:330px;border:2px dashed var(--ts-border,#cbd5e1);background:var(--ts-soft,#f8fafc);border-radius:20px;display:grid;place-items:center;overflow:hidden;cursor:pointer}.camera-card input{display:none}.camera-card img{width:100%;height:100%;max-height:440px;object-fit:contain;background:#0f172a}.camera-empty{text-align:center;display:flex;flex-direction:column;align-items:center}.camera-icon{font-size:2.5rem;margin-bottom:12px}.camera-empty strong{font-size:1rem}.camera-empty small{color:var(--ts-muted,#64748b);margin-top:5px}.replace-photo{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);padding:8px 13px;border-radius:999px;background:rgba(15,23,42,.78);color:#fff;font-size:.78rem;font-weight:750}.evidence-tip{display:flex;gap:10px;margin-top:14px;padding:12px 14px;border-radius:13px;background:#fffbeb;color:#92400e;font-size:.82rem}.evidence-tip p{margin:0}.checklist-heading{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}.legend-row{display:flex;flex-wrap:wrap;gap:14px;margin-bottom:16px;color:var(--ts-muted,#64748b);font-size:.74rem}.legend-row span{display:flex;align-items:center;gap:5px}.status-dot{width:9px;height:9px;border-radius:50%;display:inline-block}.status-dot.ok{background:#22c55e}.status-dot.fail{background:#ef4444}.status-dot.unknown{background:#f59e0b}.status-dot.na{background:#94a3b8}.smart-checklist{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.smart-check-item{border:1px solid var(--ts-border,#e2e8f0);border-radius:16px;background:var(--ts-surface,#fff);overflow:hidden;transition:.15s;box-shadow:0 1px 2px rgba(15,23,42,.04)}.smart-check-item:hover{border-color:#bfdbfe;box-shadow:0 8px 22px rgba(15,23,42,.07)}.smart-check-item.state-ok{border-color:#86efac;background:linear-gradient(90deg,rgba(34,197,94,.06),var(--ts-surface,#fff) 30%)}.smart-check-item.state-fail{border-color:#fca5a5;background:linear-gradient(90deg,rgba(239,68,68,.06),var(--ts-surface,#fff) 30%)}.smart-check-item.state-na{opacity:.78}.check-main{display:grid;grid-template-columns:minmax(190px,1fr) auto 38px;gap:12px;align-items:center;padding:13px 14px}.check-identity{display:flex;align-items:center;gap:11px;min-width:0}.check-icon{width:40px;height:40px;flex:0 0 40px;display:grid;place-items:center;border-radius:12px;background:#eff6ff;color:#1d4ed8;font-size:1.1rem;font-weight:900}.check-copy{display:flex;flex-direction:column;min-width:0}.check-copy strong{font-size:.86rem;color:var(--ts-text,#0f172a);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.check-copy small{margin-top:3px;color:var(--ts-muted,#64748b);font-size:.68rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.status-buttons{display:flex;gap:6px}.status-button{width:42px;height:38px;border:1px solid var(--ts-border,#dbe3ee);background:var(--ts-soft,#f8fafc);border-radius:10px;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1}.status-button span{font-size:.8rem;font-weight:900}.status-button small{font-size:.52rem;margin-top:3px}.status-button.selected.status-ok{background:#dcfce7;border-color:#86efac;color:#15803d}.status-button.selected.status-fail{background:#fee2e2;border-color:#fca5a5;color:#b91c1c}.status-button.selected.status-unknown{background:#fef3c7;border-color:#fcd34d;color:#a16207}.status-button.selected.status-na{background:#e2e8f0;border-color:#cbd5e1;color:#475569}.note-button{width:34px;height:34px;border:0;border-radius:9px;background:var(--ts-soft,#f1f5f9);color:#64748b}.note-button.active{background:#dbeafe;color:#2563eb}.check-note{padding:0 12px 12px}.check-note .form-control{min-height:38px;font-size:.8rem}.custom-check-row{display:flex;gap:8px;margin-top:14px}.services-builder{display:grid;gap:14px}.tariff-search-wrap{position:relative;margin-bottom:16px}.tariff-search-control{display:flex;align-items:center;gap:8px;position:relative}.tariff-search-control .form-control{padding-left:38px;min-height:44px}.tariff-search-icon{position:absolute;left:13px;z-index:2;color:#64748b;font-size:1.1rem}.tariff-device-button{white-space:nowrap;min-height:44px}.tariff-results{position:absolute;z-index:30;top:76px;left:0;right:0;max-height:340px;overflow:auto;background:var(--ts-surface,#fff);border:1px solid var(--ts-border,#dbe3ee);border-radius:14px;box-shadow:0 18px 42px rgba(15,23,42,.16);padding:6px}.tariff-result{width:100%;border:0;background:transparent;border-radius:10px;padding:11px 12px;display:flex;align-items:center;justify-content:space-between;gap:14px;text-align:left}.tariff-result:hover{background:#eff6ff}.tariff-result-copy{display:flex;flex-direction:column;min-width:0}.tariff-result-copy strong{font-size:.84rem;color:var(--ts-text,#0f172a)}.tariff-result-copy small{margin-top:3px;color:var(--ts-muted,#64748b);font-size:.72rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tariff-result-price{font-size:.88rem;font-weight:850;color:#1d4ed8;white-space:nowrap}.tariff-result-price.quote{color:#a16207}.tariff-empty{padding:14px;color:var(--ts-muted,#64748b);font-size:.78rem;text-align:center}.tariff-selected{margin-top:7px;color:#15803d;font-size:.72rem;font-weight:700}.service-row-card{border:1px solid var(--ts-border,#dbe3ee);border-radius:16px;padding:17px;background:var(--ts-surface,#fff);box-shadow:0 2px 10px rgba(15,23,42,.04)}.service-row-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}.service-row-head strong{font-size:.9rem}.add-service-button{justify-self:start}.money-field input[readonly]{cursor:default}
.payment-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;align-items:stretch}.payment-card,.payment-method-block,.balance-card{border:1px solid var(--ts-border,#dbe3ee);border-radius:18px;padding:18px;background:var(--ts-surface,#fff);box-shadow:0 4px 14px rgba(15,23,42,.035)}.payment-card-label,.payment-method-block>.payment-card-label,.balance-card>span{display:block;color:var(--ts-muted,#64748b);font-size:.74rem;font-weight:800;letter-spacing:.01em;margin-bottom:9px}.payment-card strong{display:block;font-size:1.55rem;line-height:1.1;color:var(--ts-text,#0f172a)}.payment-card small{display:block;margin-top:7px;color:var(--ts-muted,#64748b);font-size:.72rem}.total-card{background:linear-gradient(180deg,#fff,#f8fbff)}.advance-card{cursor:text}.advance-card.disabled{background:var(--ts-soft,#f8fafc);opacity:.75;cursor:not-allowed}.advance-input{display:flex;align-items:center;gap:7px}.advance-input>span{font-size:1.35rem;font-weight:850;color:var(--ts-text,#0f172a)}.advance-input input{width:100%;min-width:0;border:0;outline:0;background:transparent;font-size:1.55rem;font-weight:850;color:var(--ts-text,#0f172a);padding:0}.payment-method-block{grid-column:1/-1}.payment-method-options{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.payment-method-options button{min-height:46px;border:1px solid var(--ts-border,#dbe3ee);border-radius:12px;background:var(--ts-soft,#f8fafc);color:var(--ts-text,#0f172a);font-size:.78rem;font-weight:800;display:flex;align-items:center;justify-content:center;gap:7px;transition:.15s ease}.payment-method-options button:hover{border-color:#93c5fd;background:#eff6ff}.payment-method-options button.active{border-color:#2563eb;background:#eff6ff;color:#1d4ed8;box-shadow:0 0 0 2px rgba(37,99,235,.08)}.method-icon{font-size:1rem}.balance-card{background:linear-gradient(135deg,#1d4ed8,#2563eb);color:#fff;border:0;display:flex;flex-direction:column;justify-content:center}.balance-card.covered{background:linear-gradient(135deg,#15803d,#16a34a)}.balance-card>span,.balance-card small{color:rgba(255,255,255,.78)}.balance-card strong{display:block;font-size:1.65rem;line-height:1.1}.balance-card small{margin-top:7px;font-size:.72rem}.final-review{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:20px}.final-review div{padding:13px;border-radius:12px;background:var(--ts-soft,#f8fafc)}.final-review span{display:block;color:var(--ts-muted,#64748b);font-size:.7rem;margin-bottom:3px}.final-review strong{display:block;font-size:.82rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.wizard-footer{min-height:72px;padding:14px 24px;border-top:1px solid var(--ts-border,#e2e8f0);display:flex;align-items:center;justify-content:space-between;background:var(--ts-surface,#fff)}.mobile-step-count{font-size:.75rem;color:var(--ts-muted,#64748b)}.live-summary{position:sticky;top:88px;padding:22px;text-align:center}.summary-top{display:flex;justify-content:space-between;align-items:center}.completion-pill{padding:5px 9px;border-radius:999px;background:#dbeafe;color:#1d4ed8;font-size:.72rem;font-weight:850}.device-summary-icon{width:62px;height:62px;display:grid;place-items:center;margin:14px auto 10px;border-radius:20px;background:var(--ts-soft,#f1f5f9);font-size:1.8rem}.live-summary h3{font-size:1.1rem;font-weight:850;margin:0 0 3px}.live-summary>p{color:var(--ts-muted,#64748b);font-size:.84rem}.summary-list{margin-top:18px;text-align:left}.summary-list div{display:flex;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid var(--ts-border,#e2e8f0);font-size:.82rem}.summary-list span{color:var(--ts-muted,#64748b)}.summary-balance strong{color:#2563eb;font-size:1rem}.progress-checks{display:grid;grid-template-columns:repeat(2,1fr);gap:7px;margin-top:16px;text-align:left}.progress-checks div{font-size:.72rem;color:#94a3b8}.progress-checks span{display:inline-grid;place-items:center;width:18px;height:18px;border-radius:50%;background:#e2e8f0;margin-right:4px;font-size:.6rem}.progress-checks div.done{color:var(--ts-text,#0f172a);font-weight:750}.progress-checks div.done span{background:#dcfce7;color:#15803d}.summary-issue{text-align:left;margin-top:17px;padding:12px;background:var(--ts-soft,#f8fafc);border-radius:12px}.summary-issue span{font-size:.68rem;color:var(--ts-muted,#64748b)}.summary-issue p{font-size:.76rem;margin:4px 0 0;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}.step-fade-enter-active,.step-fade-leave-active{transition:.16s ease}.step-fade-enter-from{opacity:0;transform:translateX(12px)}.step-fade-leave-to{opacity:0;transform:translateX(-8px)}.note-slide-enter-active,.note-slide-leave-active{transition:.15s ease}.note-slide-enter-from,.note-slide-leave-to{opacity:0;transform:translateY(-4px)}
@media(max-width:1180px){.reception-layout{grid-template-columns:1fr}.live-summary{position:static;order:-1;text-align:left}.live-summary .device-summary-icon,.live-summary h3,.live-summary>p{display:none}.summary-list{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:8px}.summary-list div{border:0;padding:8px;background:var(--ts-soft,#f8fafc);border-radius:10px;flex-direction:column}.progress-checks,.summary-issue{display:none}}
@media(max-width:900px){.stepper{grid-template-columns:repeat(5,44px);justify-content:center}.step-copy{display:none}.smart-checklist{grid-template-columns:1fr}.device-type-grid{grid-template-columns:repeat(2,1fr)}}
@media(max-width:1120px){.smart-checklist{grid-template-columns:1fr}}
@media(max-width:680px){.reception-header{align-items:flex-start}.header-actions .btn-light{display:none}.wizard-step{padding:22px 17px;min-height:520px}.stepper{overflow-x:auto;justify-content:start;padding-bottom:3px}.two-cols,.three-cols,.money-grid,.final-review{grid-template-columns:1fr}.two-span{grid-column:auto}.summary-list{grid-template-columns:repeat(2,1fr)}.check-main{grid-template-columns:1fr 38px}.check-identity{grid-column:1/2}.status-buttons{grid-column:1/-1;grid-row:2;justify-content:space-between}.status-button{flex:1}.note-button{grid-column:2;grid-row:1}.custom-check-row{flex-direction:column}.wizard-footer{padding:12px 16px}.checklist-heading{flex-direction:column}.camera-card{min-height:260px}}

.schedule-card{border:1px solid var(--ts-border,#dbe3ee);border-radius:16px;padding:18px;background:var(--ts-soft,#f8fafc);display:grid;grid-template-columns:minmax(220px,1fr) minmax(320px,1.2fr);gap:18px;align-items:end}.schedule-copy{display:flex;flex-direction:column}.schedule-copy strong{font-size:.95rem;margin:3px 0 4px}.schedule-copy small{color:var(--ts-muted,#64748b);font-size:.76rem;line-height:1.4}.schedule-fields{display:grid;grid-template-columns:1.3fr 1fr;gap:12px}@media(max-width:760px){.schedule-card,.schedule-fields{grid-template-columns:1fr}.payment-summary{grid-template-columns:1fr}.payment-method-block{grid-column:auto}.payment-method-options{grid-template-columns:1fr}}
.evidence-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.evidence-slot{border:1px solid var(--ts-border,#dbe3ee);border-radius:16px;padding:12px;background:#fff}.evidence-slot.complete{border-color:#86efac;background:#f8fff9}.evidence-slot-head{display:flex;justify-content:space-between;gap:10px;margin-bottom:9px}.evidence-slot-head strong{font-size:.84rem}.evidence-slot-head span{font-size:.68rem;font-weight:800;color:#b45309}.evidence-slot.complete .evidence-slot-head span{color:#15803d}.evidence-capture{display:block;min-height:150px;border:1.5px dashed #cbd5e1;border-radius:12px;overflow:hidden;cursor:pointer;background:#f8fafc}.evidence-capture input{display:none}.evidence-capture img{width:100%;height:180px;object-fit:cover}.evidence-capture>div{height:150px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#64748b}.evidence-capture b{font-size:1.8rem}.evidence-capture strong{color:#334155;margin-top:5px}.evidence-capture small{margin-top:3px}.remove-evidence{margin-top:8px;border:0;background:transparent;color:#2563eb;font-size:.72rem;font-weight:800}@media(max-width:700px){.evidence-grid{grid-template-columns:1fr}}
</style>
