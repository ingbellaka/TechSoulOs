<script setup>
import { ref, onMounted, computed } from 'vue'
import { supabase } from '../lib/supabase'
import { subirEvidencia } from '../lib/storage'
import { useRouter } from 'vue-router'

const router = useRouter()
const clientes = ref([])
const configuracionGarantias = ref([])
const cargando = ref(false)
const fotoArchivo = ref(null)
const fotoPreview = ref('')
const fotoNombre = ref('')

const clienteExistente = ref(true)
const mostrarDatosEquipo = ref(false)
const mostrarChecklist = ref(false)
const mostrarOpcionesAvanzadas = ref(false)
const pasoActual = ref(1)

const pasos = [
  { numero: 1, titulo: 'Cliente', subtitulo: 'Datos de contacto' },
  { numero: 2, titulo: 'Equipo', subtitulo: 'Modelo y falla' },
  { numero: 3, titulo: 'Evidencia', subtitulo: 'Fotografía opcional' },
  { numero: 4, titulo: 'Pruebas', subtitulo: 'Checklist rápido' },
  { numero: 5, titulo: 'Cobro', subtitulo: 'Cotización' }
]

const tiposEquipo = [
  { nombre: 'Celular', icono: '📱' }, { nombre: 'Laptop', icono: '💻' },
  { nombre: 'Tablet', icono: '▣' }, { nombre: 'iPad', icono: '▤' },
  { nombre: 'Apple Watch', icono: '⌚' }, { nombre: 'Impresora', icono: '🖨️' },
  { nombre: 'PC', icono: '🖥️' }, { nombre: 'Otro', icono: '⚙️' }
]

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
  estado: 'Recibido',
  garantia_dias: 90,
  garantia_condiciones: 'No cubre golpes, humedad ni mal uso.',
  tecnico: '',
  notas: '',
  tipo_servicio: 'Pantalla'
})

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

const saldo = computed(() => Number(orden.value.costo_total || 0) - Number(orden.value.anticipo || 0))
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

function aplicarGarantia() {
  const seleccion = configuracionGarantias.value.find(g => g.tipo_servicio === orden.value.tipo_servicio)
  if (seleccion) {
    orden.value.garantia_dias = seleccion.dias_garantia
    orden.value.garantia_condiciones = seleccion.condiciones
  }
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
  const [{ data: dataClientes }, { data: dataGarantias }] = await Promise.all([
    supabase.from('clientes').select('*').order('nombre'),
    supabase.from('configuracion_garantias').select('*').eq('activo', true).order('tipo_servicio')
  ])

  clientes.value = dataClientes || []
  configuracionGarantias.value = dataGarantias || []

  if (configuracionGarantias.value.length > 0) {
    orden.value.tipo_servicio = configuracionGarantias.value[0].tipo_servicio
    aplicarGarantia()
  }
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

function manejarFoto(event) {
  const file = event.target.files[0]
  if (!file) {
    fotoArchivo.value = null
    fotoPreview.value = ''
    fotoNombre.value = ''
    return
  }

  fotoArchivo.value = file
  fotoNombre.value = file.name

  const reader = new FileReader()
  reader.onload = () => {
    fotoPreview.value = reader.result
  }
  reader.readAsDataURL(file)
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
    const { tipo_servicio, ...ordenData } = orden.value

    const { data: nuevaOrden, error: errorOrden } = await supabase
      .from('ordenes')
      .insert({ folio, cliente_id: clienteId, equipo_id: nuevoEquipo.id, ...ordenData })
      .select()
      .single()

    if (errorOrden) throw errorOrden

    if (fotoArchivo.value) {
      const urlFoto = await subirEvidencia(fotoArchivo.value, `orden-${nuevaOrden.id}`)
      const { error: errorEvidencia } = await supabase.from('evidencias').insert({
        orden_id: nuevaOrden.id,
        tipo: 'Recepción',
        url_imagen: urlFoto,
        descripcion: fotoNombre.value || 'Foto de recepción'
      })
      if (errorEvidencia) throw errorEvidencia
    }

    if (checklist.value.length > 0) {
      const { error: errorChecklist } = await supabase.from('checklist_orden').insert(
        checklist.value.map(({ mostrarNota, ...item }) => ({ orden_id: nuevaOrden.id, ...item }))
      )
      if (errorChecklist) throw errorChecklist
    }

    if (Number(orden.value.garantia_dias || 0) > 0) {
      const { error: errorGarantia } = await supabase.from('garantias').insert({
        orden_id: nuevaOrden.id,
        tipo_servicio: orden.value.tipo_servicio,
        dias_garantia: Number(orden.value.garantia_dias),
        fecha_inicio: new Date().toISOString(),
        condiciones: orden.value.garantia_condiciones,
        activa: true
      })
      if (errorGarantia) throw errorGarantia
    }

    const { data: auth } = await supabase.auth.getUser()
    const { error: errorHistorial } = await supabase.from('orden_historial').insert({
      orden_id: nuevaOrden.id,
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
        metodo_pago: 'Pendiente por definir',
        referencia_tipo: 'orden',
        referencia_id: nuevaOrden.id,
        notas: cliente.value.nombre
      })
      if (errorCaja) throw errorCaja
    }

    alert(`Orden creada: ${folio}`)
    router.push(`/ordenes/${nuevaOrden.id}`)
  } catch (error) {
    alert(error.message)
  } finally {
    cargando.value = false
  }
}

onMounted(() => {
  cargarDatos()
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

          <section v-else-if="pasoActual === 3" key="evidencia" class="wizard-step">
            <div class="step-heading">
              <span class="step-kicker">Paso 3 de 5</span>
              <h2>Evidencia de recepción</h2>
              <p>Puedes agregar una fotografía para documentar cómo se recibió. Este paso es opcional.</p>
            </div>

            <label class="camera-card" :class="{ filled: fotoPreview }">
              <input type="file" accept="image/*" capture="environment" @change="manejarFoto">
              <img v-if="fotoPreview" :src="fotoPreview" alt="Fotografía de recepción">
              <div v-else class="camera-empty">
                <span class="camera-icon">📷</span>
                <strong>Agregar fotografía (opcional)</strong>
                <small>También puedes elegir una imagen de tu galería</small>
              </div>
              <span v-if="fotoPreview" class="replace-photo">Cambiar fotografía</span>
            </label>
            <div class="evidence-tip"><span>🛡️</span><p><strong>Recomendación:</strong> procura que se vea la pantalla, bordes y cualquier golpe existente.</p></div>
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
              <h2>Cotización y confirmación</h2>
              <p>Registra el precio, anticipo y revisa el resumen antes de crear la orden.</p>
            </div>

            <div class="money-grid">
              <label class="money-field"><span>Costo total</span><div><b>$</b><input v-model.number="orden.costo_total" type="number" min="0" placeholder="0"></div></label>
              <label class="money-field"><span>Anticipo recibido</span><div><b>$</b><input v-model.number="orden.anticipo" type="number" min="0" placeholder="0"></div></label>
              <div class="balance-card"><span>Saldo pendiente</span><strong>{{ moneda(saldo) }}</strong><small>{{ saldo > 0 ? 'Pendiente por cobrar' : 'Orden cubierta' }}</small></div>
            </div>

            <button type="button" class="details-toggle mt-4" @click="mostrarOpcionesAvanzadas = !mostrarOpcionesAvanzadas">
              <span><strong>Servicio, garantía y notas internas</strong><small>Opcional; se utilizarán los valores predeterminados</small></span><b>{{ mostrarOpcionesAvanzadas ? '−' : '+' }}</b>
            </button>
            <div v-if="mostrarOpcionesAvanzadas" class="details-panel form-grid three-cols">
              <div class="field-block"><label class="form-label">Tipo de servicio</label><select v-model="orden.tipo_servicio" class="form-select" @change="aplicarGarantia"><option v-for="g in configuracionGarantias" :key="g.id" :value="g.tipo_servicio">{{ g.tipo_servicio }}</option></select></div>
              <div class="field-block"><label class="form-label">Garantía (días)</label><input v-model.number="orden.garantia_dias" type="number" class="form-control"></div>
              <div class="field-block"><label class="form-label">Técnico / recepción</label><input v-model="orden.tecnico" class="form-control"></div>
              <div class="field-block"><label class="form-label">Estado inicial</label><select v-model="orden.estado" class="form-select"><option>Recibido</option><option>Diagnóstico</option><option>Esperando autorización</option><option>Esperando pieza</option><option>En reparación</option><option>Listo</option><option>Entregado</option><option>Garantía</option><option>Cancelado</option></select></div>
              <div class="field-block two-span"><label class="form-label">Condiciones de garantía</label><input v-model="orden.garantia_condiciones" class="form-control"></div>
              <div class="field-block full"><label class="form-label">Notas internas</label><textarea v-model="orden.notas" class="form-control" rows="2"></textarea></div>
            </div>

            <div class="final-review">
              <div><span>Cliente</span><strong>{{ cliente.nombre || 'Pendiente' }}</strong></div>
              <div><span>Equipo</span><strong>{{ [equipo.marca, equipo.modelo].filter(Boolean).join(' ') || 'Pendiente' }}</strong></div>
              <div><span>Falla</span><strong>{{ orden.falla_reportada || 'Pendiente' }}</strong></div>
              <div><span>Checklist</span><strong>{{ checklistResumen }}</strong></div>
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
          <div :class="{ done: fotoArchivo }"><span>✓</span> Evidencia</div>
        </div>
        <div v-if="orden.falla_reportada" class="summary-issue"><span>Falla reportada</span><p>{{ orden.falla_reportada }}</p></div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.reception-page{max-width:1420px;margin:0 auto;padding-bottom:40px}.reception-header{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;margin-bottom:22px}.header-actions{display:flex;gap:10px}.eyebrow,.step-kicker{display:block;color:var(--ts-primary,#2563eb);font-size:.72rem;font-weight:850;letter-spacing:.09em;text-transform:uppercase;margin-bottom:6px}.stepper{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:22px}.stepper-item{border:0;background:transparent;display:flex;align-items:center;gap:9px;text-align:left;padding:8px;border-radius:13px;color:var(--ts-muted,#64748b)}.stepper-item:hover{background:var(--ts-soft,#f8fafc)}.step-dot{width:30px;height:30px;flex:0 0 30px;display:grid;place-items:center;border:1px solid var(--ts-border,#dbe3ee);border-radius:10px;background:var(--ts-surface,#fff);font-size:.78rem;font-weight:850}.stepper-item.active{color:var(--ts-text,#0f172a);background:rgba(37,99,235,.06)}.stepper-item.active .step-dot{background:#2563eb;border-color:#2563eb;color:#fff;box-shadow:0 6px 15px rgba(37,99,235,.25)}.stepper-item.complete .step-dot{background:#dcfce7;border-color:#bbf7d0;color:#15803d}.step-copy{display:flex;flex-direction:column;min-width:0}.step-copy strong{font-size:.78rem;white-space:nowrap}.step-copy small{font-size:.66rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.reception-layout{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:22px;align-items:start}.wizard-card{overflow:hidden}.wizard-step{min-height:500px;padding:32px}.step-heading{margin-bottom:26px}.step-heading h2{font-size:1.45rem;font-weight:850;margin:0 0 6px}.step-heading p{color:var(--ts-muted,#64748b);margin:0}.choice-tabs{display:inline-flex;padding:4px;background:var(--ts-soft,#f1f5f9);border-radius:13px;margin-bottom:24px}.choice-tabs button{border:0;background:transparent;color:var(--ts-muted,#64748b);padding:10px 16px;border-radius:10px;font-weight:750;font-size:.86rem}.choice-tabs button.active{background:var(--ts-surface,#fff);color:var(--ts-text,#0f172a);box-shadow:0 2px 8px rgba(15,23,42,.08)}.field-block{display:flex;flex-direction:column}.form-grid{display:grid;gap:16px}.two-cols{grid-template-columns:repeat(2,minmax(0,1fr))}.three-cols{grid-template-columns:repeat(3,minmax(0,1fr))}.full{grid-column:1/-1}.two-span{grid-column:span 2}.form-label{font-size:.78rem;font-weight:750;color:var(--ts-muted,#475569);margin-bottom:7px}.form-control,.form-select{border-radius:11px;min-height:44px}.selected-client{margin-top:14px;display:flex;align-items:center;gap:12px;padding:14px;border:1px solid #bfdbfe;background:#eff6ff;border-radius:14px}.client-avatar{width:40px;height:40px;display:grid;place-items:center;border-radius:12px;background:#2563eb;color:#fff;font-weight:850}.selected-client div:nth-child(2){display:flex;flex-direction:column;flex:1}.selected-client span{font-size:.8rem;color:#64748b}.selected-badge{padding:5px 9px;border-radius:999px;background:#dbeafe;color:#1d4ed8!important;font-weight:750}.device-type-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.device-type-grid button{border:1px solid var(--ts-border,#dbe3ee);background:var(--ts-surface,#fff);border-radius:14px;padding:15px 10px;display:flex;align-items:center;justify-content:center;gap:8px;color:var(--ts-muted,#64748b)}.device-type-grid button span{font-size:1.2rem}.device-type-grid button strong{font-size:.82rem}.device-type-grid button.active{border-color:#2563eb;background:#eff6ff;color:#1d4ed8;box-shadow:0 0 0 2px rgba(37,99,235,.08)}.issue-input{min-height:105px}.details-toggle{width:100%;border:1px dashed var(--ts-border,#cbd5e1);background:transparent;border-radius:14px;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;text-align:left;margin-top:18px}.details-toggle span{display:flex;flex-direction:column}.details-toggle strong{font-size:.86rem}.details-toggle small{color:var(--ts-muted,#64748b);margin-top:2px}.details-toggle b{font-size:1.2rem;color:#2563eb}.details-panel{margin-top:12px;padding:18px;background:var(--ts-soft,#f8fafc);border:1px solid var(--ts-border,#e2e8f0);border-radius:14px}.camera-card{position:relative;min-height:330px;border:2px dashed var(--ts-border,#cbd5e1);background:var(--ts-soft,#f8fafc);border-radius:20px;display:grid;place-items:center;overflow:hidden;cursor:pointer}.camera-card input{display:none}.camera-card img{width:100%;height:100%;max-height:440px;object-fit:contain;background:#0f172a}.camera-empty{text-align:center;display:flex;flex-direction:column;align-items:center}.camera-icon{font-size:2.5rem;margin-bottom:12px}.camera-empty strong{font-size:1rem}.camera-empty small{color:var(--ts-muted,#64748b);margin-top:5px}.replace-photo{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);padding:8px 13px;border-radius:999px;background:rgba(15,23,42,.78);color:#fff;font-size:.78rem;font-weight:750}.evidence-tip{display:flex;gap:10px;margin-top:14px;padding:12px 14px;border-radius:13px;background:#fffbeb;color:#92400e;font-size:.82rem}.evidence-tip p{margin:0}.checklist-heading{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}.legend-row{display:flex;flex-wrap:wrap;gap:14px;margin-bottom:16px;color:var(--ts-muted,#64748b);font-size:.74rem}.legend-row span{display:flex;align-items:center;gap:5px}.status-dot{width:9px;height:9px;border-radius:50%;display:inline-block}.status-dot.ok{background:#22c55e}.status-dot.fail{background:#ef4444}.status-dot.unknown{background:#f59e0b}.status-dot.na{background:#94a3b8}.smart-checklist{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.smart-check-item{border:1px solid var(--ts-border,#e2e8f0);border-radius:16px;background:var(--ts-surface,#fff);overflow:hidden;transition:.15s;box-shadow:0 1px 2px rgba(15,23,42,.04)}.smart-check-item:hover{border-color:#bfdbfe;box-shadow:0 8px 22px rgba(15,23,42,.07)}.smart-check-item.state-ok{border-color:#86efac;background:linear-gradient(90deg,rgba(34,197,94,.06),var(--ts-surface,#fff) 30%)}.smart-check-item.state-fail{border-color:#fca5a5;background:linear-gradient(90deg,rgba(239,68,68,.06),var(--ts-surface,#fff) 30%)}.smart-check-item.state-na{opacity:.78}.check-main{display:grid;grid-template-columns:minmax(190px,1fr) auto 38px;gap:12px;align-items:center;padding:13px 14px}.check-identity{display:flex;align-items:center;gap:11px;min-width:0}.check-icon{width:40px;height:40px;flex:0 0 40px;display:grid;place-items:center;border-radius:12px;background:#eff6ff;color:#1d4ed8;font-size:1.1rem;font-weight:900}.check-copy{display:flex;flex-direction:column;min-width:0}.check-copy strong{font-size:.86rem;color:var(--ts-text,#0f172a);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.check-copy small{margin-top:3px;color:var(--ts-muted,#64748b);font-size:.68rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.status-buttons{display:flex;gap:6px}.status-button{width:42px;height:38px;border:1px solid var(--ts-border,#dbe3ee);background:var(--ts-soft,#f8fafc);border-radius:10px;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1}.status-button span{font-size:.8rem;font-weight:900}.status-button small{font-size:.52rem;margin-top:3px}.status-button.selected.status-ok{background:#dcfce7;border-color:#86efac;color:#15803d}.status-button.selected.status-fail{background:#fee2e2;border-color:#fca5a5;color:#b91c1c}.status-button.selected.status-unknown{background:#fef3c7;border-color:#fcd34d;color:#a16207}.status-button.selected.status-na{background:#e2e8f0;border-color:#cbd5e1;color:#475569}.note-button{width:34px;height:34px;border:0;border-radius:9px;background:var(--ts-soft,#f1f5f9);color:#64748b}.note-button.active{background:#dbeafe;color:#2563eb}.check-note{padding:0 12px 12px}.check-note .form-control{min-height:38px;font-size:.8rem}.custom-check-row{display:flex;gap:8px;margin-top:14px}.money-grid{display:grid;grid-template-columns:1fr 1fr 1.1fr;gap:14px}.money-field,.balance-card{border:1px solid var(--ts-border,#dbe3ee);border-radius:16px;padding:18px;background:var(--ts-surface,#fff)}.money-field>span,.balance-card>span{display:block;color:var(--ts-muted,#64748b);font-size:.76rem;font-weight:750;margin-bottom:10px}.money-field>div{display:flex;align-items:center;gap:8px}.money-field b{font-size:1.35rem}.money-field input{width:100%;border:0;outline:0;background:transparent;font-size:1.45rem;font-weight:850;color:var(--ts-text,#0f172a)}.balance-card{background:linear-gradient(135deg,#1d4ed8,#2563eb);color:#fff;border:0}.balance-card>span,.balance-card small{color:#dbeafe}.balance-card strong{display:block;font-size:1.6rem}.final-review{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:20px}.final-review div{padding:13px;border-radius:12px;background:var(--ts-soft,#f8fafc)}.final-review span{display:block;color:var(--ts-muted,#64748b);font-size:.7rem;margin-bottom:3px}.final-review strong{display:block;font-size:.82rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.wizard-footer{min-height:72px;padding:14px 24px;border-top:1px solid var(--ts-border,#e2e8f0);display:flex;align-items:center;justify-content:space-between;background:var(--ts-surface,#fff)}.mobile-step-count{font-size:.75rem;color:var(--ts-muted,#64748b)}.live-summary{position:sticky;top:88px;padding:22px;text-align:center}.summary-top{display:flex;justify-content:space-between;align-items:center}.completion-pill{padding:5px 9px;border-radius:999px;background:#dbeafe;color:#1d4ed8;font-size:.72rem;font-weight:850}.device-summary-icon{width:62px;height:62px;display:grid;place-items:center;margin:14px auto 10px;border-radius:20px;background:var(--ts-soft,#f1f5f9);font-size:1.8rem}.live-summary h3{font-size:1.1rem;font-weight:850;margin:0 0 3px}.live-summary>p{color:var(--ts-muted,#64748b);font-size:.84rem}.summary-list{margin-top:18px;text-align:left}.summary-list div{display:flex;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid var(--ts-border,#e2e8f0);font-size:.82rem}.summary-list span{color:var(--ts-muted,#64748b)}.summary-balance strong{color:#2563eb;font-size:1rem}.progress-checks{display:grid;grid-template-columns:repeat(2,1fr);gap:7px;margin-top:16px;text-align:left}.progress-checks div{font-size:.72rem;color:#94a3b8}.progress-checks span{display:inline-grid;place-items:center;width:18px;height:18px;border-radius:50%;background:#e2e8f0;margin-right:4px;font-size:.6rem}.progress-checks div.done{color:var(--ts-text,#0f172a);font-weight:750}.progress-checks div.done span{background:#dcfce7;color:#15803d}.summary-issue{text-align:left;margin-top:17px;padding:12px;background:var(--ts-soft,#f8fafc);border-radius:12px}.summary-issue span{font-size:.68rem;color:var(--ts-muted,#64748b)}.summary-issue p{font-size:.76rem;margin:4px 0 0;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}.step-fade-enter-active,.step-fade-leave-active{transition:.16s ease}.step-fade-enter-from{opacity:0;transform:translateX(12px)}.step-fade-leave-to{opacity:0;transform:translateX(-8px)}.note-slide-enter-active,.note-slide-leave-active{transition:.15s ease}.note-slide-enter-from,.note-slide-leave-to{opacity:0;transform:translateY(-4px)}
@media(max-width:1180px){.reception-layout{grid-template-columns:1fr}.live-summary{position:static;order:-1;text-align:left}.live-summary .device-summary-icon,.live-summary h3,.live-summary>p{display:none}.summary-list{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:8px}.summary-list div{border:0;padding:8px;background:var(--ts-soft,#f8fafc);border-radius:10px;flex-direction:column}.progress-checks,.summary-issue{display:none}}
@media(max-width:900px){.stepper{grid-template-columns:repeat(5,44px);justify-content:center}.step-copy{display:none}.smart-checklist{grid-template-columns:1fr}.device-type-grid{grid-template-columns:repeat(2,1fr)}}
@media(max-width:1120px){.smart-checklist{grid-template-columns:1fr}}
@media(max-width:680px){.reception-header{align-items:flex-start}.header-actions .btn-light{display:none}.wizard-step{padding:22px 17px;min-height:520px}.stepper{overflow-x:auto;justify-content:start;padding-bottom:3px}.two-cols,.three-cols,.money-grid,.final-review{grid-template-columns:1fr}.two-span{grid-column:auto}.summary-list{grid-template-columns:repeat(2,1fr)}.check-main{grid-template-columns:1fr 38px}.check-identity{grid-column:1/2}.status-buttons{grid-column:1/-1;grid-row:2;justify-content:space-between}.status-button{flex:1}.note-button{grid-column:2;grid-row:1}.custom-check-row{flex-direction:column}.wizard-footer{padding:12px 16px}.checklist-heading{flex-direction:column}.camera-card{min-height:260px}}
</style>
