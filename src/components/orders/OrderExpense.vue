<script setup>
import { onMounted, ref } from 'vue'
import { guardarGastoOrden } from '../../services/gastos-orden.service'

const props = defineProps({ order: { type: Object, required: true } })
const emit = defineEmits(['saved', 'close'])
const dialog = ref(null)
const tipo = ref('Refacción')
const detalle = ref('')
const proveedor = ref('')
const monto = ref(null)
const metodo = ref('Transferencia')
const guardando = ref(false)
const error = ref('')

onMounted(() => dialog.value?.showModal())

async function guardar() {
  if (guardando.value) return
  if (!detalle.value.trim() || !Number.isFinite(monto.value) || monto.value <= 0) {
    error.value = 'Escribe el detalle y captura un importe mayor a cero.'
    return
  }
  guardando.value = true
  error.value = ''
  try {
    const concepto = [tipo.value, detalle.value.trim(), proveedor.value.trim()].filter(Boolean).join(' · ')
    const historialGuardado = await guardarGastoOrden(props.order, { concepto, monto: monto.value, metodo: metodo.value })
    emit('saved', historialGuardado)
    dialog.value.close()
  } catch (e) {
    error.value = e.message || 'No se pudo registrar el gasto.'
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="order-expense-dialog" aria-labelledby="order-expense-title" @cancel="guardando && $event.preventDefault()" @close="emit('close')">
      <form class="order-expense-form" @submit.prevent="guardar">
        <div><h2 id="order-expense-title">Registrar pieza o gasto</h2><p>Orden {{ order.folio }} · El pago se vincula a Caja y a esta orden.</p></div>
        <label class="ts-field"><span>Tipo de gasto</span><select v-model="tipo"><option>Refacción</option><option>Trabajo externo</option><option>Otro gasto</option></select></label>
        <label class="ts-field"><span>Detalle</span><input v-model="detalle" required maxlength="100" placeholder="Ej. Pantalla OLED o reparación de lógica"></label>
        <label class="ts-field"><span>Proveedor</span><input v-model="proveedor" maxlength="50" placeholder="Ej. Villanotec"></label>
        <label class="ts-field"><span>Importe pagado</span><input v-model.number="monto" type="number" required min="0.01" step="0.01" inputmode="decimal"></label>
        <label class="ts-field"><span>Método</span><select v-model="metodo"><option>Transferencia</option><option>Efectivo</option><option>Tarjeta</option></select></label>
        <p v-if="error" role="alert">{{ error }}</p>
        <div class="order-expense-actions"><button type="button" class="ts-action-secondary" :disabled="guardando" @click="dialog.close()">Cancelar</button><button type="submit" class="ts-action-primary" :disabled="guardando">{{ guardando ? 'Guardando…' : 'Registrar gasto' }}</button></div>
      </form>
    </dialog>
  </Teleport>
</template>

<style scoped>
.order-expense-dialog {
  width: min(32rem, calc(100% - 2rem));
  max-height: 90dvh;
  padding: 1.25rem;
  border: 1px solid var(--ts-border);
  border-radius: 16px;
  background: var(--ts-surface);
  color: var(--ts-text);
}
.order-expense-dialog::backdrop { background: #101d3880; }
.order-expense-form { display: grid; gap: .85rem; }
.order-expense-form h2 { font-size: 1.25rem; }
.order-expense-form p { margin: 0; }
.order-expense-actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: .55rem; }
</style>
