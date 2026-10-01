export function calcularDescuentoOrden(subtotal, descuento = {}) {
  const base = Math.round(Number(subtotal || 0) * 100) / 100
  const valor = Number(descuento.valor || 0)
  const tipo = descuento.tipo || 'importe'
  let error = ''
  if (!Number.isFinite(base) || base < 0) error = 'Revisa los precios de los servicios.'
  else if (!['importe', 'porcentaje'].includes(tipo) || !Number.isFinite(valor) || valor < 0) error = 'Ingresa un descuento válido, mayor o igual a cero.'
  else if (tipo === 'porcentaje' && valor > 100) error = 'El descuento no puede superar el 100%.'
  else if (tipo === 'importe' && valor > base) error = 'El descuento no puede superar el subtotal.'
  const monto = error ? 0 : Math.round((tipo === 'porcentaje' ? base * valor / 100 : valor) * 100) / 100
  return { subtotal: base, monto, total: Math.round((base - monto) * 100) / 100, error }
}
