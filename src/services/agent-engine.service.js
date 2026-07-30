const clean = (value = '') => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
const money = (value) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(value || 0))
const words = (text) => clean(text).split(/[^a-z0-9]+/).filter(x => x.length > 2)
const textOf = (row) => clean(Object.values(row || {}).flat().join(' '))
const score = (query, row) => words(query).reduce((sum, word) => sum + (textOf(row).includes(word) ? 1 : 0), 0)
const best = (query, rows, min = 1) => rows.map(row => ({ row, score: score(query, row) })).filter(x => x.score >= min).sort((a,b) => b.score - a.score)

function detectIntent(question) {
  const q = clean(question)
  return {
    location: /donde|ubicacion|direccion|como llego/.test(q),
    hours: /horario|hora.*(abren|cierran)|abren|cierran/.test(q),
    price: /cuanto|precio|cuesta|cotiza|cotizacion/.test(q),
    stock: /tienen|hay|disponible|existencia/.test(q),
    warranty: /garantia|cubre/.test(q),
    wet: /mojo|mojado|agua|humedad/.test(q),
    motherboard: /placa|micro soldadura|microsoldadura|no enciende/.test(q),
    account: /icloud|cuenta|bloquead|liberar|imei|esim/.test(q),
    compare: /diferencia|incell|oled|soft oled/.test(q),
    repair: /repar|arregl|cambio|pantalla|bateria|carga|camara/.test(q)
  }
}

export function answerWithContext(question, context, agent = {}) {
  const q = clean(question)
  const intent = detectIntent(question)
  const sources = []
  let confidence = 45
  let transfer = false
  let reason = ''
  let answer = ''

  const approved = best(q, context.aprobadas || [], 2)[0]
  if (approved) {
    sources.push({ tipo: 'respuesta_aprobada', id: approved.row.id, titulo: approved.row.pregunta })
    return { answer: approved.row.respuesta, sources, confidence: 98, transfer: false, reason: '', intent: 'respuesta_aprobada' }
  }

  if (intent.location || intent.hours) {
    const n = context.negocio || {}
    const pieces = []
    if (intent.location) pieces.push(`Estamos en ${n.direccion || 'Blvd. Jardín de las Orquídeas 2584-B, Santa Fe, Culiacán'}.`)
    if (intent.hours) pieces.push(n.horario ? `Nuestro horario es ${n.horario}.` : 'Nuestro horario puede variar; te confirmamos antes de tu visita.')
    answer = pieces.join(' ')
    sources.push({ tipo: 'configuracion_negocio', id: n.id || 1, titulo: 'Datos del negocio' })
    confidence = 95
  }

  if (!answer && intent.compare) {
    const faq = best(q, context.faq || [], 1)[0]
    answer = faq?.row?.respuesta || 'INCELL es una opción más económica y funcional. OLED ofrece mejor contraste, negros más profundos y una imagen más cercana a la original. Soft OLED además es flexible y suele resistir mejor pequeños impactos que una OLED rígida.'
    if (faq) sources.push({ tipo: 'faq', id: faq.row.id, titulo: faq.row.pregunta })
    confidence = faq ? 94 : 78
  }

  if (!answer && intent.wet) {
    answer = 'Sí puede tener reparación, pero primero necesitamos revisarlo. No lo cargues, no lo enciendas y evita arroz o calor. Tráelo lo antes posible para desconectarlo, limpiarlo y diagnosticar daños por humedad.'
    transfer = true; reason = 'Equipo mojado: requiere revisión técnica presencial.'; confidence = 92
  }

  if (!answer && (intent.motherboard || intent.account)) {
    answer = intent.account
      ? 'Ese caso necesita revisión con los datos exactos del equipo y comprobación de propiedad. Te canalizo con una persona para confirmar el procedimiento disponible.'
      : 'Esa falla requiere diagnóstico técnico antes de confirmar costo o reparación. Te canalizo con el taller para revisar el equipo.'
    transfer = true; reason = intent.account ? 'Cuenta, liberación o IMEI.' : 'Posible falla de placa.'; confidence = 90
  }

  const serviceMatches = best(q, context.servicios || [], 1)
  const productMatches = best(q, context.productos || [], 1)
  if (!answer && (intent.price || intent.repair)) {
    const priced = serviceMatches.filter(x => Number(x.row.precio_venta || 0) > 0)
    if (priced.length) {
      const rows = priced.slice(0, 4).map(x => x.row)
      answer = rows.length === 1
        ? `${rows[0].nombre}${rows[0].modelo ? ` para ${rows[0].modelo}` : ''}: ${money(rows[0].precio_venta)}. ${rows[0].garantia_dias ? `Incluye ${rows[0].garantia_dias} días de garantía, sujeta a condiciones.` : ''}`
        : `Encontré estas opciones:\n${rows.map(r => `• ${r.nombre}${r.modelo ? ` · ${r.modelo}` : ''}${r.variante ? ` · ${r.variante}` : ''}: ${money(r.precio_venta)}`).join('\n')}\n\nConfírmame el modelo exacto y la calidad que prefieres para darte la opción correcta.`
      rows.forEach(r => sources.push({ tipo: 'catalogo_servicios', id: r.id, titulo: `${r.nombre} ${r.modelo || ''}`.trim() }))
      confidence = 90
    } else {
      answer = 'Para cotizarte correctamente necesito el modelo exacto del equipo y el servicio que necesitas. No quiero inventarte un precio que no esté registrado.'
      confidence = 62
    }
  }

  if (!answer && intent.stock) {
    const available = productMatches.filter(x => Number(x.row.stock || 0) > 0).slice(0, 4)
    if (available.length) {
      answer = `Sí encontré existencia registrada:\n${available.map(x => `• ${x.row.nombre}: ${x.row.stock} pieza(s)`).join('\n')}\n\nLa disponibilidad puede cambiar; te la confirmamos antes de acudir.`
      available.forEach(x => sources.push({ tipo: 'productos', id: x.row.id, titulo: x.row.nombre }))
      confidence = 88
    } else {
      answer = 'No encontré una existencia confirmada con esos datos. Dime el modelo exacto y la pieza que necesitas para revisarlo sin asumir disponibilidad.'
      confidence = 58
    }
  }

  if (!answer) {
    const faq = best(q, context.faq || [], 1)[0]
    const template = best(q, context.plantillas || [], 1)[0]
    const selected = faq?.score >= (template?.score || 0) ? faq : template
    if (selected?.row) {
      answer = selected.row.respuesta || selected.row.contenido
      sources.push({ tipo: selected.row.pregunta ? 'faq' : 'plantilla', id: selected.row.id, titulo: selected.row.pregunta || selected.row.nombre })
      confidence = 82
    }
  }

  if (!answer) {
    answer = 'Con gusto te ayudo. Dime el modelo exacto de tu equipo y qué falla presenta para buscar información registrada y darte una respuesta confiable.'
    confidence = 42
  }

  const name = agent.nombre || 'Soul'
  return { answer: `${answer}\n\n— ${name}, asistente de TechSoul`, sources, confidence, transfer, reason, intent: Object.entries(intent).find(([,v]) => v)?.[0] || 'general' }
}
