<script setup>
import { computed } from 'vue'
import { monedaMX, fechaTicket, ticketWhatsappText } from '../../utils/tickets'

const props = defineProps({
  ticket: { type: Object, default: null }
})
const emit = defineEmits(['close'])

const telefonoWhatsApp = computed(() => String(props.ticket?.business?.whatsapp || '').replace(/\D/g, ''))

function esc(v) {
  return String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;')
}

function ticketHtml(autoPrint = false) {
  const t = props.ticket
  if (!t) return ''
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
  @page{size:80mm auto;margin:0}*{box-sizing:border-box}body{margin:0;background:#fff;color:#111827;font-family:Arial,Helvetica,sans-serif}.ticket{width:80mm;padding:6mm 5mm;margin:0 auto;font-size:10px;line-height:1.35}.logo{display:block;max-width:48mm;max-height:17mm;object-fit:contain;margin:0 auto 2mm}.business{text-align:center;color:#475569;font-size:9px;line-height:1.45}.title{text-align:center;border-top:1px dashed #94a3b8;border-bottom:1px dashed #94a3b8;margin:4mm 0 3mm;padding:3mm 0}.title h1{font-size:15px;letter-spacing:.16em;margin:0 0 1mm}.title b{font-size:11px}.meta{display:grid;grid-template-columns:24mm 1fr;gap:1.2mm 2mm;margin:0 0 3mm}.meta span{color:#64748b}.meta b{overflow-wrap:anywhere}.section{font-size:9px;letter-spacing:.14em;font-weight:800;margin:3mm 0 1.5mm}.items{width:100%;border-collapse:collapse;border-top:1px solid #cbd5e1;border-bottom:1px solid #cbd5e1}.items td{padding:2mm 0;vertical-align:top}.items td:last-child{text-align:right;white-space:nowrap}.items small{display:block;color:#64748b;font-size:8px;margin-top:.5mm}.sum{display:flex;justify-content:space-between;gap:4mm;padding:.8mm 0}.sum.total{font-size:12px;font-weight:800;border-top:1px solid #cbd5e1;margin-top:1.5mm;padding-top:2mm}.sum.balance{font-size:12px;font-weight:800}.payment{border-top:1px dashed #94a3b8;border-bottom:1px dashed #94a3b8;padding:2mm 0;margin:2mm 0;display:flex;justify-content:space-between}.warranty{margin:2.5mm 0;padding:2mm;background:#f8fafc;border-radius:2mm}.conditions{border-top:1px dashed #94a3b8;margin-top:2mm;padding-top:2mm;font-size:9px}.conditions b{display:block;margin-bottom:1mm}.conditions ul{margin:0;padding-left:4mm}.conditions li{margin:.8mm 0}.thanks{text-align:center;font-style:italic;letter-spacing:.08em;margin:4mm 0 2mm}.footer{text-align:center;color:#64748b;font-size:8px}@media print{body{width:80mm}.ticket{box-shadow:none}.no-print{display:none!important}}
  </style></head><body><main class="ticket"><img class="logo" src="${esc(logo)}"><div class="business"><b>${esc(t.business?.name || 'TechSoul')}</b><br>${esc(t.business?.address || '')}<br>${esc(t.business?.phone || '')}</div><div class="title"><h1>${esc(t.title)}</h1><b>${esc(t.folio)}</b><div>${esc(fechaTicket(t.date))}</div></div>${t.kind === 'service-order' ? `<div class="meta"><span>Nombre</span><b>${esc(t.client)}</b><span>Número</span><b>${esc(t.phone || '—')}</b><span>Modelo</span><b>${esc(t.model || '—')}</b><span>Reparación</span><b>${esc(t.repair || '—')}</b><span>Garantía</span><b>${esc(t.warrantyDays)} días</b></div><div style="margin-top:2mm">${orderTotals}</div><div class="conditions"><b>CONDICIONES</b><ul>${condiciones}</ul></div>` : `<div class="meta">${t.reference ? `<span>Orden</span><b>${esc(t.reference)}</b>` : ''}<span>Cliente</span><b>${esc(t.client)}</b>${t.phone ? `<span>Teléfono</span><b>${esc(t.phone)}</b>` : ''}${t.equipment ? `<span>Equipo</span><b>${esc(t.equipment)}</b>` : ''}${t.imei ? `<span>IMEI / Serie</span><b>${esc(t.imei)}</b>` : ''}${t.status ? `<span>Estado</span><b>${esc(t.status)}</b>` : ''}</div><div class="section">DETALLE</div><table class="items"><tbody>${lineas}</tbody></table><div style="margin-top:2mm">${orderTotals}</div>${t.paymentMethod ? `<div class="payment"><span>Forma de pago</span><b>${esc(t.paymentMethod)}</b></div>` : ''}${t.warrantyDays > 0 ? `<div class="warranty"><b>Garantía: ${esc(t.warrantyDays)} días</b><br><span>Aplica según las condiciones de la orden de servicio.</span></div>` : ''}`}<div class="thanks">¡Gracias por tu confianza!</div><div class="footer">${esc(t.business?.name || 'TechSoul')} · Recibo generado por TechSoul OS</div></main>${autoPrint ? '<script>window.onload=()=>setTimeout(()=>window.print(),250)<\/script>' : ''}</body></html>`
}

function abrirDocumento(autoPrint = true) {
  const w = window.open('', '_blank', 'width=520,height=780')
  if (!w) return alert('Permite ventanas emergentes para imprimir el ticket.')
  w.document.open(); w.document.write(ticketHtml(autoPrint)); w.document.close()
}

function pdf() {
  abrirDocumento(true)
}

function whatsapp() {
  const text = ticketWhatsappText(props.ticket)
  const numero = telefonoWhatsApp.value
  const url = numero ? `https://wa.me/52${numero.replace(/^52/, '')}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`
  window.open(url, '_blank', 'noopener')
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
        </template>
        <template v-else>
          <dl><template v-if="ticket.reference"><dt>Orden</dt><dd>{{ ticket.reference }}</dd></template><dt>Cliente</dt><dd>{{ ticket.client }}</dd><template v-if="ticket.equipment"><dt>Equipo</dt><dd>{{ ticket.equipment }}</dd></template><template v-if="ticket.imei"><dt>IMEI / Serie</dt><dd>{{ ticket.imei }}</dd></template><template v-if="ticket.status"><dt>Estado</dt><dd>{{ ticket.status }}</dd></template></dl>
          <div class="ticket-lines"><div v-for="(line,i) in ticket.lines" :key="i"><span>{{ line.description }}<small v-if="line.quantity">{{ line.quantity }} × {{ monedaMX(line.unitPrice) }}</small></span><b v-if="!line.hideAmount">{{ monedaMX(line.amount) }}</b></div></div>
          <div class="ticket-totals" v-if="ticket.kind === 'order-payment'"><div><span>Total del servicio</span><b>{{ monedaMX(ticket.totalService) }}</b></div><div v-if="ticket.previousPaid"><span>Pagado anteriormente</span><b>{{ monedaMX(ticket.previousPaid) }}</b></div><div><span>Pago recibido</span><b>{{ monedaMX(ticket.paymentReceived) }}</b></div><div class="balance"><span>Saldo pendiente</span><b>{{ monedaMX(ticket.balance) }}</b></div></div><div class="ticket-totals" v-else><div class="balance"><span>Total</span><b>{{ monedaMX(ticket.totalService) }}</b></div><div v-if="ticket.balance"><span>Saldo pendiente</span><b>{{ monedaMX(ticket.balance) }}</b></div></div>
          <div v-if="ticket.paymentMethod" class="ticket-payment"><span>Forma de pago</span><b>{{ ticket.paymentMethod }}</b></div>
        </template>
        <p class="ticket-thanks">¡Gracias por tu confianza!</p>
      </div>
      <footer><button class="wa" type="button" @click="whatsapp">WhatsApp</button><button type="button" @click="pdf">PDF</button><button class="primary" type="button" @click="abrirDocumento(true)">Imprimir</button></footer>
    </section>
  </div>
</template>

<style scoped>
.ticket-modal-backdrop{position:fixed;inset:0;z-index:3000;background:rgba(15,23,42,.58);display:grid;place-items:center;padding:18px}.ticket-modal{width:min(460px,100%);max-height:94vh;overflow:auto;background:var(--ts-surface,#fff);border:1px solid var(--ts-border,#dbe3ee);border-radius:20px;box-shadow:0 24px 60px rgba(15,23,42,.25)}.ticket-modal>header{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid var(--ts-border,#e2e8f0)}.ticket-modal>header span{font-size:.68rem;text-transform:uppercase;letter-spacing:.12em;color:var(--ts-muted,#64748b);font-weight:800}.ticket-modal h3{margin:2px 0 0;font-size:1.1rem}.ticket-modal>header button{border:0;background:transparent;font-size:1.6rem;color:var(--ts-muted,#64748b)}.ticket-paper{width:min(80mm,calc(100% - 34px));margin:18px auto;background:#fff;color:#111827;padding:20px 18px;box-shadow:0 5px 22px rgba(15,23,42,.12);font-family:Arial,sans-serif;font-size:12px}.ticket-logo{display:block;max-width:180px;max-height:55px;object-fit:contain;margin:0 auto 8px}.ticket-business{text-align:center;color:#475569;line-height:1.45}.ticket-title{text-align:center;border-block:1px dashed #94a3b8;padding:10px 0;margin:12px 0;display:grid;gap:2px}.ticket-title>b{letter-spacing:.14em}.ticket-title>strong{font-size:1rem}.ticket-title>small{color:#64748b}.ticket-paper dl{display:grid;grid-template-columns:82px 1fr;gap:5px 8px;margin:0 0 12px}.ticket-paper dt{color:#64748b}.ticket-paper dd{margin:0;font-weight:700;overflow-wrap:anywhere}.ticket-lines{border-block:1px solid #cbd5e1}.ticket-lines>div,.ticket-totals>div,.ticket-payment{display:flex;justify-content:space-between;gap:12px;padding:7px 0}.ticket-lines span{min-width:0}.ticket-lines small{display:block;color:#64748b}.ticket-lines b{white-space:nowrap}.ticket-totals{padding-top:7px}.ticket-totals .balance{font-size:1.05rem;font-weight:800}.ticket-payment{border-block:1px dashed #94a3b8;margin-top:4px}.ticket-conditions{border-top:1px dashed #94a3b8;margin-top:8px;padding-top:10px}.ticket-conditions strong{display:block;margin-bottom:6px}.ticket-conditions ul{margin:0;padding-left:18px}.ticket-conditions li{margin:5px 0;line-height:1.35}.ticket-thanks{text-align:center;font-style:italic;letter-spacing:.05em;margin:16px 0 2px}.ticket-modal>footer{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;padding:14px 18px 18px}.ticket-modal>footer button{min-height:44px;border-radius:11px;border:1px solid var(--ts-border,#dbe3ee);background:var(--ts-surface,#fff);font-weight:800}.ticket-modal>footer .primary{background:#175cff;color:#fff;border-color:#175cff}.ticket-modal>footer .wa{background:#16a34a;color:#fff;border-color:#16a34a}@media(max-width:520px){.ticket-modal-backdrop{padding:0;align-items:end}.ticket-modal{width:100%;max-height:96vh;border-radius:20px 20px 0 0}.ticket-paper{width:calc(100% - 28px);padding:18px 16px}.ticket-modal>footer{position:sticky;bottom:0;background:var(--ts-surface,#fff);grid-template-columns:1fr 1fr 1fr}.ticket-modal>footer button{font-size:.8rem}}
</style>
