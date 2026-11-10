export function destinoRespuestaCliente(respuesta) {
  if (respuesta === 'autoriza') return 'Esperando pieza'
  if (respuesta === 'rechaza') return 'Pendiente de devolución'
  return ''
}
export function pruebasAprobadas(controles) {
  return controles.length > 0 && controles.every(c => ['Funciona', 'No aplica'].includes(c.estado))
}
