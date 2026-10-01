export function destinoRespuestaCliente(respuesta, faltaRefaccion) {
  if (respuesta === 'autoriza') return faltaRefaccion ? 'Esperando pieza' : 'En reparación'
  if (respuesta === 'rechaza') return 'Pendiente de devolución'
  return ''
}
export function pruebasAprobadas(controles) {
  return controles.length > 0 && controles.every(c => ['Funciona', 'No aplica'].includes(c.estado))
}
