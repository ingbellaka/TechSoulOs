<script setup>
import { computed, nextTick, ref } from 'vue'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/auth'
import { checkoutOrder } from '../../services/checkout.service'
import { cents, paymentMethods, validateCheckout } from '../../utils/checkout'
import { buildTicketOrdenServicio, buildReciboOrden, monedaMX } from '../../utils/tickets'
import TicketPreviewModal from '../tickets/TicketPreviewModal.vue'

const props = defineProps({ order: { type: Object, required: true }, autoOpen: Boolean, autoTicket: Boolean, hideTriggers: Boolean })
const emit = defineEmits(['saved'])
const auth = useAuthStore()
const canCharge = computed(() => auth.can(['admin', 'recepcion']))
const open = ref(false), busy = ref(false), error = ref(''), ticket = ref(null)
const payments = ref([]), deliver = ref(false), operationId = ref(''), frozen = ref(null)
const saved = ref(null)
const dialog = ref(null)
const pendingKey = `techsoul.checkout.${auth.user?.id}.${props.order.id}`
function readPending() {
  try { return JSON.parse(sessionStorage.getItem(pendingKey) || 'null') }
  catch { return null }
}
const pending = ref(readPending())
const balance = computed(() => Math.max(0, cents(props.order.costo_total || 0) - cents(props.order.anticipo || 0)) / 100)
const received = computed(() => payments.value.reduce((s, p) => s + cents(p.monto || 0), 0) / 100)
const remaining = computed(() => Math.max(0, Math.round((balance.value - received.value) * 100) / 100))
const closed = computed(() => ['Entregado','Cancelado','Devuelto sin reparación'].includes(props.order.estado))

function start() {
  error.value = ''; saved.value = null; frozen.value = null
  pending.value = readPending()
  operationId.value = pending.value?.id || crypto.randomUUID()
  frozen.value = pending.value?.request || null
  payments.value = frozen.value?.payments || (balance.value > 0 ? [{metodo:'Efectivo',monto:balance.value}] : [])
  deliver.value = frozen.value?.deliver ?? (props.order.estado === 'Listo'); open.value = true
  if (frozen.value) error.value = 'Hay una operación pendiente de confirmar. Reinténtala para recuperar el resultado sin duplicar el cobro.'
  nextTick(() => dialog.value?.focus())
}
async function showTicket(order = props.order, receipt = false) {
  error.value = ''
  const { data, error: configError } = await supabase.from('configuracion_negocio').select('*').order('id').limit(1).maybeSingle()
  if (configError) { error.value = 'La operación está guardada. No se pudo cargar el negocio para imprimir; vuelve a abrir el ticket.'; return }
  const fullOrder = {...props.order,...order}
  if (receipt && saved.value && frozen.value && !frozen.value.deliver) {
    const request=frozen.value
    const movements = order.movimientos_checkout
    if(!movements?.length){error.value='El pago está guardado, pero no se pudo recuperar el recibo. Consulta los movimientos en la ficha.';return}
    const movement={...movements[0],monto:request.payments.reduce((sum,p)=>sum+p.monto,0),metodo_pago:request.payments.map(p=>`${p.metodo}: ${monedaMX(p.monto)}`).join(' + ')}
    ticket.value=buildReciboOrden({movimiento:movement,orden:fullOrder,negocio:data||{},pagadoAnterior:Number(request.order.anticipo||0)})
  } else {
    const {data:movements}=await supabase.from('movimientos_caja').select('metodo_pago,monto').eq('referencia_tipo','orden').eq('referencia_id',order.id).eq('tipo','Entrada').order('id')
    const amounts=new Map()
    for(const m of movements || []) if(m.metodo_pago) amounts.set(m.metodo_pago,(amounts.get(m.metodo_pago)||0)+cents(m.monto))
    const method=[...amounts].map(([metodo,monto])=>`${metodo}: ${monedaMX(monto/100)}`).join(' + ')
    ticket.value = buildTicketOrdenServicio({ orden: fullOrder, negocio:data || {},paymentMethod:method })
  }
}
async function submit() {
  if (busy.value || saved.value) return
  error.value = ''
  try {
    if (!frozen.value) {
      validateCheckout(props.order, payments.value, deliver.value)
      const { id, estado, costo_total, anticipo } = props.order
      const request = {order:{id,estado,costo_total,anticipo},payments:payments.value.map(p=>({...p,monto:cents(p.monto)/100})),deliver:deliver.value}
      const record = {id:operationId.value, request}
      sessionStorage.setItem(pendingKey,JSON.stringify(record))
      pending.value = record
      frozen.value = request
    }
    busy.value = true
    const request = frozen.value
    saved.value = await checkoutOrder(request.order,request.payments,request.deliver,operationId.value)
    sessionStorage.removeItem(pendingKey)
    pending.value = null
    emit('saved',saved.value)
    await showTicket(saved.value, true)
    if (ticket.value) open.value = false
  } catch (e) {
    if (/^[0-9A-Z]{5}$/.test(e.code || '')) {
      sessionStorage.removeItem(pendingKey); pending.value = null; frozen.value = null
      operationId.value = crypto.randomUUID()
      emit('saved')
      error.value = e.message
    } else error.value = frozen.value ? `${e.message} Reintenta la misma operación para confirmar si se guardó.` : e.message
  }
  finally { busy.value = false }
}
// Abrir desde un enlace del dashboard sin escribir en la orden.
if (props.autoOpen && canCharge.value && (pending.value || (!closed.value && (balance.value || props.order.estado === 'Listo')))) start()
if (props.autoTicket) void showTicket()
</script>

<template>
  <button v-if="!hideTriggers && canCharge && (pending || (!closed && (balance || order.estado === 'Listo')))" type="button" class="ts-action-primary" @click="start">{{ pending ? 'Revisar cobro pendiente' : order.estado === 'Listo' ? 'Cobrar y entregar' : 'Registrar pago' }}</button>
  <button v-if="!hideTriggers" type="button" class="ts-action-secondary" @click="showTicket()">{{ closed ? 'Reimprimir ticket · 58 mm' : 'Ticket · 58 mm' }}</button>
  <p v-if="error && !open" role="alert" class="checkout-error">{{error}}</p>
  <Teleport to="body">
    <div v-if="open" class="checkout-backdrop" @click.self="!busy && (open=false)">
      <section ref="dialog" tabindex="-1" class="checkout-dialog" role="dialog" aria-modal="true" aria-labelledby="checkout-title" @keydown.esc="!busy && (open=false)">
        <header><div><small>{{ order.folio }} · {{ order.clientes?.nombre }}</small><h2 id="checkout-title">{{ saved ? 'Operación guardada' : order.estado === 'Listo' ? 'Cobrar y entregar' : 'Registrar pago' }}</h2></div><button type="button" aria-label="Cerrar" :disabled="busy" @click="open=false">×</button></header>
        <p>{{ order.equipos?.marca }} {{ order.equipos?.modelo }}</p>
        <dl><div><dt>Total</dt><dd>{{ monedaMX(order.costo_total) }}</dd></div><div><dt>Pagado</dt><dd>{{ monedaMX(order.anticipo) }}</dd></div><div class="checkout-balance"><dt>Saldo</dt><dd>{{ monedaMX(balance) }}</dd></div></dl>
        <template v-if="!saved">
          <fieldset :disabled="busy || !!frozen">
            <legend>Pago recibido</legend>
            <p v-if="!balance">La orden ya está pagada. Puedes confirmar la entrega.</p>
            <div v-for="(payment,i) in payments" :key="i" class="checkout-payment">
              <label>Método<select v-model="payment.metodo"><option v-for="method in paymentMethods" :key="method">{{ method }}</option></select></label>
              <label>Importe<input v-model="payment.monto" type="number" min="0.01" step="0.01" inputmode="decimal"></label>
              <button type="button" :aria-label="`Quitar pago ${i+1}`" @click="payments.splice(i,1)">×</button>
            </div>
            <button v-if="balance" type="button" class="ts-action-secondary" @click="payments.push({metodo:'Transferencia',monto:remaining})">Agregar otro método</button>
            <label v-if="order.estado === 'Listo'" class="checkout-deliver"><input v-model="deliver" type="checkbox"> Confirmar entrega del equipo</label>
            <p v-else>La entrega estará disponible al terminar las pruebas y marcar el equipo como Listo.</p>
          </fieldset>
          <p class="checkout-payment-status" :class="{ covered: remaining === 0 }" aria-live="polite">Saldo después del pago: <strong>{{ monedaMX(remaining) }}</strong></p>
        </template>
        <p v-else role="status">{{ saved.estado === 'Entregado' ? 'Entrega confirmada.' : 'Pago registrado.' }} Puedes imprimir o reimprimir el ticket sin registrar otro cobro.</p>
        <p v-if="error" role="alert" class="checkout-error">{{ error }}</p>
        <footer><button v-if="!saved" type="button" class="ts-action-primary" :disabled="busy" @click="submit">{{ busy ? 'Guardando…' : frozen ? 'Reintentar operación' : deliver ? 'Confirmar entrega y abrir ticket' : 'Guardar pago y abrir ticket' }}</button><button v-else type="button" class="ts-action-primary" @click="showTicket(saved,true)">Abrir ticket de 58 mm</button></footer>
      </section>
    </div>
  </Teleport>
  <TicketPreviewModal :ticket="ticket" @close="ticket=null" />
</template>

<style scoped>
.checkout-backdrop{position:fixed;inset:0;z-index:2500;background:#0008;display:grid;place-items:center;padding:16px}.checkout-dialog{width:min(560px,100%);max-height:92dvh;overflow:auto;background:var(--ts-surface,#fff);color:var(--ts-text,#102044);border-radius:18px;padding:24px;display:grid;gap:16px}.checkout-dialog header{display:flex;justify-content:space-between;gap:12px}.checkout-dialog h2,.checkout-dialog p{margin:0}.checkout-dialog header button{border:0;background:transparent;color:inherit;font-size:26px}.checkout-dialog dl{display:flex;justify-content:space-between;gap:12px;margin:0}.checkout-dialog dd{margin:4px 0;font-weight:700}.checkout-dialog dt,.checkout-dialog small{color:var(--ts-muted,#64748b)}fieldset{border:0;padding:0;min-width:0;display:grid;gap:14px}legend{font-size:1rem}.checkout-payment{display:flex;gap:8px;align-items:end}.checkout-payment label{display:grid;gap:5px;flex:1;min-width:0}.checkout-payment input,.checkout-payment select{width:100%;min-height:44px;border:1px solid var(--ts-border,#ddd);border-radius:8px;background:var(--ts-surface,#fff);color:inherit;padding:8px}.checkout-deliver{display:flex;align-items:center;gap:10px;min-height:44px}.checkout-error{color:#b42318}footer button{width:100%}@media(max-width:420px){.checkout-dialog{padding:16px}.checkout-payment{flex-wrap:wrap}.checkout-payment label{flex-basis:40%}}
</style>
