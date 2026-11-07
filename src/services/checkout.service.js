import { supabase } from '../lib/supabase'
import { validateCheckout } from '../utils/checkout'

export async function checkoutOrder(order, payments, deliver, operationId) {
  validateCheckout(order, payments, deliver)
  const { data, error } = await supabase.rpc('cobrar_entregar_orden', {
    p_orden_id: order.id, p_pagos: payments, p_entregar: deliver,
    p_operacion: operationId, p_total_esperado: Number(order.costo_total || 0),
    p_pagado_esperado: Number(order.anticipo || 0), p_estado_esperado: order.estado
  })
  if (error) throw Object.assign(new Error(error.message), { code: error.code })
  return data
}
