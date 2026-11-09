import { supabase } from '../lib/supabase'
import { monedaMX } from '../utils/tickets'

export async function guardarGastoOrden(orden, { concepto, monto, metodo, notas }) {
  const { error } = await supabase.from('movimientos_caja').insert({
    tipo: 'Salida', concepto, monto, metodo_pago: metodo,
    referencia_tipo: 'orden', referencia_id: String(orden.id),
    notas: [orden.folio, notas?.trim()].filter(Boolean).join(' · '),
  })
  if (error) throw error
  try {
    const { error: errorHistorial } = await supabase.from('orden_historial').insert({
      orden_id: orden.id, tipo: 'gasto', titulo: 'Gasto registrado',
      descripcion: `${concepto}: ${monedaMX(monto)} por ${metodo}.`,
    })
    return !errorHistorial
  } catch {
    return false
  }
}
