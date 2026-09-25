<script setup>
import { computed, ref, watch } from 'vue'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import QRCode from 'qrcode'
import { asegurarFirmaGarantiaPorOrden, linkFirmaGarantia } from '../../services/garantia-firma.service'
import { monedaMX, fechaTicket } from '../../utils/tickets'

const props = defineProps({
  ticket: { type: Object, default: null }
})
const emit = defineEmits(['close'])

const qrFirma = ref('')
const linkFirma = ref('')

const puedeFirmarDigital = computed(() => props.ticket?.kind === 'service-order' && ['Listo','Entregado'].includes(props.ticket?.status) && props.ticket?.orderId)

watch(() => props.ticket, async (t) => {
  qrFirma.value = ''; linkFirma.value = ''
  if (!t || t.kind !== 'service-order' || !['Listo','Entregado'].includes(t.status) || !t.orderId) return
  try {
    const firma = await asegurarFirmaGarantiaPorOrden(t.orderId)
    if (!firma) return
    linkFirma.value = linkFirmaGarantia(firma)
    qrFirma.value = await QRCode.toDataURL(linkFirma.value, { width: 260, margin: 1, errorCorrectionLevel: 'M' })
  } catch (e) { console.warn('QR garantía:', e) }
}, { immediate: true })

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
  @page{size:58mm auto;margin:0}
  *{box-sizing:border-box}
  html,body{width:58mm!important;margin:0!important;padding:0!important;background:#fff!important;color:#000!important}
  body{font-family:Arial,"Helvetica Neue",sans-serif!important;font-size:12.5px!important;font-weight:400!important;line-height:1.38!important;-webkit-font-smoothing:none!important;text-rendering:geometricPrecision!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
  .ticket{width:50mm!important;margin:0 auto!important;padding:2.5mm 0 4mm!important;background:#fff!important;color:#000!important;transform:none!important;zoom:1!important}
  .logo{display:block;width:auto;max-width:32mm;max-height:10mm;object-fit:contain;margin:0 auto 1.5mm;filter:grayscale(1) contrast(3)}
  .business{text-align:center;color:#000!important;font-size:10.5px!important;font-weight:400!important;line-height:1.32!important}
  .business b{font-size:12.5px!important;font-weight:500!important}
  .title{text-align:center;border-top:2px dashed #000;border-bottom:2px dashed #000;margin:2.2mm 0;padding:1.8mm 0}
  .title h1{font-size:13px!important;font-weight:700!important;letter-spacing:.02em!important;line-height:1.15!important;margin:0 0 1mm!important;white-space:normal!important}
  .title b{font-size:12.5px!important;font-weight:700!important}
  .title div{font-size:10.5px!important;font-weight:400!important}
  .copy-label{font-size:9.5px!important;font-weight:400!important;letter-spacing:.08em!important;margin-bottom:.8mm!important}
  .meta{display:block!important;margin:0 0 2mm!important}
  .meta span,.meta b{display:block!important;color:#000!important}
  .meta span{font-size:10px!important;font-weight:400!important;text-transform:uppercase!important;letter-spacing:.04em!important;margin-top:1.3mm!important}
  .meta b{font-size:13px!important;font-weight:400!important;line-height:1.2!important;overflow-wrap:anywhere!important}
  .section{font-size:11px!important;letter-spacing:.05em!important;font-weight:500!important;margin:2mm 0 1mm!important}
  .items{width:100%!important;border-collapse:collapse!important;border-top:2px solid #000!important;border-bottom:2px solid #000!important}
  .items td{padding:1.5mm 0!important;vertical-align:top!important;font-size:11.5px!important;font-weight:400!important}
  .items td:last-child{text-align:right!important;white-space:nowrap!important;font-weight:400!important}
  .items td b{font-weight:400!important}
  .items small{display:block!important;color:#000!important;font-size:10.5px!important;font-weight:400!important;margin-top:.5mm!important}
  .sum{display:flex!important;justify-content:space-between!important;align-items:baseline!important;gap:2mm!important;padding:1mm 0!important;font-size:11.5px!important;font-weight:400!important}
  .sum b{font-size:12.5px!important;font-weight:400!important;white-space:nowrap!important}
  .sum.total{font-size:13px!important;font-weight:700!important;border-top:2px solid #000!important;margin-top:1mm!important;padding-top:1.5mm!important}
  .sum.total b{font-size:14px!important;font-weight:700!important}
  .sum.balance{font-size:12.5px!important;font-weight:400!important}
  .sum.balance b{font-size:13px!important;font-weight:400!important}
  .payment{border-top:2px dashed #000!important;border-bottom:2px dashed #000!important;padding:1.5mm 0!important;margin:1.7mm 0!important;display:block!important;font-size:10.5px!important;font-weight:400!important}
  .payment span{display:block!important;text-transform:uppercase!important;font-size:9px!important;letter-spacing:.04em!important}
  .payment b{display:block!important;font-size:12.5px!important;font-weight:400!important;text-align:left!important;margin-top:.4mm!important}
  .warranty{margin:2mm 0!important;padding:1.5mm 0!important;border-top:2px dashed #000!important;border-bottom:2px dashed #000!important;font-size:10.5px!important;font-weight:400!important}
  .conditions{border-top:2px dashed #000!important;margin-top:1.8mm!important;padding-top:1.8mm!important;font-size:11px!important;font-weight:400!important;line-height:1.42!important}
  .conditions b{display:block!important;margin-bottom:1mm!important;font-size:11px!important;font-weight:600!important;letter-spacing:.04em!important}
  .conditions ul{margin:0!important;padding-left:4.5mm!important}
  .conditions li{margin:1.2mm 0!important}
  .conditions.compact p{margin:0!important;line-height:1.35!important}
  .thanks{text-align:center!important;font-size:10.5px!important;font-weight:400!important;letter-spacing:.04em!important;margin:3mm 0 1.5mm!important}
  .footer{text-align:center!important;color:#000!important;font-size:9.5px!important;font-weight:400!important}
  .digital-sign{text-align:center;border-top:2px dashed #000;margin-top:2.5mm;padding-top:2.5mm}.digital-sign b{display:block;font-size:11px;letter-spacing:.08em}.digital-sign img{display:block;width:30mm;height:30mm;margin:1.5mm auto}.digital-sign strong{display:block;font-size:10.5px;line-height:1.25}.digital-sign p{font-size:9.5px;margin:1mm 0 0;line-height:1.25}.acceptance{border-top:2px dashed #000!important;margin-top:2.2mm!important;padding-top:2mm!important;text-align:center!important}
  .acceptance b{display:block!important;font-size:11px!important;font-weight:600!important;letter-spacing:.05em!important}
  .acceptance p{margin:1mm 0!important;font-size:10.5px!important;font-weight:400!important}
  .signature-space{height:12mm!important}
  .signature-line{width:36mm!important;border-top:2px solid #000!important;margin:1mm auto .7mm!important}
  .signed-at{font-size:9.5px!important;color:#000!important;font-weight:400!important}
  @media print{
    html,body{width:58mm!important;min-width:58mm!important;max-width:58mm!important;height:auto!important}
    .ticket{width:50mm!important;min-width:50mm!important;max-width:50mm!important;margin-left:auto!important;margin-right:auto!important;padding:2.5mm 0 4mm!important;box-shadow:none!important;transform:none!important;zoom:1!important}
    .no-print{display:none!important}
  }
  </style></head><body><main class="ticket"><img class="logo" src="${esc(logo)}"><div class="business"><b>${esc(t.business?.name || 'TechSoul')}</b><br>${esc(t.business?.address || '')}<br>${esc(t.business?.phone || '')}</div><div class="title"><h1>${esc(t.title)}</h1>${copyLabel ? `<div class="copy-label">${copyLabel}</div>` : ''}<b>${esc(t.folio)}</b><div>${esc(fechaTicket(t.date))}</div></div>${t.kind === 'service-order' ? `<div class="meta"><span>Nombre</span><b>${esc(t.client)}</b><span>Número</span><b>${esc(t.phone || '—')}</b><span>Modelo</span><b>${esc(t.model || '—')}</b><span>Reparación</span><b>${esc(t.repair || '—')}</b><span>Garantía</span><b>${esc(t.warrantyDays)} días</b></div><div style="margin-top:2mm">${orderTotals}</div>${isTechSoulCopy ? `<div class="conditions compact"><b>ACEPTACIÓN</b><p>El cliente declara haber leído y aceptado las condiciones de servicio y garantía indicadas en su comprobante, correspondientes al folio <strong>${esc(t.folio)}</strong>.</p></div>` : `<div class="conditions"><b>CONDICIONES</b><ul>${condiciones}</ul></div>`}` : `<div class="meta">${t.reference ? `<span>Orden</span><b>${esc(t.reference)}</b>` : ''}<span>Cliente</span><b>${esc(t.client)}</b>${t.phone ? `<span>Teléfono</span><b>${esc(t.phone)}</b>` : ''}${t.equipment ? `<span>Equipo</span><b>${esc(t.equipment)}</b>` : ''}${t.imei ? `<span>IMEI / Serie</span><b>${esc(t.imei)}</b>` : ''}${t.status ? `<span>Estado</span><b>${esc(t.status)}</b>` : ''}</div><div class="section">DETALLE</div><table class="items"><tbody>${lineas}</tbody></table><div style="margin-top:2mm">${orderTotals}</div>${t.paymentMethod ? `<div class="payment"><span>Forma de pago</span><b>${esc(t.paymentMethod)}</b></div>` : ''}${t.warrantyDays > 0 ? `<div class="warranty"><b>Garantía: ${esc(t.warrantyDays)} días</b><br><span>Aplica según las condiciones de la orden de servicio.</span></div>` : ''}`}${t.kind === 'service-order' && qrFirma.value ? `<div class="digital-sign"><b>GARANTÍA DIGITAL</b><img src="${esc(qrFirma.value)}" alt="QR firma digital"><strong>Escanea para revisar y firmar tu garantía</strong><p>La aceptación quedará registrada digitalmente en TechSoul.</p></div>` : ''}<div class="thanks">GRACIAS POR CONFIAR<br>EN TECHSOUL</div><div class="footer">TU EQUIPO, EN BUENAS MANOS</div></main>${autoPrint ? '<script>window.onload=()=>setTimeout(()=>window.print(),250)<\/script>' : ''}</body></html>`
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

async function generarPdfDigital() {
  const t = props.ticket
  if (!t) return null
  const source = document.querySelector('.ticket-paper')
  if (!source) return null

  const clone = source.cloneNode(true)
  clone.classList.add('ticket-pdf-export')
  clone.querySelector('.ticket-physical-signature')?.remove()
  Object.assign(clone.style, {
    position: 'fixed', left: '-10000px', top: '0', width: '58mm',
    maxWidth: '58mm', margin: '0', boxShadow: 'none', background: '#fff', zIndex: '-1'
  })
  document.body.appendChild(clone)

  try {
    await Promise.all(Array.from(clone.querySelectorAll('img')).map(img =>
      img.complete ? Promise.resolve() : new Promise(resolve => {
        img.onload = resolve
        img.onerror = resolve
      })
    ))
    const canvas = await html2canvas(clone, {
      scale: 3, backgroundColor: '#ffffff', useCORS: true, logging: false
    })
    const pageWidth = 58
    const pageHeight = Math.max(20, pageWidth * canvas.height / canvas.width)
    const doc = new jsPDF({
      orientation: 'portrait', unit: 'mm',
      format: [pageWidth, pageHeight], compress: true
    })
    doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, pageWidth, pageHeight, undefined, 'FAST')
    const safeFolio = String(t.folio || 'ticket').replace(/[^a-zA-Z0-9_-]/g, '-')
    const fileName = `Comprobante_${safeFolio}.pdf`
    return { doc, blob: doc.output('blob'), fileName }
  } finally {
    clone.remove()
  }
}

async function descargarPdfDigital() {
  const generado = await generarPdfDigital()
  if (!generado) return false
  generado.doc.save(generado.fileName)
  return true
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

  try {
    const t = props.ticket
    const nombre = String(t?.client || 'cliente').trim().split(' ')[0] || 'cliente'
    const folio = t?.folio || ''

    let garantiaUrl = linkFirma.value

    if (t?.kind === 'service-order' && ['Listo', 'Entregado'].includes(t?.status) && t?.orderId && !garantiaUrl) {
      const firma = await asegurarFirmaGarantiaPorOrden(t.orderId)
      if (firma) {
        garantiaUrl = linkFirmaGarantia(firma)
        linkFirma.value = garantiaUrl
        qrFirma.value = await QRCode.toDataURL(garantiaUrl, {
          width: 260, margin: 1, errorCorrectionLevel: 'M'
        })
      }
    }

    const mensaje = garantiaUrl
      ? `Hola ${nombre} 👋💙

Tu equipo ya está listo. Te compartimos tu comprobante de servicio.

Firma tu garantía digital aquí:
${garantiaUrl}

Una vez firmada, tu garantía quedará registrada en TechSoul.

¡Gracias por tu confianza! 🛠️`
      : `Hola ${nombre} 👋💙

Te compartimos tu comprobante${folio ? ` de la orden ${folio}` : ''}.

¡Gracias por tu confianza en TechSoul!`

    const generado = await generarPdfDigital()
    if (!generado) throw new Error('No se pudo generar el PDF.')

    const archivo = new File([generado.blob], generado.fileName, { type: 'application/pdf' })

    // Móvil: comparte el PDF como archivo real + mensaje.
    // No se crea ni se comparte ninguna URL blob:https://...
    if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [archivo] }))) {
      await navigator.share({
        files: [archivo],
        text: mensaje,
        title: generado.fileName
      })
      return
    }

    // Escritorio: wa.me no puede adjuntar archivos automáticamente.
    // Descargamos el PDF y abrimos el chat con el texto + enlace real de garantía.
    generado.doc.save(generado.fileName)
    window.open(
      `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`,
      '_blank',
      'noopener,noreferrer'
    )
  } catch (error) {
    if (error?.name === 'AbortError') return
    console.error(error)
    alert('No se pudo preparar el ticket para WhatsApp. Intenta nuevamente.')
  }
}
</script>

<template>
  <div v-if="ticket" class="ticket-modal-backdrop" @click.self="emit('close')">
    <section class="ticket-modal" role="dialog" aria-modal="true" aria-label="Vista previa del ticket">
      <header><div><span>Documento</span><h3>{{ ticket.title }}</h3></div><button type="button" @click="emit('close')">×</button></header>
      <div class="ticket-paper ticket-digital-preview" data-ticket-render="digital-v5">
        <img :src="ticket.business?.logo || '/brand/techsoul-logo-ticket.png'" alt="TechSoul" class="ticket-logo">
        <p class="ticket-business"><b>{{ ticket.business?.name }}</b><br>{{ ticket.business?.address }}<br>{{ ticket.business?.phone }}</p>
        <div class="ticket-title"><b>{{ ticket.title }}</b><strong>{{ ticket.folio }}</strong><small>{{ fechaTicket(ticket.date) }}</small></div>
        <template v-if="ticket.kind === 'service-order'">
          <dl><dt>Nombre</dt><dd>{{ ticket.client }}</dd><dt>Número</dt><dd>{{ ticket.phone || '—' }}</dd><dt>Modelo</dt><dd>{{ ticket.model }}</dd><dt>Reparación</dt><dd>{{ ticket.repair }}</dd><dt>Garantía</dt><dd>{{ ticket.warrantyDays }} días</dd></dl>
          <div class="ticket-totals"><div class="balance"><span>Pago</span><b>{{ monedaMX(ticket.totalService) }}</b></div><div v-if="!ticket.isPaid"><span>Anticipo</span><b>{{ monedaMX(ticket.paymentReceived) }}</b></div><div v-if="!ticket.isPaid"><span>Resto</span><b>{{ monedaMX(ticket.balance) }}</b></div></div>
          <div class="ticket-payment"><span>Método de pago</span><b>{{ ticket.paymentMethod || 'No especificado' }}</b></div>
          <div class="ticket-conditions"><strong>CONDICIONES</strong><ul><li v-for="(condition,i) in ticket.conditions" :key="i">{{ condition }}</li></ul></div>
          <div v-if="qrFirma" class="ticket-digital-sign"><strong>GARANTÍA DIGITAL</strong><img :src="qrFirma" alt="QR para firmar garantía"><b>Escanea para revisar y firmar tu garantía</b><small>La aceptación quedará registrada digitalmente en TechSoul.</small></div>
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
.ticket-modal-backdrop{position:fixed;inset:0;z-index:3000;background:rgba(15,23,42,.58);display:grid;place-items:center;padding:18px}.ticket-modal{width:min(460px,100%);max-height:94vh;overflow:auto;background:var(--ts-surface,#fff);border:1px solid var(--ts-border,#dbe3ee);border-radius:20px;box-shadow:0 24px 60px rgba(15,23,42,.25)}.ticket-modal>header{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid var(--ts-border,#e2e8f0)}.ticket-modal>header span{font-size:.68rem;text-transform:uppercase;letter-spacing:.12em;color:var(--ts-muted,#64748b);font-weight:800}.ticket-modal h3{margin:2px 0 0;font-size:1.1rem}.ticket-modal>header button{border:0;background:transparent;font-size:1.6rem;color:var(--ts-muted,#64748b)}.ticket-paper{width:min(58mm,calc(100% - 34px));margin:18px auto;background:#fff;color:#111827;padding:14px 12px;box-shadow:0 5px 22px rgba(15,23,42,.12);font-family:Arial,sans-serif;font-size:12px}.ticket-logo{display:block;max-width:150px;max-height:48px;object-fit:contain;margin:0 auto 8px}.ticket-business{text-align:center;color:#475569;line-height:1.45}.ticket-title{text-align:center;border-block:1px dashed #94a3b8;padding:10px 0;margin:12px 0;display:grid;gap:2px}.ticket-title>b{letter-spacing:.14em}.ticket-title>strong{font-size:1rem}.ticket-title>small{color:#64748b}.ticket-paper dl{display:grid;grid-template-columns:82px 1fr;gap:5px 8px;margin:0 0 12px}.ticket-paper dt{color:#64748b}.ticket-paper dd{margin:0;font-weight:700;overflow-wrap:anywhere}.ticket-lines{border-block:1px solid #cbd5e1}.ticket-lines>div,.ticket-totals>div,.ticket-payment{display:flex;justify-content:space-between;gap:12px;padding:7px 0}.ticket-lines span{min-width:0}.ticket-lines small{display:block;color:#64748b}.ticket-lines b{white-space:nowrap}.ticket-totals{padding-top:7px}.ticket-totals .balance{font-size:1.05rem;font-weight:800}.ticket-payment{border-block:1px dashed #94a3b8;margin-top:4px}.ticket-conditions{border-top:1px dashed #94a3b8;margin-top:8px;padding-top:10px}.ticket-conditions strong{display:block;margin-bottom:6px}.ticket-conditions ul{margin:0;padding-left:18px}.ticket-conditions li{margin:5px 0;line-height:1.35}.ticket-digital-sign{border-top:1px dashed #94a3b8;margin-top:10px;padding-top:12px;text-align:center}.ticket-digital-sign>strong{display:block;font-size:11px;letter-spacing:.08em}.ticket-digital-sign>img{display:block;width:118px;height:118px;margin:8px auto}.ticket-digital-sign>b{display:block;font-size:11px;line-height:1.3}.ticket-digital-sign>small{display:block;color:#64748b;margin-top:4px;line-height:1.3}.ticket-physical-signature{border-top:1px dashed #94a3b8;margin-top:10px;padding-top:10px;text-align:center}.ticket-physical-signature>strong{display:block;font-size:11px;letter-spacing:.08em}.ticket-physical-signature>div{height:48px;border-bottom:1px solid #111;margin:0 18px 5px}.ticket-physical-signature>span{display:block;font-weight:700}.ticket-physical-signature>small{display:block;color:#64748b;margin-top:2px}.ticket-thanks{text-align:center;font-style:italic;letter-spacing:.05em;margin:16px 0 2px}.ticket-pdf-export{width:58mm!important;max-width:58mm!important;padding:14px 12px!important;font-family:Arial,sans-serif!important;font-size:12px!important;font-weight:400!important;line-height:normal!important;color:#111827!important}.ticket-pdf-export dd{font-weight:700!important}.ticket-pdf-export .ticket-totals .balance{font-size:1.05rem!important;font-weight:800!important}.ticket-pdf-export .ticket-title>b{font-weight:700!important}.ticket-pdf-export .ticket-title>strong{font-size:1rem!important;font-weight:700!important}.ticket-pdf-export .ticket-payment b{font-weight:700!important}.ticket-pdf-export .ticket-conditions strong{font-weight:700!important}.ticket-pdf-export .ticket-thanks{font-weight:400!important}.ticket-modal>footer{display:flex;flex-wrap:wrap;gap:8px;padding:14px 18px 18px}.ticket-modal>footer button{min-height:44px;flex:1 1 120px;border-radius:11px;border:1px solid var(--ts-border,#dbe3ee);background:var(--ts-surface,#fff);font-weight:800}.ticket-modal>footer .primary{background:#175cff;color:#fff;border-color:#175cff}.ticket-modal>footer .wa{background:#16a34a;color:#fff;border-color:#16a34a}.ticket-modal>footer .secondary-print{background:#0f172a;color:#fff;border-color:#0f172a}@media(max-width:520px){.ticket-modal-backdrop{padding:0;align-items:end}.ticket-modal{width:100%;max-height:96vh;border-radius:20px 20px 0 0}.ticket-paper{width:calc(100% - 28px);padding:18px 16px}.ticket-modal>footer{position:sticky;bottom:0;background:var(--ts-surface,#fff);display:flex}.ticket-modal>footer button{font-size:.8rem;flex:1 1 calc(50% - 8px)}}
</style>
