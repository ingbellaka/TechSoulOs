<script setup>
import { computed } from 'vue'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import { monedaMX, fechaTicket } from '../../utils/tickets'

const props = defineProps({
  ticket: { type: Object, default: null }
})
const emit = defineEmits(['close'])

const telefonoWhatsApp = computed(() => String(props.ticket?.phone || '').replace(/\D/g, ''))

function esc(v) {
  return String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;')
}

function ticketHtml(autoPrint = false, copy = 'client') {
  const t = props.ticket
  if (!t) return ''
  const isServiceOrder = t.kind === 'service-order'
  const isTechSoulCopy = isServiceOrder && copy === 'techsoul'
  const copyLabel = isServiceOrder ? (isTechSoulCopy ? 'COPIA TECHSOUL' : 'COPIA CLIENTE') : ''
  const logo = t.business?.logo || '/brand/techsoul-logo-ticket.png'
  const lineas = (t.lines || []).map(l => `<tr><td><b>${esc(l.description)}</b>${l.quantity ? `<small>${l.quantity} × ${monedaMX(l.unitPrice)}</small>` : ''}</td><td>${l.hideAmount ? '' : monedaMX(l.amount)}</td></tr>`).join('')
  const condiciones = (t.conditions || []).map(c => `<li>${esc(c)}</li>`).join('')
  const orderTotals = t.kind === 'order-payment' ? `
    <div class="sum"><span>Total del servicio</span><b>${monedaMX(t.totalService)}</b></div>
    ${t.previousPaid > 0 ? `<div class="sum"><span>Pagado anteriormente</span><b>${monedaMX(t.previousPaid)}</b></div>` : ''}
    <div class="sum"><span>Pago recibido</span><b>${monedaMX(t.paymentReceived)}</b></div>
    <div class="sum balance"><span>Saldo pendiente</span><b>${monedaMX(t.balance)}</b></div>` : t.kind === 'service-order' ? `
    <div class="sum total"><span>Pago</span><b>${monedaMX(t.totalService)}</b></div>
    ${!t.isPaid ? `<div class="sum"><span>Anticipo</span><b>${monedaMX(t.paymentReceived)}</b></div><div class="sum balance"><span>Resto</span><b>${monedaMX(t.balance)}</b></div>` : ''}
    <div class="payment"><span>Método de pago</span><b>${esc(t.paymentMethod || 'No especificado')}</b></div>` : `
    <div class="sum total"><span>Total</span><b>${monedaMX(t.totalService)}</b></div>
    ${t.balance > 0 ? `<div class="sum"><span>Pagado</span><b>${monedaMX(t.paymentReceived)}</b></div><div class="sum balance"><span>Saldo</span><b>${monedaMX(t.balance)}</b></div>` : ''}`

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(t.title)} ${esc(t.folio)}</title><style>
  @page{size:57mm auto;margin:0}*{box-sizing:border-box}html,body{width:57mm!important;margin:0!important;padding:0!important;background:#fff!important;color:#000!important;font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}.ticket{width:57mm!important;padding:3mm 4mm 4mm!important;margin:0!important;background:#fff!important;color:#000!important;font-size:10.5px!important;font-weight:600;line-height:1.38}.logo{display:block;width:auto;max-width:35mm;max-height:11mm;object-fit:contain;margin:0 auto 1.5mm;filter:grayscale(1) contrast(2)}.business{text-align:center;color:#000!important;font-size:9px;font-weight:700;line-height:1.35}.business b{font-weight:900}.title{text-align:center;border-top:1.5px dashed #000;border-bottom:1.5px dashed #000;margin:2.5mm 0 2.2mm;padding:2mm 0}.title h1{font-size:11px!important;font-weight:900;letter-spacing:.055em;margin:0 0 1mm;white-space:normal}.title b{font-size:10px;font-weight:900}.title div{font-size:9px;font-weight:700}.copy-label{font-size:8px!important;font-weight:900;letter-spacing:.1em;margin-bottom:.8mm}.meta{display:grid;grid-template-columns:13mm 1fr;gap:1.2mm 1.5mm;margin:0 0 2.2mm}.meta span{color:#000!important;font-size:9.5px;font-weight:700}.meta b{font-size:10.5px;font-weight:900;overflow-wrap:anywhere;word-break:normal}.section{font-size:9px;letter-spacing:.08em;font-weight:900;margin:2mm 0 1mm}.items{width:100%;border-collapse:collapse;border-top:1.5px solid #000;border-bottom:1.5px solid #000}.items td{padding:1.6mm 0;vertical-align:top;font-size:10px;font-weight:700}.items td:last-child{text-align:right;white-space:nowrap;font-weight:900}.items small{display:block;color:#000!important;font-size:9px;font-weight:700;margin-top:.5mm}.sum{display:flex;justify-content:space-between;align-items:baseline;gap:2mm;padding:.9mm 0;font-size:10.5px;font-weight:700}.sum b{font-size:11px;font-weight:900;white-space:nowrap}.sum.total{font-size:12px;font-weight:900;border-top:1.5px solid #000;margin-top:1mm;padding-top:1.5mm}.sum.total b{font-size:13px}.sum.balance{font-size:11.5px;font-weight:900}.sum.balance b{font-size:12.5px}.payment{border-top:1.5px dashed #000;border-bottom:1.5px dashed #000;padding:1.6mm 0;margin:1.7mm 0;display:flex;justify-content:space-between;gap:2mm;font-size:9.5px;font-weight:700}.payment b{font-size:10.5px;font-weight:900;text-align:right}.warranty{margin:2mm 0;padding:1.5mm 0;border-top:1.5px dashed #000;border-bottom:1.5px dashed #000;font-size:9.5px;font-weight:700}.conditions{border-top:1.5px dashed #000;margin-top:1.8mm;padding-top:1.8mm;font-size:9.2px!important;font-weight:700;line-height:1.42}.conditions b{display:block;margin-bottom:1.2mm;font-size:9.5px;font-weight:900;letter-spacing:.05em}.conditions ul{margin:0;padding-left:4.2mm}.conditions li{margin:1mm 0}.conditions.compact p{margin:0;line-height:1.45}.thanks{text-align:center;font-size:9.5px;font-weight:900;letter-spacing:.08em;margin:3mm 0 1.5mm}.footer{text-align:center;color:#000!important;font-size:8px;font-weight:800}.acceptance{border-top:1.5px dashed #000;margin-top:2.2mm;padding-top:2mm;text-align:center}.acceptance b{display:block;font-size:10px;font-weight:900;letter-spacing:.07em}.acceptance p{margin:1mm 0;font-size:9px;font-weight:700}.signature{display:block;max-width:34mm;max-height:14mm;object-fit:contain;margin:1mm auto 0;filter:grayscale(1) contrast(2)}.signature-space{height:12mm}.signature-line{width:34mm;border-top:1.5px solid #000;margin:1mm auto .7mm}.signed-at{font-size:8.5px!important;color:#000!important;font-weight:700}@media print{html,body{width:57mm!important;min-width:57mm!important;max-width:57mm!important}.ticket{width:57mm!important;min-width:57mm!important;max-width:57mm!important;padding-left:4mm!important;padding-right:4mm!important;box-shadow:none!important}.no-print{display:none!important}}
  </style></head><body><main class="ticket"><img class="logo" src="${esc(logo)}"><div class="business"><b>${esc(t.business?.name || 'TechSoul')}</b><br>${esc(t.business?.address || '')}<br>${esc(t.business?.phone || '')}</div><div class="title"><h1>${esc(t.title)}</h1>${copyLabel ? `<div class="copy-label">${copyLabel}</div>` : ''}<b>${esc(t.folio)}</b><div>${esc(fechaTicket(t.date))}</div></div>${t.kind === 'service-order' ? `<div class="meta"><span>Nombre</span><b>${esc(t.client)}</b><span>Número</span><b>${esc(t.phone || '—')}</b><span>Modelo</span><b>${esc(t.model || '—')}</b><span>Reparación</span><b>${esc(t.repair || '—')}</b><span>Garantía</span><b>${esc(t.warrantyDays)} días</b></div><div style="margin-top:2mm">${orderTotals}</div>${isTechSoulCopy ? `<div class="conditions compact"><b>ACEPTACIÓN</b><p>El cliente declara haber leído y aceptado las condiciones de servicio y garantía indicadas en su comprobante, correspondientes al folio <strong>${esc(t.folio)}</strong>.</p></div>` : `<div class="conditions"><b>CONDICIONES</b><ul>${condiciones}</ul></div>`}` : `<div class="meta">${t.reference ? `<span>Orden</span><b>${esc(t.reference)}</b>` : ''}<span>Cliente</span><b>${esc(t.client)}</b>${t.phone ? `<span>Teléfono</span><b>${esc(t.phone)}</b>` : ''}${t.equipment ? `<span>Equipo</span><b>${esc(t.equipment)}</b>` : ''}${t.imei ? `<span>IMEI / Serie</span><b>${esc(t.imei)}</b>` : ''}${t.status ? `<span>Estado</span><b>${esc(t.status)}</b>` : ''}</div><div class="section">DETALLE</div><table class="items"><tbody>${lineas}</tbody></table><div style="margin-top:2mm">${orderTotals}</div>${t.paymentMethod ? `<div class="payment"><span>Forma de pago</span><b>${esc(t.paymentMethod)}</b></div>` : ''}${t.warrantyDays > 0 ? `<div class="warranty"><b>Garantía: ${esc(t.warrantyDays)} días</b><br><span>Aplica según las condiciones de la orden de servicio.</span></div>` : ''}`}${t.kind === 'service-order' ? `<div class="acceptance"><b>FIRMA DEL CLIENTE</b><div class="signature-space"></div><div class="signature-line"></div><strong>${esc(t.client || 'Cliente')}</strong>${isTechSoulCopy ? `<p class="signed-at">Copia para resguardo de TechSoul</p>` : `<p class="signed-at">Aceptación de servicio y garantía</p>`}</div>` : ''}<div class="thanks">GRACIAS POR CONFIAR<br>EN TECHSOUL</div><div class="footer">TU EQUIPO, EN BUENAS MANOS</div></main>${autoPrint ? '<script>window.onload=()=>setTimeout(()=>window.print(),250)<\/script>' : ''}</body></html>`
}

function abrirDocumento(autoPrint = true, copy = 'client') {
  const w = window.open('', '_blank', 'width=520,height=780')
  if (!w) return alert('Permite ventanas emergentes para imprimir el ticket.')
  w.document.open(); w.document.write(ticketHtml(autoPrint, copy)); w.document.close()
}

function normalizarWhatsApp(numero) {
  const digits = String(numero || '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.length === 10) return `52${digits}`
  if (digits.length === 12 && digits.startsWith('52')) return digits
  return digits
}

async function descargarPdfDigital() {
  const t = props.ticket
  if (!t) return false
  const source = document.querySelector('.ticket-paper')
  if (!source) return false

  const clone = source.cloneNode(true)
  clone.querySelector('.ticket-physical-signature')?.remove()
  Object.assign(clone.style, {
    position: 'fixed', left: '-10000px', top: '0', width: '57mm',
    margin: '0', boxShadow: 'none', background: '#fff', zIndex: '-1'
  })
  document.body.appendChild(clone)

  try {
    await Promise.all(Array.from(clone.querySelectorAll('img')).map(img => img.complete ? Promise.resolve() : new Promise(resolve => { img.onload = resolve; img.onerror = resolve })))
    const canvas = await html2canvas(clone, { scale: 3, backgroundColor: '#ffffff', useCORS: true, logging: false })
    const pageWidth = 57
    const pageHeight = Math.max(20, pageWidth * canvas.height / canvas.width)
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [pageWidth, pageHeight], compress: true })
    doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, pageWidth, pageHeight, undefined, 'FAST')
    const safeFolio = String(t.folio || 'ticket').replace(/[^a-zA-Z0-9_-]/g, '-')
    doc.save(`Comprobante_${safeFolio}.pdf`)
    return true
  } finally {
    clone.remove()
  }
}

async function pdf() {
  try {
    await descargarPdfDigital()
  } catch (error) {
    console.error(error)
    alert('No se pudo generar el PDF. Intenta nuevamente.')
  }
}

function imprimirCliente() {
  abrirDocumento(true, 'client')
}

function imprimirTechSoul() {
  abrirDocumento(true, 'techsoul')
}

async function whatsapp() {
  const numero = normalizarWhatsApp(telefonoWhatsApp.value)
  if (!numero) {
    alert('Esta orden no tiene un número de cliente registrado.')
    return
  }

  // Abrimos la pestaña inmediatamente para evitar que el navegador bloquee el popup
  // mientras se genera y descarga el PDF.
  const waWindow = window.open('about:blank', '_blank')
  if (!waWindow) {
    alert('Permite ventanas emergentes para abrir WhatsApp.')
    return
  }

  try {
    await descargarPdfDigital()
    const t = props.ticket
    const nombre = t?.client || 'cliente'
    const folio = t?.folio || ''
    const text = `Hola ${nombre}, te compartimos tu comprobante de pago${folio ? ` de la orden ${folio}` : ''}. Gracias por tu confianza en TechSoul.`
    waWindow.location.href = `https://wa.me/${numero}?text=${encodeURIComponent(text)}`
  } catch (error) {
    console.error(error)
    waWindow.close()
    alert('No se pudo generar el PDF para WhatsApp. Intenta nuevamente.')
  }
}
</script>

<template>
  <div v-if="ticket" class="ticket-modal-backdrop" @click.self="emit('close')">
    <section class="ticket-modal" role="dialog" aria-modal="true" aria-label="Vista previa del ticket">
      <header><div><span>Documento</span><h3>{{ ticket.title }}</h3></div><button type="button" @click="emit('close')">×</button></header>
      <div class="ticket-paper">
        <img :src="ticket.business?.logo || '/brand/techsoul-logo-ticket.png'" alt="TechSoul" class="ticket-logo">
        <p class="ticket-business"><b>{{ ticket.business?.name }}</b><br>{{ ticket.business?.address }}<br>{{ ticket.business?.phone }}</p>
        <div class="ticket-title"><b>{{ ticket.title }}</b><strong>{{ ticket.folio }}</strong><small>{{ fechaTicket(ticket.date) }}</small></div>
        <template v-if="ticket.kind === 'service-order'">
          <dl><dt>Nombre</dt><dd>{{ ticket.client }}</dd><dt>Número</dt><dd>{{ ticket.phone || '—' }}</dd><dt>Modelo</dt><dd>{{ ticket.model }}</dd><dt>Reparación</dt><dd>{{ ticket.repair }}</dd><dt>Garantía</dt><dd>{{ ticket.warrantyDays }} días</dd></dl>
          <div class="ticket-totals"><div class="balance"><span>Pago</span><b>{{ monedaMX(ticket.totalService) }}</b></div><div v-if="!ticket.isPaid"><span>Anticipo</span><b>{{ monedaMX(ticket.paymentReceived) }}</b></div><div v-if="!ticket.isPaid"><span>Resto</span><b>{{ monedaMX(ticket.balance) }}</b></div></div>
          <div class="ticket-payment"><span>Método de pago</span><b>{{ ticket.paymentMethod || 'No especificado' }}</b></div>
          <div class="ticket-conditions"><strong>CONDICIONES</strong><ul><li v-for="(condition,i) in ticket.conditions" :key="i">{{ condition }}</li></ul></div>
          <div class="ticket-physical-signature"><strong>FIRMA DEL CLIENTE</strong><div></div><span>{{ ticket.client }}</span><small>Aceptación de servicio y garantía</small></div>
        </template>
        <template v-else>
          <dl><template v-if="ticket.reference"><dt>Orden</dt><dd>{{ ticket.reference }}</dd></template><dt>Cliente</dt><dd>{{ ticket.client }}</dd><template v-if="ticket.equipment"><dt>Equipo</dt><dd>{{ ticket.equipment }}</dd></template><template v-if="ticket.imei"><dt>IMEI / Serie</dt><dd>{{ ticket.imei }}</dd></template><template v-if="ticket.status"><dt>Estado</dt><dd>{{ ticket.status }}</dd></template></dl>
          <div class="ticket-lines"><div v-for="(line,i) in ticket.lines" :key="i"><span>{{ line.description }}<small v-if="line.quantity">{{ line.quantity }} × {{ monedaMX(line.unitPrice) }}</small></span><b v-if="!line.hideAmount">{{ monedaMX(line.amount) }}</b></div></div>
          <div class="ticket-totals" v-if="ticket.kind === 'order-payment'"><div><span>Total del servicio</span><b>{{ monedaMX(ticket.totalService) }}</b></div><div v-if="ticket.previousPaid"><span>Pagado anteriormente</span><b>{{ monedaMX(ticket.previousPaid) }}</b></div><div><span>Pago recibido</span><b>{{ monedaMX(ticket.paymentReceived) }}</b></div><div class="balance"><span>Saldo pendiente</span><b>{{ monedaMX(ticket.balance) }}</b></div></div><div class="ticket-totals" v-else><div class="balance"><span>Total</span><b>{{ monedaMX(ticket.totalService) }}</b></div><div v-if="ticket.balance"><span>Saldo pendiente</span><b>{{ monedaMX(ticket.balance) }}</b></div></div>
          <div v-if="ticket.paymentMethod" class="ticket-payment"><span>Forma de pago</span><b>{{ ticket.paymentMethod }}</b></div>
        </template>
        <p class="ticket-thanks">¡Gracias por tu confianza!</p>
      </div>
      <footer><button class="wa" type="button" @click="whatsapp">WhatsApp</button><button type="button" @click="pdf">PDF</button><template v-if="ticket.kind === 'service-order'"><button class="primary" type="button" @click="imprimirCliente">Imprimir cliente</button><button class="secondary-print" type="button" @click="imprimirTechSoul">Imprimir TechSoul</button></template><button v-else class="primary" type="button" @click="imprimirCliente">Imprimir</button></footer>
    </section>
  </div>
</template>

<style scoped>
.ticket-modal-backdrop{position:fixed;inset:0;z-index:3000;background:rgba(15,23,42,.58);display:grid;place-items:center;padding:18px}.ticket-modal{width:min(460px,100%);max-height:94vh;overflow:auto;background:var(--ts-surface,#fff);border:1px solid var(--ts-border,#dbe3ee);border-radius:20px;box-shadow:0 24px 60px rgba(15,23,42,.25)}.ticket-modal>header{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid var(--ts-border,#e2e8f0)}.ticket-modal>header span{font-size:.68rem;text-transform:uppercase;letter-spacing:.12em;color:var(--ts-muted,#64748b);font-weight:800}.ticket-modal h3{margin:2px 0 0;font-size:1.1rem}.ticket-modal>header button{border:0;background:transparent;font-size:1.6rem;color:var(--ts-muted,#64748b)}.ticket-paper{width:min(58mm,calc(100% - 34px));margin:18px auto;background:#fff;color:#111827;padding:14px 12px;box-shadow:0 5px 22px rgba(15,23,42,.12);font-family:Arial,sans-serif;font-size:12px}.ticket-logo{display:block;max-width:150px;max-height:48px;object-fit:contain;margin:0 auto 8px}.ticket-business{text-align:center;color:#475569;line-height:1.45}.ticket-title{text-align:center;border-block:1px dashed #94a3b8;padding:10px 0;margin:12px 0;display:grid;gap:2px}.ticket-title>b{letter-spacing:.14em}.ticket-title>strong{font-size:1rem}.ticket-title>small{color:#64748b}.ticket-paper dl{display:grid;grid-template-columns:82px 1fr;gap:5px 8px;margin:0 0 12px}.ticket-paper dt{color:#64748b}.ticket-paper dd{margin:0;font-weight:700;overflow-wrap:anywhere}.ticket-lines{border-block:1px solid #cbd5e1}.ticket-lines>div,.ticket-totals>div,.ticket-payment{display:flex;justify-content:space-between;gap:12px;padding:7px 0}.ticket-lines span{min-width:0}.ticket-lines small{display:block;color:#64748b}.ticket-lines b{white-space:nowrap}.ticket-totals{padding-top:7px}.ticket-totals .balance{font-size:1.05rem;font-weight:800}.ticket-payment{border-block:1px dashed #94a3b8;margin-top:4px}.ticket-conditions{border-top:1px dashed #94a3b8;margin-top:8px;padding-top:10px}.ticket-conditions strong{display:block;margin-bottom:6px}.ticket-conditions ul{margin:0;padding-left:18px}.ticket-conditions li{margin:5px 0;line-height:1.35}.ticket-physical-signature{border-top:1px dashed #94a3b8;margin-top:10px;padding-top:10px;text-align:center}.ticket-physical-signature>strong{display:block;font-size:11px;letter-spacing:.08em}.ticket-physical-signature>div{height:48px;border-bottom:1px solid #111;margin:0 18px 5px}.ticket-physical-signature>span{display:block;font-weight:700}.ticket-physical-signature>small{display:block;color:#64748b;margin-top:2px}.ticket-thanks{text-align:center;font-style:italic;letter-spacing:.05em;margin:16px 0 2px}.ticket-modal>footer{display:flex;flex-wrap:wrap;gap:8px;padding:14px 18px 18px}.ticket-modal>footer button{min-height:44px;flex:1 1 120px;border-radius:11px;border:1px solid var(--ts-border,#dbe3ee);background:var(--ts-surface,#fff);font-weight:800}.ticket-modal>footer .primary{background:#175cff;color:#fff;border-color:#175cff}.ticket-modal>footer .wa{background:#16a34a;color:#fff;border-color:#16a34a}.ticket-modal>footer .secondary-print{background:#0f172a;color:#fff;border-color:#0f172a}@media(max-width:520px){.ticket-modal-backdrop{padding:0;align-items:end}.ticket-modal{width:100%;max-height:96vh;border-radius:20px 20px 0 0}.ticket-paper{width:calc(100% - 28px);padding:18px 16px}.ticket-modal>footer{position:sticky;bottom:0;background:var(--ts-surface,#fff);display:flex}.ticket-modal>footer button{font-size:.8rem;flex:1 1 calc(50% - 8px)}}
</style>
