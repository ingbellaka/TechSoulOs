export function monedaMX(valor) {
  return Number(valor || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
}

export function fechaTicket(valor) {
  const d = valor ? new Date(valor) : new Date()
  return d.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })
}



export function redondearMoneda(valor) {
  return Math.round((Number(valor || 0) + Number.EPSILON) * 100) / 100
}

export function normalizarSaldo(valor) {
  const saldo = redondearMoneda(valor)
  // Corrige residuos históricos mínimos (1 a 5 centavos) que quedaron en ventas antiguas.
  return saldo > 0 && saldo <= 0.05 ? 0 : Math.max(0, saldo)
}

export function folioRecibo(movimiento) {
  return `RP-${String(movimiento?.id || 0).padStart(6, '0')}`
}

export function buildReciboOrden({ movimiento, orden, negocio = {}, pagadoAnterior = 0 }) {
  const total = Number(orden?.costo_total || 0)
  const pago = Number(movimiento?.monto || 0)
  const saldo = normalizarSaldo(total - pagadoAnterior - pago)
  const tipoPago = pagadoAnterior <= 0 ? 'Anticipo' : saldo <= 0 ? 'Liquidación' : 'Abono'
  const equipo = [orden?.equipos?.marca, orden?.equipos?.modelo].filter(Boolean).join(' ') || 'Equipo'
  return {
    kind: 'order-payment',
    title: 'RECIBO DE PAGO',
    folio: folioRecibo(movimiento),
    reference: orden?.folio || `Orden #${orden?.id || ''}`,
    date: movimiento?.fecha_movimiento || movimiento?.created_at || new Date().toISOString(),
    client: orden?.clientes?.nombre || 'Cliente',
    phone: orden?.clientes?.telefono || orden?.clientes?.whatsapp || '',
    equipment: equipo,
    conceptLabel: tipoPago,
    lines: [{ description: `${tipoPago} de orden de servicio`, amount: pago }],
    totalService: total,
    previousPaid: pagadoAnterior,
    paymentReceived: pago,
    balance: saldo,
    paymentMethod: movimiento?.metodo_pago || 'No especificado',
    warrantyDays: Number(orden?.garantia_dias || 0),
    business: normalizeBusiness(negocio)
  }
}

export function buildTicketVenta({ venta, items = [], negocio = {} }) {
  return {
    kind: 'sale',
    title: 'TICKET DE VENTA',
    folio: venta?.folio || `V-${String(venta?.id || 0).padStart(5, '0')}`,
    reference: '',
    date: venta?.fecha_venta || venta?.created_at || new Date().toISOString(),
    client: venta?.cliente_nombre || 'Cliente de mostrador',
    phone: venta?.cliente_telefono || '',
    equipment: '',
    lines: items.map(i => ({
      description: i.descripcion || 'Concepto',
      quantity: Number(i.cantidad || 1),
      unitPrice: Number(i.precio_unitario || 0),
      amount: Number(i.subtotal ?? (Number(i.cantidad || 1) * Number(i.precio_unitario || 0)))
    })),
    totalService: Number(venta?.total || 0),
    previousPaid: 0,
    paymentReceived: Number(venta?.pagado ?? venta?.anticipo ?? venta?.total ?? 0),
    balance: normalizarSaldo(venta?.saldo ?? (Number(venta?.total || 0) - Number(venta?.pagado ?? venta?.anticipo ?? 0))),
    paymentMethod: venta?.metodo_pago || 'No especificado',
    warrantyDays: 0,
    business: normalizeBusiness(negocio)
  }
}

export function buildTicketOrdenServicio({ orden, negocio = {}, paymentMethod = '' }) {
  const total = redondearMoneda(orden?.costo_total || 0)
  const pagado = redondearMoneda(orden?.anticipo || 0)
  const saldo = normalizarSaldo(total - pagado)
  const modelo = orden?.equipos?.modelo || orden?.equipos?.marca || 'Equipo'
  const reparacion = orden?.trabajo_realizado || orden?.tipo_servicio || orden?.falla_reportada || 'Reparación por definir'
  const garantiaDias = Number(orden?.garantia_dias || 90)

  return {
    kind: 'service-order',
    title: 'COMPROBANTE DE PAGO',
    folio: orden?.folio || `TS-${String(orden?.id || 0).padStart(6, '0')}`,
    reference: '',
    date: orden?.fecha_ingreso || orden?.created_at || new Date().toISOString(),
    client: orden?.clientes?.nombre || 'Cliente',
    phone: orden?.clientes?.telefono || orden?.clientes?.whatsapp || '',
    model: modelo,
    repair: reparacion,
    warrantyDays: garantiaDias,
    totalService: total,
    paymentReceived: pagado,
    balance: saldo,
    isPaid: saldo <= 0,
    paymentMethod: paymentMethod || orden?.metodo_pago || orden?.forma_pago || 'No especificado',
    business: normalizeBusiness(negocio),
    conditions: [
      '90 días de garantía a partir de que se le notificó.',
      'Después de 30 días de almacenamiento se cobrará un costo extra de $50.',
      'Garantía únicamente en la reparación si presenta defectos de fábrica, no por golpes, uso indebido o daños por terceros.'
    ]
  }
}

export function normalizeBusiness(negocio = {}) {
  return {
    name: negocio.nombre_negocio || 'TechSoul',
    address: negocio.direccion || 'Blvd. Jardín de las Orquídeas 2584-B',
    phone: negocio.telefono || negocio.whatsapp || '667 748 7373',
    whatsapp: negocio.whatsapp || negocio.telefono || '667 748 7373',
    logo: '/brand/techsoul-logo-ticket.png'
  }
}

export function ticketWhatsappText(ticket) {
  const lineas = ticket?.kind === 'service-order' ? [
    `*${ticket.title}*`,
    `Folio: ${ticket.folio}`,
    `Nombre: ${ticket.client}`,
    `Número: ${ticket.phone || '—'}`,
    `Modelo: ${ticket.model || '—'}`,
    `Reparación: ${ticket.repair || '—'}`,
    `Garantía: ${ticket.warrantyDays} días`,
    `Pago: ${monedaMX(ticket.totalService)}`,
    !ticket.isPaid ? `Anticipo: ${monedaMX(ticket.paymentReceived)}` : '',
    !ticket.isPaid ? `Resto: ${monedaMX(ticket.balance)}` : '',
    `Método de pago: ${ticket.paymentMethod || 'No especificado'}`,
    '',
    'Gracias por tu confianza. — TechSoul'
  ] : [
    `*${ticket.title}*`,
    `Folio: ${ticket.folio}`,
    ticket.reference ? `Orden: ${ticket.reference}` : '',
    `Cliente: ${ticket.client}`,
    ticket.equipment ? `Equipo: ${ticket.equipment}` : '',
    `Pago: ${monedaMX(ticket.paymentReceived)}`,
    `Método: ${ticket.paymentMethod}`,
    ticket.balance > 0 ? `Saldo pendiente: ${monedaMX(ticket.balance)}` : 'Saldo pendiente: $0.00',
    '',
    'Gracias por tu confianza. — TechSoul'
  ]
  return lineas.filter(Boolean).join('\n')
}
