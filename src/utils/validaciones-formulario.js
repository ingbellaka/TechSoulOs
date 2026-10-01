export function normalizarTelefono(valor) {
  const digitos = String(valor || '').replace(/\D/g, '')
  return digitos.length === 12 && digitos.startsWith('52') ? digitos.slice(2) : digitos
}

export function validarContacto(datos) {
  if (String(datos.nombre || '').trim().length < 2) return 'Escribe el nombre del cliente (mínimo 2 caracteres).'
  if (!/^\d{10}$/.test(normalizarTelefono(datos.telefono))) return 'El teléfono debe tener exactamente 10 dígitos, sin +52.'
  if (String(datos.whatsapp || '').trim() && !/^\d{10}$/.test(normalizarTelefono(datos.whatsapp))) return 'WhatsApp debe tener exactamente 10 dígitos, sin +52.'
  if (String(datos.correo || '').trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(datos.correo).trim())) return 'Escribe un correo electrónico válido.'
  return ''
}
