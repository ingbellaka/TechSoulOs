export const paymentMethods = ['Efectivo', 'Transferencia', 'Tarjeta', 'Mercado Pago', 'Otro']
export const cents = value => Math.round(Number(value) * 100)

export function validateCheckout(order, payments, deliver = false) {
  if (!order || ['Entregado', 'Cancelado', 'Devuelto sin reparación'].includes(order.estado)) throw new Error('Esta orden está cerrada.')
  const cost = cents(order.costo_total || 0), paid = cents(order.anticipo || 0)
  if (!Number.isSafeInteger(cost) || !Number.isSafeInteger(paid) || cost < 0 || paid < 0) throw new Error('Revisa los importes de la orden.')
  if (!Array.isArray(payments) || payments.some(p => !paymentMethods.includes(p.metodo) || !Number.isFinite(Number(p.monto)) || cents(p.monto) <= 0)) throw new Error('Revisa los métodos y los importes de pago.')
  const total = payments.reduce((sum, p) => sum + cents(p.monto), 0)
  if (total > Math.max(0, cost - paid)) throw new Error('El pago supera el saldo pendiente.')
  const balance = Math.max(0, cost - paid - total)
  if (deliver && (order.estado !== 'Listo' || balance > 0)) throw new Error('Para entregar, el equipo debe estar Listo y sin saldo pendiente.')
  if (!deliver && total <= 0) throw new Error('Captura un pago mayor a cero.')
  return { total: total / 100, paid: (paid + total) / 100, balance: balance / 100 }
}
