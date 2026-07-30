/*
 * TechSoul OS local data adapter.
 * Implements the small Supabase API subset used by the frontend, backed by localStorage.
 * Replace this file with the real Supabase client when the backend is connected.
 */

const DB_KEY = 'techsoul_os_local_db_v2'
const SESSION_KEY = 'techsoul_os_local_session'
const FILE_KEY = 'techsoul_os_local_files'

const now = () => new Date().toISOString()

const seed = () => ({
  perfiles: [{ id: 'local-admin', nombre: 'Yuliana', rol: 'Administrador', email: 'admin@techsoul.local' }],
  clientes: [
    { id: 1, nombre: 'Cliente demostración', telefono: '6677487373', whatsapp: '6677487373', email: '', notas: 'Registro local de ejemplo', created_at: now() }
  ],
  equipos: [
    { id: 1, cliente_id: 1, tipo_equipo: 'Celular', marca: 'Apple', modelo: 'iPhone 14 Pro', color: 'Negro', imei_serie: 'DEMO-001', codigo_bloqueo: '', observaciones: 'Equipo de demostración', created_at: now() }
  ],
  ordenes: [
    { id: 1, folio: 'TS-0001', cliente_id: 1, equipo_id: 1, falla_reportada: 'Pantalla dañada', diagnostico: 'Pendiente de confirmar', trabajo_realizado: '', costo_total: 2500, anticipo: 1000, estado: 'Diagnóstico', tecnico: 'Jorge', notas: 'Orden local de ejemplo', fecha_ingreso: now(), created_at: now(), garantia_dias: 90, garantia_condiciones: 'Garantía en funcionamiento del touch.' }
  ],
  checklist_orden: [
    { id: 1, orden_id: 1, item: 'Pantalla y touch', estado: 'No funciona', notas: 'Cristal roto' },
    { id: 2, orden_id: 1, item: 'Carga', estado: 'Funciona', notas: '' },
    { id: 3, orden_id: 1, item: 'Cámaras', estado: 'Funciona', notas: '' }
  ],
  evidencias: [],
  movimientos_inventario: [],
  reclamaciones_garantia: [],
  garantias: [{ id: 1, orden_id: 1, tipo_servicio: 'Pantalla', dias_garantia: 90, condiciones: 'Garantía en touch. No cubre golpes ni humedad.', activa: true, created_at: now() }],
  configuracion_garantias: [
    { id: 1, tipo_servicio: 'Pantalla', dias_garantia: 90, condiciones: 'Garantía en touch. No cubre golpes ni humedad.', activo: true },
    { id: 2, tipo_servicio: 'Batería alta capacidad', dias_garantia: 180, condiciones: 'Garantía por defecto de fabricación.', activo: true },
    { id: 3, tipo_servicio: 'Reparación', dias_garantia: 30, condiciones: 'Garantía sobre el trabajo realizado.', activo: true }
  ],
  movimientos_caja: [{ id: 1, tipo: 'Entrada', concepto: 'Anticipo orden TS-0001', monto: 1000, metodo_pago: 'Efectivo', referencia_tipo: 'orden', referencia_id: 1, notas: '', created_at: now() }],
  firmas_orden: [],
  catalogo_servicios: [
    { id: 1, nombre: 'Cambio de pantalla', categoria: 'Pantallas', descripcion: '', marca: '', modelo: '', variante: '', costo_base: 0, precio_venta: 0, garantia_dias: 90, activo: true, producto_id: null, cantidad_producto: 1, creado_en: now(), actualizado_en: now() },
    { id: 2, nombre: 'Cambio de batería', categoria: 'Baterías', descripcion: '', marca: '', modelo: '', variante: '', costo_base: 0, precio_venta: 0, garantia_dias: 90, activo: true, producto_id: null, cantidad_producto: 1, creado_en: now(), actualizado_en: now() }
  ],
  productos: [
    { id: 1, nombre: 'Pantalla iPhone 14 Pro OLED', categoria: 'Pantallas', sku: 'PAN-IP14P-OLED', stock: 2, stock_minimo: 1, costo: 1800, precio_venta: 2950, proveedor: 'Proveedor local', created_at: now() }
  ],
  presupuestos: [], ventas: [], detalle_ventas: [], solicitudes_compra: [], proveedores: [], ordenes_compra: [], ordenes_compra_detalle: [],
  configuracion_negocio: [{ id: 1, nombre_negocio: 'TechSoul', telefono: '6677487373', whatsapp: '6677487373', direccion: 'Blvd. Jardín de las Orquídeas 2584-B, Santa Fe, Culiacán', moneda: 'MXN', garantia_default_dias: 90, prefijo_folio: 'TS' }],
  faq: [
    { id: 1, pregunta: '¿Dónde están ubicados?', respuesta: 'Estamos en Blvd. Jardín de las Orquídeas 2584-B, Santa Fe, Culiacán.', categoria: 'Ubicación', palabras_clave: ['ubicación','dirección'], prioridad: 100, activo: true, creado_en: now() },
    { id: 2, pregunta: '¿Qué diferencia hay entre INCELL y OLED?', respuesta: 'INCELL es una opción económica; OLED ofrece mejor contraste y negros.', categoria: 'Pantallas', palabras_clave: ['incell','oled'], prioridad: 90, activo: true, creado_en: now() }
  ],
  promociones: [],
  plantillas_respuesta: [
    { id: 1, nombre: 'Cotización pantalla', categoria: 'Cotización', contenido: 'Para cotizarte correctamente necesito el modelo exacto y saber si imagen y touch funcionan.', palabras_clave: ['pantalla','display'], activo: true, creado_en: now() }
  ],
  auditoria: [],
  usuarios: [
    { id: 1, nombre: 'Yuliana Arredondo', email: 'admin@techsoul.local', rol: 'Administrador', activo: true, created_at: now() },
    { id: 2, nombre: 'Jorge Ortegon', email: 'jorge@techsoul.local', rol: 'Técnico', activo: true, created_at: now() }
  ], conversaciones: [], automatizaciones: [], orden_historial: [
    { id: 1, orden_id: 1, tipo: 'creacion', titulo: 'Orden creada', descripcion: 'La orden fue registrada localmente.', estado_anterior: null, estado_nuevo: 'Diagnóstico', usuario_id: 'local-admin', created_at: now() }
  ]
})

function readDb() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DB_KEY) || 'null')
    if (parsed) return { ...seed(), ...parsed }
  } catch (_) {}
  const initial = seed()
  localStorage.setItem(DB_KEY, JSON.stringify(initial))
  return initial
}

function writeDb(db) { localStorage.setItem(DB_KEY, JSON.stringify(db)) }
function nextId(rows) { return Math.max(0, ...rows.map(r => Number(r.id) || 0)) + 1 }
function clone(value) { return JSON.parse(JSON.stringify(value)) }

function relationRow(table, row, db) {
  const result = { ...row }
  if (table === 'ordenes') {
    result.clientes = db.clientes.find(x => x.id == row.cliente_id) || null
    result.equipos = db.equipos.find(x => x.id == row.equipo_id) || null
    result.saldo = Math.max(0, Number(row.costo_total || 0) - Number(row.anticipo || 0))
  }
  if (table === 'equipos') result.clientes = db.clientes.find(x => x.id == row.cliente_id) || null
  if (table === 'ordenes_compra') result.proveedores = db.proveedores.find(x => x.id == row.proveedor_id) || null
  return result
}

class QueryBuilder {
  constructor(table) {
    this.table = table
    this.action = 'select'
    this.payload = null
    this.filters = []
    this.orderBy = null
    this.wantSingle = false
    this.countMode = false
    this.head = false
    this.limitCount = null
    this.rangeStart = null
    this.rangeEnd = null
  }
  select(_columns = '*', options = {}) { this.countMode = options.count === 'exact'; this.head = !!options.head; return this }
  insert(payload) { this.action = 'insert'; this.payload = payload; return this }
  update(payload) { this.action = 'update'; this.payload = payload; return this }
  delete() { this.action = 'delete'; return this }
  eq(field, value) { this.filters.push(row => row?.[field] == value); return this }
  neq(field, value) { this.filters.push(row => row?.[field] != value); return this }
  gt(field, value) { this.filters.push(row => row?.[field] > value); return this }
  gte(field, value) { this.filters.push(row => row?.[field] >= value); return this }
  lt(field, value) { this.filters.push(row => row?.[field] < value); return this }
  lte(field, value) { this.filters.push(row => row?.[field] <= value); return this }
  is(field, value) { this.filters.push(row => row?.[field] === value); return this }
  in(field, values) { this.filters.push(row => values.includes(row?.[field])); return this }
  like(field, pattern) {
    const escaped = String(pattern ?? '')
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/%/g, '.*')
      .replace(/_/g, '.')
    const regex = new RegExp(`^${escaped}$`, 'i')
    this.filters.push(row => regex.test(String(row?.[field] ?? '')))
    return this
  }
  ilike(field, pattern) { return this.like(field, pattern) }
  contains(field, value) {
    this.filters.push(row => {
      const current = row?.[field]
      if (Array.isArray(current)) return Array.isArray(value) ? value.every(v => current.includes(v)) : current.includes(value)
      if (current && typeof current === 'object' && value && typeof value === 'object') return Object.entries(value).every(([k, v]) => current[k] === v)
      return false
    })
    return this
  }
  limit(count) { this.limitCount = Math.max(0, Number(count) || 0); return this }
  range(start, end) { this.rangeStart = Math.max(0, Number(start) || 0); this.rangeEnd = Math.max(this.rangeStart, Number(end) || 0); return this }
  order(field, options = {}) { this.orderBy = { field, ascending: options.ascending !== false }; return this }
  single() { this.wantSingle = true; return this }
  maybeSingle() { this.wantSingle = true; return this }
  async execute() {
    try {
      const db = readDb()
      if (!Array.isArray(db[this.table])) db[this.table] = []
      const rows = db[this.table]
      const matches = row => this.filters.every(fn => fn(row))
      let data = null

      if (this.action === 'select') {
        let selected = rows.filter(matches).map(row => relationRow(this.table, row, db))
        if (this.orderBy) {
          const { field, ascending } = this.orderBy
          selected.sort((a, b) => {
            const av = a[field] ?? ''; const bv = b[field] ?? ''
            return (av > bv ? 1 : av < bv ? -1 : 0) * (ascending ? 1 : -1)
          })
        }
        if (this.rangeStart !== null) selected = selected.slice(this.rangeStart, this.rangeEnd + 1)
        if (this.limitCount !== null) selected = selected.slice(0, this.limitCount)
        if (this.head) data = null
        else data = this.wantSingle ? (selected[0] || null) : clone(selected)
        return { data, error: this.wantSingle && !data ? { message: 'Registro no encontrado' } : null, count: this.countMode ? selected.length : null }
      }

      if (this.action === 'insert') {
        const list = Array.isArray(this.payload) ? this.payload : [this.payload]
        const inserted = list.map(item => {
          const row = { id: item.id ?? nextId(rows), created_at: item.created_at || now(), ...clone(item) }
          if (this.table === 'movimientos_caja' && !row.fecha_movimiento) row.fecha_movimiento = now()
          if (this.table === 'ordenes_compra' && !row.fecha_orden) row.fecha_orden = now()
          if (this.table === 'movimientos_inventario' && !row.fecha_movimiento) row.fecha_movimiento = now()
          return row
        })
        rows.push(...inserted)
        writeDb(db)
        data = this.wantSingle ? relationRow(this.table, inserted[0], db) : inserted.map(row => relationRow(this.table, row, db))
        return { data: clone(data), error: null }
      }

      if (this.action === 'update') {
        const updated = []
        rows.forEach((row, index) => {
          if (matches(row)) {
            rows[index] = { ...row, ...clone(this.payload), updated_at: now() }
            updated.push(rows[index])
          }
        })
        writeDb(db)
        data = this.wantSingle ? (updated[0] || null) : updated
        return { data: clone(data), error: null }
      }

      if (this.action === 'delete') {
        const removed = rows.filter(matches)
        db[this.table] = rows.filter(row => !matches(row))
        writeDb(db)
        return { data: clone(removed), error: null }
      }
      return { data: null, error: null }
    } catch (error) { return { data: null, error: { message: error.message } } }
  }
  then(resolve, reject) { return this.execute().then(resolve, reject) }
}

const defaultUser = { id: 'local-admin', email: 'admin@techsoul.local', user_metadata: { nombre: 'Yuliana' } }
function getSessionValue() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null') || { user: defaultUser } } catch (_) { return { user: defaultUser } }
}

export const supabase = {
  from(table) { return new QueryBuilder(table) },
  auth: {
    async getSession() { return { data: { session: getSessionValue() }, error: null } },
    async getUser() { const session = getSessionValue(); return { data: { user: session?.user || null }, error: null } },
    async signInWithPassword({ email }) { const user = { ...defaultUser, email: email || defaultUser.email }; const session = { user }; localStorage.setItem(SESSION_KEY, JSON.stringify(session)); return { data: { user, session }, error: null } },
    async signUp({ email }) { const user = { ...defaultUser, email: email || defaultUser.email }; const session = { user }; localStorage.setItem(SESSION_KEY, JSON.stringify(session)); return { data: { user, session }, error: null } },
    async signOut() { localStorage.removeItem(SESSION_KEY); return { error: null } },
    onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } } }
  },
  storage: {
    from(bucket) {
      return {
        async upload(path, file) {
          try {
            const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file) })
            const files = JSON.parse(localStorage.getItem(FILE_KEY) || '{}')
            files[`${bucket}/${path}`] = dataUrl
            try { localStorage.setItem(FILE_KEY, JSON.stringify(files)) } catch (_) { return { data: null, error: { message: 'La imagen es demasiado pesada para el almacenamiento local.' } } }
            return { data: { path }, error: null }
          } catch (error) { return { data: null, error: { message: error.message } } }
        },
        getPublicUrl(path) { const files = JSON.parse(localStorage.getItem(FILE_KEY) || '{}'); return { data: { publicUrl: files[`${bucket}/${path}`] || '' } } }
      }
    }
  }
}

export function resetLocalDatabase() {
  localStorage.setItem(DB_KEY, JSON.stringify(seed()))
  localStorage.removeItem(FILE_KEY)
}
