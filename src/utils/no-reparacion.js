export const MOTIVOS_NO_REPARACION = ['Sin reparación viable', 'No podemos realizar el servicio', 'Cliente no autorizó la cotización']
export const ESTADOS_DEVOLUCION = ['Pendiente de devolución', 'Devuelto sin reparación']

export function validarNoReparacion(datos, devolviendo = false) {
  if (!MOTIVOS_NO_REPARACION.includes(datos.motivo)) return 'Selecciona el motivo por el que no podemos continuar.'
  if (!String(datos.diagnostico || '').trim()) return 'Registra el diagnóstico y las pruebas realizadas.'
  if (!String(datos.explicacion || '').trim()) return 'Escribe una explicación clara para el cliente.'
  if (devolviendo && !String(datos.notas || '').trim()) return 'Registra a quién se devuelve el equipo y lo acordado sobre cobros o anticipos, incluso si no hubo pagos.'
  return ''
}

export function mensajeNoReparacion(orden) {
  const equipo = [orden.equipos?.marca, orden.equipos?.modelo].filter(Boolean).join(' ') || 'su equipo'
  const conclusion = orden.motivo_no_reparacion === 'Cliente no autorizó la cotización'
    ? 'Como no se autorizó la cotización, no realizaremos el trabajo propuesto.'
    : orden.motivo_no_reparacion === 'Sin reparación viable'
    ? 'Después de revisar su equipo, no encontramos una reparación viable.'
    : 'En esta ocasión no podremos realizar el trabajo solicitado.'
  return `Hola 💙 Le compartimos el resultado de la revisión.\n\n📱 *Equipo:* ${equipo}\n🔎 *Diagnóstico:* ${orden.diagnostico || ''}\n\n${conclusion}\n${orden.explicacion_no_reparacion || ''}\n\n${orden.estado === 'Devuelto sin reparación' ? 'Su equipo fue devuelto sin reparación.' : 'Su equipo está disponible para recoger.'}\nGracias por confiar en *TechSoul*. 💙`
}
