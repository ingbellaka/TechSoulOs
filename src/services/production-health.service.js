import { supabase } from '../lib/supabase'

const TABLES = [
  'perfiles', 'clientes', 'equipos', 'ordenes', 'checklist_orden',
  'garantias', 'productos', 'proveedores', 'ordenes_compra',
  'ventas', 'movimientos_caja', 'presupuestos'
]

export async function verificarProduccion() {
  const resultados = []
  for (const tabla of TABLES) {
    const { error, count } = await supabase
      .from(tabla)
      .select('*', { count: 'exact', head: true })
    resultados.push({ tabla, disponible: !error, registros: count ?? 0, error: error?.message || '' })
  }
  return resultados
}

export async function verificarSesionYPerfil() {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) throw sessionError
  const user = sessionData.session?.user
  if (!user) return { autenticado: false, perfil: null }
  const { data: perfil, error } = await supabase.from('perfiles').select('*').eq('id', user.id).single()
  if (error) throw error
  return { autenticado: true, perfil }
}
