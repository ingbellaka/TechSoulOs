<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../lib/supabase'

const router = useRouter()
const fechaSeleccionada = ref(new Date().toISOString().slice(0, 10))
const citas = ref([])
const ordenes = ref([])
const cargando = ref(false)
const guardando = ref(false)
const mostrarFormulario = ref(false)
const form = ref(nuevoFormulario())
const formFecha = ref(fechaSeleccionada.value)
const formHora = ref('10:00')

const HORARIOS_TALLER = {
  1: { abre: '10:00', cierra: '18:00' },
  2: { abre: '10:00', cierra: '18:00' },
  3: { abre: '10:00', cierra: '18:00' },
  4: { abre: '10:00', cierra: '18:00' },
  5: { abre: '10:00', cierra: '17:00' },
  6: { abre: '10:00', cierra: '15:00' }
}
const INTERVALO_MIN = 30
const DURACIONES_BASE = [15, 30, 45, 60, 90, 120, 180, 240, 300, 360, 420, 480]

function nuevoFormulario() {
  return {
    nombre_cliente: '', telefono: '', equipo: '', servicio: '',
    duracion_min: 30, estado: 'Cita', notas: ''
  }
}

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

const horarioFormulario = computed(() => horarioDeFecha(formFecha.value))

const duracionesDisponibles = computed(() => {
  const h = horarioFormulario.value
  if (!h) return []
  const jornada = minutosDeHora(h.cierra) - minutosDeHora(h.abre)
  return DURACIONES_BASE.filter(min => min <= jornada)
})

const horasDisponibles = computed(() => {
  const h = horarioFormulario.value
  if (!h) return []
  const abre = minutosDeHora(h.abre)
  const cierra = minutosDeHora(h.cierra)
  const duracion = Number(form.value.duracion_min || 30)
  const horas = []
  for (let min = abre; min + duracion <= cierra; min += INTERVALO_MIN) {
    horas.push(horaDeMinutos(min))
  }
  return horas
})

function asegurarHoraValida() {
  if (!duracionesDisponibles.value.includes(Number(form.value.duracion_min))) {
    form.value.duracion_min = duracionesDisponibles.value.includes(30) ? 30 : (duracionesDisponibles.value[0] || 30)
  }
  if (!horasDisponibles.value.includes(formHora.value)) {
    formHora.value = horasDisponibles.value[0] || ''
  }
}

function etiquetaHorario(fecha) {
  const h = horarioDeFecha(fecha)
  return h ? `${h.abre}–${h.cierra}` : 'Cerrado'
}

function rangoDia(fecha) {
  const inicio = new Date(`${fecha}T00:00:00`)
  const fin = new Date(inicio)
  fin.setDate(fin.getDate() + 1)
  return [inicio.toISOString(), fin.toISOString()]
}

function hora(valor) {
  return new Date(valor).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}
function fechaBonita(valor) {
  return new Date(`${valor}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}
function duracion(min) {
  const n = Number(min || 0)
  if (n < 60) return `${n} min`
  const h = Math.floor(n / 60), m = n % 60
  return m ? `${h} h ${m} min` : `${h} h`
}
function sumarMinutos(valor, min) {
  const d = new Date(valor)
  d.setMinutes(d.getMinutes() + Number(min || 0))
  return hora(d)
}

const eventos = computed(() => {
  const deCitas = citas.value.map(c => ({
    id: `c-${c.id}`, tipo: 'Cita', inicio: c.inicio, duracion_min: c.duracion_min,
    cliente: c.nombre_cliente, equipo: c.equipo, servicio: c.servicio, estado: c.estado,
    telefono: c.telefono, notas: c.notas, raw: c
  }))
  const deOrdenes = ordenes.value.map(o => ({
    id: `o-${o.id}`, tipo: 'Orden', inicio: o.fecha_programada, duracion_min: o.duracion_estimada_min || 30,
    cliente: o.clientes?.nombre || 'Cliente', equipo: [o.equipos?.marca, o.equipos?.modelo].filter(Boolean).join(' ') || 'Equipo',
    servicio: o.trabajo_realizado || o.falla_reportada || 'Reparación', estado: o.estado, folio: o.folio, raw: o
  }))
  return [...deCitas, ...deOrdenes].sort((a,b) => new Date(a.inicio) - new Date(b.inicio))
})


const resumenDia = computed(() => ({
  total: eventos.value.length,
  citas: eventos.value.filter(e => e.tipo === 'Cita').length,
  ordenes: eventos.value.filter(e => e.tipo === 'Orden').length,
  minutos: eventos.value.reduce((acc, e) => acc + Number(e.duracion_min || 0), 0)
}))

const horasOcupadas = computed(() => {
  const min = resumenDia.value.minutos
  if (!min) return '0 h'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} h ${m} min` : `${h} h`
})

async function cargarAgenda() {
  cargando.value = true
  const [desde, hasta] = rangoDia(fechaSeleccionada.value)
  const [citasRes, ordenesRes] = await Promise.all([
    supabase.from('citas_agenda').select('*').gte('inicio', desde).lt('inicio', hasta).order('inicio'),
    supabase.from('ordenes').select('id,folio,estado,falla_reportada,trabajo_realizado,fecha_programada,duracion_estimada_min,clientes(nombre,telefono),equipos(marca,modelo,tipo_equipo)').gte('fecha_programada', desde).lt('fecha_programada', hasta).order('fecha_programada')
  ])
  if (citasRes.error) alert(`Agenda: ${citasRes.error.message}`)
  if (ordenesRes.error) alert(`Órdenes programadas: ${ordenesRes.error.message}`)
  citas.value = citasRes.data || []
  ordenes.value = ordenesRes.data || []
  cargando.value = false
}

function abrirNuevaCita() {
  form.value = nuevoFormulario()
  formFecha.value = fechaSeleccionada.value
  formHora.value = horarioDeFecha(formFecha.value)?.abre || ''
  asegurarHoraValida()
  mostrarFormulario.value = true
}

async function guardarCita() {
  if (!form.value.nombre_cliente.trim() || !form.value.servicio.trim() || !formFecha.value || !formHora.value) {
    return alert('Cliente, servicio, fecha y hora son obligatorios.')
  }

  const horario = horarioDeFecha(formFecha.value)
  if (!horario) return alert('El taller está cerrado los domingos. Selecciona otro día.')

  const duracion = Number(form.value.duracion_min || 30)
  const inicioMin = minutosDeHora(formHora.value)
  if (inicioMin < minutosDeHora(horario.abre) || inicioMin + duracion > minutosDeHora(horario.cierra)) {
    return alert(`La cita debe quedar dentro del horario ${horario.abre} a ${horario.cierra}.`)
  }

  guardando.value = true
  const payload = {
    ...form.value,
    nombre_cliente: form.value.nombre_cliente.trim(),
    servicio: form.value.servicio.trim(),
    telefono: form.value.telefono.trim(),
    equipo: form.value.equipo.trim(),
    notas: form.value.notas.trim(),
    inicio: new Date(`${formFecha.value}T${formHora.value}:00`).toISOString(),
    duracion_min: duracion
  }
  const { error } = await supabase.from('citas_agenda').insert(payload)
  guardando.value = false
  if (error) return alert(error.message)
  mostrarFormulario.value = false
  await cargarAgenda()
}

async function cambiarEstado(cita, estado) {
  const { error } = await supabase.from('citas_agenda').update({ estado, updated_at: new Date().toISOString() }).eq('id', cita.id)
  if (error) return alert(error.message)
  await cargarAgenda()
}

async function eliminarCita(cita) {
  if (!confirm(`¿Eliminar la cita de ${cita.nombre_cliente}?`)) return
  const { error } = await supabase.from('citas_agenda').delete().eq('id', cita.id)
  if (error) return alert(error.message)
  await cargarAgenda()
}

function moverDia(delta) {
  const d = new Date(`${fechaSeleccionada.value}T12:00:00`)
  d.setDate(d.getDate() + delta)
  fechaSeleccionada.value = d.toISOString().slice(0, 10)
  cargarAgenda()
}

onMounted(cargarAgenda)
</script>

<template>
  <div class="ts-module-page agenda-page">
    <header class="ts-module-header agenda-header">
      <div>
        <span class="ts-eyebrow">Operación</span>
        <h2>Agenda</h2>
        <p>Organiza citas y reparaciones sin perder de vista la carga del día.</p>
      </div>
      <button class="ts-action-primary agenda-new" @click="abrirNuevaCita"><span>＋</span> Nueva cita</button>
    </header>

    <section class="agenda-overview">
      <article class="overview-card">
        <span class="overview-icon">📅</span>
        <div><small>Programados</small><strong>{{ resumenDia.total }}</strong><p>trabajos para hoy</p></div>
      </article>
      <article class="overview-card">
        <span class="overview-icon">👤</span>
        <div><small>Citas</small><strong>{{ resumenDia.citas }}</strong><p>clientes agendados</p></div>
      </article>
      <article class="overview-card">
        <span class="overview-icon">🛠️</span>
        <div><small>Órdenes</small><strong>{{ resumenDia.ordenes }}</strong><p>reparaciones programadas</p></div>
      </article>
      <article class="overview-card">
        <span class="overview-icon">⏱️</span>
        <div><small>Carga estimada</small><strong>{{ horasOcupadas }}</strong><p>tiempo programado</p></div>
      </article>
    </section>

    <section class="agenda-toolbar ts-panel">
      <button class="day-nav" @click="moverDia(-1)">← <span>Día anterior</span></button>
      <div class="agenda-date">
        <small>Fecha seleccionada</small>
        <strong>{{ fechaBonita(fechaSeleccionada) }}</strong>
        <input v-model="fechaSeleccionada" type="date" @change="cargarAgenda">
      </div>
      <button class="day-nav" @click="moverDia(1)"><span>Día siguiente</span> →</button>
    </section>

    <section v-if="mostrarFormulario" class="ts-panel agenda-form">
      <div class="form-heading">
        <div>
          <span class="ts-panel-kicker">Programación</span>
          <h3>Nueva cita</h3>
          <p>Registra la llegada del cliente y reserva el tiempo estimado.</p>
        </div>
        <button class="form-close" @click="mostrarFormulario=false">×</button>
      </div>
      <div class="agenda-grid">
        <label><span>Cliente *</span><input v-model="form.nombre_cliente" placeholder="Nombre del cliente"></label>
        <label><span>Teléfono</span><input v-model="form.telefono" placeholder="667..."></label>
        <label><span>Equipo</span><input v-model="form.equipo" placeholder="Ej. iPhone 13"></label>
        <label><span>Servicio *</span><input v-model="form.servicio" placeholder="Ej. Cambio de pantalla"></label>
        <label>
          <span>Fecha *</span>
          <input v-model="formFecha" type="date" @change="asegurarHoraValida">
          <small class="schedule-help">{{ horarioFormulario ? `Horario del taller: ${etiquetaHorario(formFecha)}` : 'Domingo · taller cerrado' }}</small>
        </label>
        <label>
          <span>Duración</span>
          <select v-model.number="form.duracion_min" @change="asegurarHoraValida" :disabled="!horarioFormulario">
            <option v-for="min in duracionesDisponibles" :key="min" :value="min">{{ duracion(min) }}</option>
          </select>
        </label>
        <label>
          <span>Hora de inicio *</span>
          <select v-model="formHora" :disabled="!horarioFormulario || !horasDisponibles.length">
            <option v-for="horaCita in horasDisponibles" :key="horaCita" :value="horaCita">{{ horaCita }}</option>
          </select>
        </label>
        <label class="full"><span>Notas</span><textarea v-model="form.notas" rows="2" placeholder="Información adicional"></textarea></label>
      </div>
      <div class="agenda-actions"><button class="ts-action-secondary" @click="mostrarFormulario=false">Cancelar</button><button class="ts-action-primary" :disabled="guardando" @click="guardarCita">{{ guardando ? 'Guardando…' : 'Guardar cita' }}</button></div>
    </section>

    <section class="agenda-board ts-panel">
      <div class="board-heading">
        <div>
          <small>Plan del día</small>
          <h3>{{ fechaBonita(fechaSeleccionada) }}</h3>
          <p class="day-schedule">{{ horarioDeFecha(fechaSeleccionada) ? `Horario ${etiquetaHorario(fechaSeleccionada)}` : 'Taller cerrado' }}</p>
        </div>
        <span class="board-count">{{ resumenDia.total }} programado{{ resumenDia.total === 1 ? '' : 's' }}</span>
      </div>

      <div v-if="cargando" class="ts-empty-state"><span class="ts-spinner"></span><p>Cargando agenda…</p></div>
      <div v-else-if="!eventos.length" class="agenda-empty">
        <div class="empty-icon">📆</div>
        <strong>Día libre por ahora</strong>
        <p>No hay citas ni reparaciones programadas para este día.</p>
        <button class="ts-action-primary" @click="abrirNuevaCita">＋ Agendar primera cita</button>
      </div>
      <div v-else class="agenda-timeline">
        <article v-for="evento in eventos" :key="evento.id" class="agenda-event" :class="evento.tipo === 'Orden' ? 'is-order' : 'is-appointment'">
          <div class="agenda-time">
            <strong>{{ hora(evento.inicio) }}</strong>
            <small>{{ sumarMinutos(evento.inicio, evento.duracion_min) }}</small>
          </div>
          <div class="timeline-marker"><span></span></div>
          <div class="agenda-card">
            <div class="agenda-title-row">
              <div class="agenda-title">
                <span class="agenda-kind">{{ evento.tipo === 'Orden' ? 'Reparación' : 'Cita' }}</span>
                <span v-if="evento.folio" class="agenda-folio">{{ evento.folio }}</span>
              </div>
              <span class="duration-pill">⏱ {{ duracion(evento.duracion_min) }}</span>
            </div>
            <strong class="client-name">{{ evento.cliente }}</strong>
            <p class="service-line"><b>{{ evento.equipo }}</b><span>•</span>{{ evento.servicio }}</p>
            <div class="event-footer">
              <span class="status-pill">{{ evento.estado }}</span>
              <div class="agenda-row-actions">
                <button v-if="evento.tipo === 'Orden'" class="open-order" @click="router.push(`/ordenes/${evento.raw.id}`)">Abrir orden →</button>
                <template v-else>
                  <select :value="evento.estado" @change="cambiarEstado(evento.raw, $event.target.value)"><option>Cita</option><option>Confirmada</option><option>Recibido</option><option>Cancelada</option><option>No asistió</option></select>
                  <button class="agenda-delete" @click="eliminarCita(evento.raw)">Eliminar</button>
                </template>
              </div>
            </div>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.agenda-page{padding-bottom:28px}.agenda-header{align-items:flex-end}.agenda-new{display:flex;align-items:center;gap:6px}.agenda-overview{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:18px 0}.overview-card{display:flex;align-items:center;gap:13px;min-height:106px;padding:17px 18px;border:1px solid var(--ts-border,#e2e8f0);border-radius:18px;background:var(--ts-surface,#fff);box-shadow:0 8px 24px rgba(15,23,42,.035)}.overview-icon{width:42px;height:42px;border-radius:13px;display:grid;place-items:center;background:#eff6ff;font-size:1.05rem}.overview-card small{display:block;color:var(--ts-muted,#64748b);font-size:.68rem;font-weight:800;text-transform:uppercase;letter-spacing:.05em}.overview-card strong{display:block;margin-top:2px;font-size:1.45rem;line-height:1.1;color:var(--ts-text,#0f172a)}.overview-card p{margin:4px 0 0;color:var(--ts-muted,#64748b);font-size:.7rem}.agenda-toolbar{display:grid;grid-template-columns:1fr minmax(300px,1.25fr) 1fr;align-items:center;gap:16px;padding:12px 14px}.day-nav{border:0;background:transparent;color:var(--ts-text,#0f172a);font-size:.77rem;font-weight:800;padding:10px 12px;border-radius:10px}.day-nav:first-child{justify-self:start}.day-nav:last-child{justify-self:end}.day-nav:hover{background:var(--ts-soft,#f8fafc)}.agenda-date{text-align:center;display:grid;grid-template-columns:1fr auto;align-items:center;column-gap:10px}.agenda-date small{grid-column:1/-1;color:var(--ts-muted,#64748b);font-size:.65rem;text-transform:uppercase;letter-spacing:.06em;font-weight:800}.agenda-date strong{text-transform:capitalize;font-size:.9rem}.agenda-date input{width:38px;height:34px;border:1px solid var(--ts-border,#dbe3ee);border-radius:9px;padding:5px;color:transparent;background:var(--ts-soft,#f8fafc)}.agenda-date input::-webkit-calendar-picker-indicator{opacity:1;cursor:pointer}.agenda-form{margin-top:16px;padding:20px}.form-heading{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-bottom:17px}.form-heading h3{margin:2px 0 3px}.form-heading p{margin:0;color:var(--ts-muted,#64748b);font-size:.76rem}.form-close{width:34px;height:34px;border:0;border-radius:10px;background:var(--ts-soft,#f1f5f9);font-size:1.25rem;color:#64748b}.agenda-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.agenda-grid label{display:flex;flex-direction:column;gap:6px}.agenda-grid label span{font-size:.72rem;font-weight:800;color:var(--ts-muted,#64748b)}.agenda-grid input,.agenda-grid select,.agenda-grid textarea,.agenda-row-actions select{border:1px solid var(--ts-border,#dbe3ee);border-radius:11px;padding:10px 12px;background:var(--ts-surface,#fff);color:var(--ts-text,#0f172a);outline:none}.agenda-grid input:focus,.agenda-grid select:focus,.agenda-grid textarea:focus{border-color:#60a5fa;box-shadow:0 0 0 3px rgba(37,99,235,.08)}.agenda-grid .full{grid-column:1/-1}.agenda-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:16px}.agenda-board{margin-top:16px;padding:0;overflow:hidden;container-type:inline-size}.board-heading{display:flex;align-items:center;justify-content:space-between;padding:17px 20px;border-bottom:1px solid var(--ts-border,#e2e8f0)}.board-heading small{display:block;color:#2563eb;font-size:.65rem;font-weight:850;text-transform:uppercase;letter-spacing:.06em}.board-heading h3{text-transform:capitalize;margin:2px 0 0;font-size:.95rem}.board-count{padding:6px 9px;border-radius:999px;background:#eff6ff;color:#1d4ed8;font-size:.68rem;font-weight:800;white-space:nowrap;flex:0 0 auto}.agenda-timeline{padding:8px 20px 18px}.agenda-event{display:grid;grid-template-columns:72px 20px 1fr;gap:10px;min-height:118px}.agenda-time{padding-top:19px;text-align:right;display:flex;flex-direction:column}.agenda-time strong{font-size:.88rem;color:var(--ts-text,#0f172a)}.agenda-time small{color:var(--ts-muted,#64748b);font-size:.65rem;margin-top:2px}.timeline-marker{position:relative;display:flex;justify-content:center}.timeline-marker:after{content:"";position:absolute;top:0;bottom:0;width:1px;background:#dbe3ee}.timeline-marker span{position:relative;z-index:2;margin-top:23px;width:10px;height:10px;border-radius:50%;background:#2563eb;box-shadow:0 0 0 4px #dbeafe}.is-order .timeline-marker span{background:#16a34a;box-shadow:0 0 0 4px #dcfce7}.agenda-card{align-self:start;margin:8px 0;padding:15px 16px;border:1px solid var(--ts-border,#e2e8f0);border-radius:15px;background:var(--ts-surface,#fff);box-shadow:0 5px 16px rgba(15,23,42,.035)}.agenda-title-row,.event-footer{display:flex;align-items:center;justify-content:space-between;gap:12px}.agenda-title{display:flex;align-items:center;gap:7px}.agenda-kind,.agenda-folio,.duration-pill,.status-pill{font-size:.64rem;font-weight:850;border-radius:999px;padding:5px 8px}.agenda-kind{background:#eff6ff;color:#1d4ed8}.is-order .agenda-kind{background:#ecfdf5;color:#15803d}.agenda-folio{background:#f1f5f9;color:#475569}.duration-pill{background:#f8fafc;color:#64748b}.client-name{display:block;margin-top:10px;font-size:.94rem;overflow-wrap:break-word;word-break:normal}.service-line{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin:5px 0 12px;color:var(--ts-muted,#64748b);font-size:.76rem;overflow-wrap:break-word;word-break:normal}.service-line b{color:var(--ts-text,#0f172a)}.status-pill{background:#f8fafc;color:#475569}.agenda-row-actions{display:flex;align-items:center;gap:7px}.agenda-row-actions select{padding:7px 9px;font-size:.7rem}.open-order{border:0;background:transparent;color:#2563eb;font-size:.72rem;font-weight:850;padding:7px}.agenda-delete{border:0;background:#fff1f2;color:#be123c;border-radius:9px;padding:8px 9px;font-size:.68rem;font-weight:800}.agenda-empty{text-align:center;padding:54px 20px;color:var(--ts-muted,#64748b)}.empty-icon{width:56px;height:56px;display:grid;place-items:center;margin:0 auto 13px;border-radius:18px;background:#eff6ff;font-size:1.4rem}.agenda-empty strong{display:block;color:var(--ts-text,#0f172a);font-size:1rem}.agenda-empty p{margin:5px 0 16px;font-size:.78rem}.schedule-help{font-size:.66rem;color:var(--ts-muted,#64748b);margin-top:1px}.day-schedule{margin:3px 0 0;color:var(--ts-muted,#64748b);font-size:.68rem;font-weight:700}@media(max-width:1050px){.agenda-overview{grid-template-columns:repeat(2,1fr)}}@media(max-width:760px){.agenda-header{align-items:flex-start}.agenda-overview{grid-template-columns:1fr 1fr}.overview-card{min-height:92px;padding:14px}.agenda-toolbar{grid-template-columns:1fr 1fr}.agenda-date{grid-column:1/-1;grid-row:1}.agenda-grid{grid-template-columns:1fr}.agenda-grid .full{grid-column:auto}.agenda-event{grid-template-columns:58px 16px 1fr}.agenda-timeline{padding:8px 12px 14px}.agenda-card{padding:13px}.agenda-title-row,.event-footer{align-items:flex-start;flex-direction:column}.agenda-row-actions{width:100%;justify-content:flex-end}.day-nav span{display:none}}@media(max-width:480px){.agenda-overview{grid-template-columns:1fr}.overview-card{min-height:auto}.agenda-event{grid-template-columns:1fr}.agenda-time{text-align:left;flex-direction:row;gap:6px;padding:8px 0 0}.timeline-marker{display:none}.agenda-card{margin-top:0}}

/* Responsive de la agenda basado en el ancho REAL del panel.
   Esto evita que una cita se comprima aunque el layout padre/sidebar reduzca el espacio. */
@container (max-width: 700px){
  .board-heading{
    align-items:flex-start;
    gap:12px;
    padding:16px;
  }
  .board-heading > div{
    min-width:0;
    flex:1 1 auto;
  }
  .board-heading h3{
    line-height:1.3;
    overflow-wrap:break-word;
    word-break:normal;
  }
  .agenda-timeline{
    padding:10px 14px 16px;
  }
  .agenda-event{
    display:block;
    min-width:0;
    min-height:0;
    padding:0 0 12px;
  }
  .agenda-time{
    padding:8px 2px 6px;
    text-align:left;
    flex-direction:row;
    align-items:center;
    gap:7px;
    white-space:nowrap;
  }
  .agenda-time strong,
  .agenda-time small{
    margin:0;
  }
  .agenda-time small::before{
    content:"– ";
  }
  .timeline-marker{
    display:none;
  }
  .agenda-card{
    width:100%;
    min-width:0;
    box-sizing:border-box;
    margin:0;
    padding:14px;
  }
  .agenda-title-row{
    flex-direction:row;
    align-items:center;
    flex-wrap:wrap;
    gap:8px;
  }
  .agenda-title{
    min-width:0;
    flex-wrap:wrap;
  }
  .duration-pill{
    margin-left:auto;
    white-space:nowrap;
  }
  .client-name{
    font-size:1rem;
    line-height:1.3;
  }
  .service-line{
    display:block;
    line-height:1.45;
  }
  .service-line span{
    display:none;
  }
  .service-line b{
    display:block;
    margin-bottom:2px;
  }
  .event-footer{
    flex-direction:column;
    align-items:stretch;
    gap:10px;
  }
  .status-pill{
    align-self:flex-start;
  }
  .agenda-row-actions{
    width:100%;
    display:grid;
    grid-template-columns:minmax(0,1fr) auto;
    gap:8px;
  }
  .agenda-row-actions select{
    width:100%;
    min-width:0;
  }
  .open-order{
    grid-column:1/-1;
    width:100%;
    text-align:center;
    border:1px solid var(--ts-border,#dbe3ee);
    border-radius:10px;
  }
}

@container (max-width: 420px){
  .board-heading{
    flex-direction:column;
  }
  .board-count{
    align-self:flex-start;
  }
  .agenda-timeline{
    padding:8px 10px 14px;
  }
  .agenda-card{
    padding:13px 12px;
  }
  .agenda-title-row{
    align-items:flex-start;
  }
  .duration-pill{
    margin-left:0;
  }
  .agenda-row-actions{
    grid-template-columns:1fr;
  }
  .agenda-delete{
    width:100%;
  }
}

</style>
