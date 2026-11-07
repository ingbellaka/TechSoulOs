import test from 'node:test'
import assert from 'node:assert/strict'
import { buildTicketOrdenServicio } from '../src/utils/tickets.js'
test('ticket respeta garantía cero y condiciones registradas',()=>{
 const t=buildTicketOrdenServicio({orden:{id:1,estado:'Entregado',costo_total:100,anticipo:100,garantia_dias:0,garantia_condiciones:'Sin garantía por daño previo',fecha_entrega:'2026-11-06T18:00:00Z'}})
 assert.equal(t.title,'TICKET DE ENTREGA')
 assert.equal(t.warrantyDays,0)
 assert.equal(t.date,'2026-11-06T18:00:00Z')
 assert.deepEqual(t.conditions,['Sin garantía por daño previo'])
})
test('ticket de recepción no promete garantía fija de 90 días',()=>{
 const t=buildTicketOrdenServicio({orden:{estado:'Recibido',garantia_dias:30}})
 assert.equal(t.title,'TICKET DE RECEPCIÓN')
 assert.ok(t.conditions.some(x=>x.includes('30 días')))
 assert.ok(!t.conditions.some(x=>x.includes('90 días')))
})
