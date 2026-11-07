import test from 'node:test'
import assert from 'node:assert/strict'
import { supabase } from '../src/repositories/local/client.js'

const storage = new Map()
globalThis.localStorage = {getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}

test('el checkout local es atómico e idempotente', async () => {
  assert.equal(typeof supabase.rpc,'function')
  await supabase.from('ordenes').update({estado:'Listo'}).eq('id',1)
  const request={p_orden_id:1,p_pagos:[{metodo:'Efectivo',monto:1500}],p_entregar:true,p_operacion:'checkout-1',p_total_esperado:2500,p_pagado_esperado:1000,p_estado_esperado:'Listo'}
  const first=await supabase.rpc('cobrar_entregar_orden',request)
  assert.equal(first.error,null)
  assert.equal(first.data.estado,'Entregado')
  const retry=await supabase.rpc('cobrar_entregar_orden',request)
  assert.deepEqual(retry,first)
  const {data:movs}=await supabase.from('movimientos_caja').select('*')
  assert.equal(movs.filter(x=>x.concepto?.includes('Liquidación orden')).length,1)
  const changed=await supabase.rpc('cobrar_entregar_orden',{...request,p_pagos:[]})
  assert.ok(changed.error)
})
test('rechaza cambios concurrentes sin registrar movimientos',async()=>{
  assert.equal(typeof supabase.rpc,'function')
  const before=storage.get('techsoul_os_local_db_v2')
  const result=await supabase.rpc('cobrar_entregar_orden',{p_orden_id:1,p_pagos:[{metodo:'Efectivo',monto:1}],p_entregar:false,p_operacion:'checkout-2',p_total_esperado:2500,p_pagado_esperado:1000,p_estado_esperado:'Listo'})
  assert.ok(result.error)
  assert.equal(storage.get('techsoul_os_local_db_v2'),before)
})
