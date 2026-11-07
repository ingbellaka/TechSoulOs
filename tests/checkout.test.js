import test from 'node:test'
import assert from 'node:assert/strict'
import * as checkout from '../src/utils/checkout.js'

test('valida pago dividido usando centavos y permite liquidar', () => {
  assert.equal(typeof checkout.validateCheckout, 'function')
  const r = checkout.validateCheckout({ estado: 'Listo', costo_total: 100.3, anticipo: 0.1 }, [{metodo:'Efectivo',monto:50.1},{metodo:'Transferencia',monto:50.1}], true)
  assert.equal(r.total, 100.2)
  assert.equal(r.balance, 0)
})
test('rechaza sobrepago, negativos, NaN y entrega pendiente', () => {
  assert.equal(typeof checkout.validateCheckout, 'function')
  const o = { estado:'Listo', costo_total:100, anticipo:20 }
  for (const monto of [81, -1, 'no']) assert.throws(()=>checkout.validateCheckout(o,[{metodo:'Efectivo',monto}],false))
  assert.throws(()=>checkout.validateCheckout(o,[{metodo:'Efectivo',monto:10}],true))
  assert.throws(()=>checkout.validateCheckout({...o,estado:'Diagnóstico'},[{metodo:'Efectivo',monto:80}],true))
})
test('permite entrega previamente pagada sin crear otro pago', () => {
  assert.equal(typeof checkout.validateCheckout, 'function')
  assert.equal(checkout.validateCheckout({estado:'Listo',costo_total:100,anticipo:100},[],true).total,0)
  assert.throws(()=>checkout.validateCheckout({estado:'Entregado',costo_total:100,anticipo:100},[],true))
})
