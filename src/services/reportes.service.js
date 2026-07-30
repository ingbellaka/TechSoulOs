import { supabase } from '../lib/supabase'

const todayKey = () => new Date().toISOString().slice(0, 10)
const money = value => Number(value || 0)
const dateOf = row => String(row.fecha_movimiento || row.fecha_ingreso || row.fecha || row.created_at || '').slice(0, 10)

function startOfWeekKey() {
  const d = new Date()
  const day = d.getDay() || 7
  d.setDate(d.getDate() - day + 1)
  d.setHours(0, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}

function startOfMonthKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

async function table(name, orderField = 'created_at') {
  let response = await supabase.from(name).select('*').order(orderField, { ascending: false })
  if (response.error && orderField !== 'created_at') response = await supabase.from(name).select('*').order('created_at', { ascending: false })
  if (response.error) throw new Error(response.error.message)
  return response.data || []
}

export async function cargarAnalitica() {
  const [ordenes, caja, productos, servicios, garantias, clientes] = await Promise.all([
    table('ordenes', 'fecha_ingreso'),
    table('movimientos_caja', 'fecha_movimiento'),
    table('productos'),
    table('orden_servicios'),
    table('garantias'),
    table('clientes')
  ])

  const today = todayKey(), week = startOfWeekKey(), month = startOfMonthKey()
  const entradas = caja.filter(x => String(x.tipo || '').toLowerCase() === 'entrada')
  const salidas = caja.filter(x => String(x.tipo || '').toLowerCase() === 'salida')
  const sumFrom = (rows, start) => rows.filter(x => dateOf(x) >= start).reduce((s, x) => s + money(x.monto), 0)
  const totalOrdenes = ordenes.reduce((s, x) => s + money(x.costo_total), 0)
  const costoServicios = servicios.reduce((s, x) => s + money(x.costo || x.costo_base), 0)
  const gastosMes = sumFrom(salidas, month)
  const ingresosMes = sumFrom(entradas, month)

  const estados = ordenes.reduce((acc, x) => {
    const key = x.estado || 'Sin estado'; acc[key] = (acc[key] || 0) + 1; return acc
  }, {})
  const serviciosTop = Object.values(servicios.reduce((acc, x) => {
    const key = x.tipo || x.descripcion || 'Servicio'
    acc[key] ||= { nombre: key, cantidad: 0, importe: 0 }
    acc[key].cantidad += 1; acc[key].importe += money(x.precio)
    return acc
  }, {})).sort((a, b) => b.cantidad - a.cantidad)

  const ultimos7 = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    ultimos7.push({
      fecha: key,
      label: d.toLocaleDateString('es-MX', { weekday: 'short' }),
      ingresos: entradas.filter(x => dateOf(x) === key).reduce((s, x) => s + money(x.monto), 0),
      salidas: salidas.filter(x => dateOf(x) === key).reduce((s, x) => s + money(x.monto), 0)
    })
  }

  return {
    kpis: {
      ventasHoy: sumFrom(entradas, today),
      ventasSemana: sumFrom(entradas, week),
      ventasMes: ingresosMes,
      gastosMes,
      flujoMes: ingresosMes - gastosMes,
      utilidadEstimada: totalOrdenes - costoServicios - gastosMes,
      saldoPendiente: ordenes.reduce((s, x) => s + Math.max(0, money(x.costo_total) - money(x.anticipo)), 0),
      ordenesAbiertas: ordenes.filter(x => !['Entregado', 'Cancelado'].includes(x.estado)).length,
      ordenesListas: ordenes.filter(x => String(x.estado).toLowerCase().includes('list')).length,
      garantiasActivas: garantias.filter(x => x.activa !== false).length,
      inventarioCritico: productos.filter(x => money(x.stock) <= money(x.stock_minimo)).length,
      clientes: clientes.length,
      ticketPromedio: ordenes.length ? totalOrdenes / ordenes.length : 0
    },
    ordenes, caja, productos, servicios, garantias, clientes, estados, serviciosTop, ultimos7
  }
}

export function descargarCsv(nombre, rows) {
  const escape = value => `"${String(value ?? '').replace(/"/g, '""')}"`
  const csv = '\uFEFF' + rows.map(row => row.map(escape).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a'); a.href = url; a.download = nombre; a.click(); URL.revokeObjectURL(url)
}
