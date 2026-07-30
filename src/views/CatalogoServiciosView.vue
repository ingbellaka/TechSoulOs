<script setup>
import { computed, onMounted, ref } from 'vue'
import { supabase } from '../lib/supabase'

const servicios = ref([])
const productos = ref([])
const cargando = ref(true)
const guardando = ref(false)
const mostrarFormulario = ref(false)
const editandoId = ref(null)
const busqueda = ref('')
const categoriaFiltro = ref('Todas')
const soloActivos = ref(true)

const nuevoForm = () => ({
  nombre: '', categoria: 'Pantallas', descripcion: '', marca: '', modelo: '', variante: '',
  costo_base: 0, precio_venta: 0, garantia_dias: 90, activo: true, notas: '',
  producto_id: null, cantidad_producto: 1
})
const form = ref(nuevoForm())

const moneda = value => Number(value || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
const normalizar = value => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const categorias = computed(() => ['Todas', ...new Set(servicios.value.map(s => s.categoria).filter(Boolean))])
const filtrados = computed(() => {
  const q = normalizar(busqueda.value)
  return servicios.value.filter(s => {
    const texto = [s.nombre, s.categoria, s.marca, s.modelo, s.variante, s.descripcion].map(normalizar).join(' ')
    return (!q || texto.includes(q)) && (categoriaFiltro.value === 'Todas' || s.categoria === categoriaFiltro.value) && (!soloActivos.value || s.activo !== false)
  })
})
const activos = computed(() => servicios.value.filter(s => s.activo !== false).length)
const precioPromedio = computed(() => activos.value ? servicios.value.filter(s => s.activo !== false).reduce((a, s) => a + Number(s.precio_venta || 0), 0) / activos.value : 0)
const utilidadPromedio = computed(() => activos.value ? servicios.value.filter(s => s.activo !== false).reduce((a, s) => a + (Number(s.precio_venta || 0) - Number(s.costo_base || 0)), 0) / activos.value : 0)

async function cargar() {
  cargando.value = true
  const [{ data: lista, error }, { data: piezas }] = await Promise.all([
    supabase.from('catalogo_servicios').select('*').order('id', { ascending: false }),
    supabase.from('productos').select('id,nombre,stock,modalidad,precio_venta,costo').order('nombre')
  ])
  if (error) alert(error.message)
  servicios.value = lista || []
  productos.value = piezas || []
  cargando.value = false
}
function nuevo() { editandoId.value = null; form.value = nuevoForm(); mostrarFormulario.value = true }
function editar(s) { editandoId.value = s.id; form.value = { ...nuevoForm(), ...s }; mostrarFormulario.value = true; window.scrollTo({ top: 0, behavior: 'smooth' }) }
function cancelar() { mostrarFormulario.value = false; editandoId.value = null; form.value = nuevoForm() }
async function guardar() {
  if (!form.value.nombre.trim()) return alert('El nombre del servicio es obligatorio')
  guardando.value = true
  const payload = { ...form.value, costo_base: Number(form.value.costo_base || 0), precio_venta: Number(form.value.precio_venta || 0), garantia_dias: Number(form.value.garantia_dias || 0), cantidad_producto: Number(form.value.cantidad_producto || 1), actualizado_en: new Date().toISOString() }
  const result = editandoId.value
    ? await supabase.from('catalogo_servicios').update(payload).eq('id', editandoId.value)
    : await supabase.from('catalogo_servicios').insert(payload)
  guardando.value = false
  if (result.error) return alert(result.error.message)
  cancelar(); await cargar()
}
async function cambiarEstado(s) {
  const { error } = await supabase.from('catalogo_servicios').update({ activo: s.activo === false, actualizado_en: new Date().toISOString() }).eq('id', s.id)
  if (error) return alert(error.message)
  await cargar()
}
function margen(s) {
  const venta = Number(s.precio_venta || 0), costo = Number(s.costo_base || 0)
  return venta ? Math.round(((venta - costo) / venta) * 100) : 0
}
function productoNombre(id) { return productos.value.find(p => String(p.id) === String(id))?.nombre || 'Sin refacción vinculada' }
onMounted(cargar)
</script>

<template>
  <section class="ts-module-page">
    <header class="ts-module-header">
      <div><span class="ts-eyebrow">Sprint 1 · Catálogo maestro</span><h2>Servicios, precios y garantías</h2><p>Administra una sola vez lo que vendes; después las órdenes podrán tomar precio, garantía y refacción automáticamente.</p></div>
      <button class="ts-action-primary" type="button" @click="nuevo">+ Nuevo servicio</button>
    </header>

    <div class="ts-metric-strip">
      <article class="ts-mini-metric"><span>Servicios activos</span><strong>{{ activos }}</strong><small>Disponibles para órdenes</small></article>
      <article class="ts-mini-metric"><span>Precio promedio</span><strong>{{ moneda(precioPromedio) }}</strong><small>Venta promedio</small></article>
      <article class="ts-mini-metric"><span>Utilidad promedio</span><strong>{{ moneda(utilidadPromedio) }}</strong><small>Antes de gastos</small></article>
      <article class="ts-mini-metric"><span>Garantía predeterminada</span><strong>90 días</strong><small>Editable por servicio</small></article>
    </div>

    <article v-if="mostrarFormulario" class="ts-panel ts-form-panel catalog-form">
      <div class="ts-panel-heading"><div><span class="ts-panel-kicker">{{ editandoId ? 'Edición' : 'Alta' }}</span><h3>{{ editandoId ? 'Editar servicio' : 'Nuevo servicio' }}</h3></div></div>
      <form class="ts-smart-form" @submit.prevent="guardar">
        <label class="ts-field ts-field-wide"><span>Nombre *</span><input v-model="form.nombre" placeholder="Ej. Cambio de pantalla OLED"></label>
        <label class="ts-field"><span>Categoría</span><select v-model="form.categoria"><option>Pantallas</option><option>Baterías</option><option>Centros de carga</option><option>Tapas</option><option>Cámaras</option><option>Audio</option><option>Micrófonos</option><option>Flex</option><option>Humedad</option><option>Tarjeta lógica</option><option>Mantenimiento</option><option>Software</option><option>Diagnóstico</option><option>Otro</option></select></label>
        <label class="ts-field"><span>Marca</span><input v-model="form.marca" placeholder="Apple, Samsung..."></label>
        <label class="ts-field"><span>Modelo</span><input v-model="form.modelo" placeholder="iPhone 14 Pro"></label>
        <label class="ts-field"><span>Variante / calidad</span><input v-model="form.variante" placeholder="OLED, INCELL, alta capacidad..."></label>
        <label class="ts-field"><span>Costo estimado</span><input v-model.number="form.costo_base" type="number" min="0" step="0.01"></label>
        <label class="ts-field"><span>Precio de venta</span><input v-model.number="form.precio_venta" type="number" min="0" step="0.01"></label>
        <label class="ts-field"><span>Garantía (días)</span><input v-model.number="form.garantia_dias" type="number" min="0"></label>
        <label class="ts-field"><span>Refacción vinculada</span><select v-model="form.producto_id"><option :value="null">Sin vincular</option><option v-for="p in productos" :key="p.id" :value="p.id">{{ p.nombre }} · stock {{ p.modalidad === 'bajo_pedido' ? 'bajo pedido' : p.stock }}</option></select></label>
        <label class="ts-field"><span>Cantidad a descontar</span><input v-model.number="form.cantidad_producto" type="number" min="0.01" step="0.01"></label>
        <label class="ts-field ts-field-wide"><span>Descripción</span><textarea v-model="form.descripcion" rows="3" placeholder="Qué incluye este servicio"></textarea></label>
        <label class="ts-field ts-field-wide"><span>Notas internas</span><textarea v-model="form.notas" rows="2"></textarea></label>
        <label class="catalog-check"><input v-model="form.activo" type="checkbox"> Servicio activo</label>
        <div class="catalog-actions"><button class="ts-action-secondary" type="button" @click="cancelar">Cancelar</button><button class="ts-action-primary" :disabled="guardando">{{ guardando ? 'Guardando...' : 'Guardar servicio' }}</button></div>
      </form>
    </article>

    <article class="ts-panel">
      <div class="catalog-toolbar"><input v-model="busqueda" placeholder="Buscar servicio, modelo o calidad..."><select v-model="categoriaFiltro"><option v-for="c in categorias" :key="c">{{ c }}</option></select><label><input v-model="soloActivos" type="checkbox"> Solo activos</label></div>
      <div v-if="cargando" class="catalog-empty">Cargando catálogo...</div>
      <div v-else-if="!filtrados.length" class="catalog-empty">No hay servicios con estos filtros.</div>
      <div v-else class="catalog-grid">
        <article v-for="s in filtrados" :key="s.id" class="catalog-card">
          <div class="catalog-card-top"><span class="catalog-category">{{ s.categoria }}</span><span :class="['catalog-status', s.activo === false ? 'off' : '']">{{ s.activo === false ? 'Inactivo' : 'Activo' }}</span></div>
          <h3>{{ s.nombre }}</h3><p>{{ [s.marca, s.modelo, s.variante].filter(Boolean).join(' · ') || s.descripcion || 'Servicio general' }}</p>
          <div class="catalog-prices"><div><small>Costo</small><strong>{{ moneda(s.costo_base) }}</strong></div><div><small>Venta</small><strong>{{ moneda(s.precio_venta) }}</strong></div><div><small>Margen</small><strong>{{ margen(s) }}%</strong></div></div>
          <div class="catalog-meta"><span>Garantía: {{ s.garantia_dias || 0 }} días</span><span>{{ productoNombre(s.producto_id) }}</span></div>
          <div class="catalog-card-actions"><button type="button" @click="editar(s)">Editar</button><button type="button" @click="cambiarEstado(s)">{{ s.activo === false ? 'Activar' : 'Desactivar' }}</button></div>
        </article>
      </div>
    </article>
  </section>
</template>

<style scoped>
.catalog-form{margin-bottom:18px}.catalog-toolbar{display:grid;grid-template-columns:minmax(240px,1fr) 220px auto;gap:12px;align-items:center;margin-bottom:18px}.catalog-toolbar input,.catalog-toolbar select{width:100%;padding:12px 14px;border:1px solid var(--ts-border);border-radius:12px;background:var(--ts-surface);color:var(--ts-text)}.catalog-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:14px}.catalog-card{border:1px solid var(--ts-border);border-radius:16px;padding:17px;background:var(--ts-surface)}.catalog-card-top,.catalog-card-actions,.catalog-prices,.catalog-actions{display:flex;align-items:center;justify-content:space-between;gap:10px}.catalog-category,.catalog-status{font-size:.78rem;font-weight:700;padding:5px 9px;border-radius:999px;background:var(--ts-primary-soft);color:var(--ts-primary)}.catalog-status.off{background:#fee2e2;color:#b91c1c}.catalog-card h3{margin:14px 0 5px}.catalog-card p{min-height:40px;color:var(--ts-text-muted)}.catalog-prices{padding:14px 0;border-block:1px solid var(--ts-border)}.catalog-prices div{display:flex;flex-direction:column}.catalog-prices small,.catalog-meta{color:var(--ts-text-muted)}.catalog-meta{display:grid;gap:5px;padding:12px 0;font-size:.87rem}.catalog-card-actions button{border:0;background:transparent;color:var(--ts-primary);font-weight:700;cursor:pointer}.catalog-check{display:flex;gap:8px;align-items:center}.catalog-actions{grid-column:1/-1;justify-content:flex-end}.catalog-empty{text-align:center;padding:40px;color:var(--ts-text-muted)}@media(max-width:760px){.catalog-toolbar{grid-template-columns:1fr}.catalog-grid{grid-template-columns:1fr}}
</style>
