import { supabase } from '../lib/supabase'
import { defaultPricingSettings } from '../lib/pricing'

export async function loadCalculator() {
  const [quotes, config] = await Promise.all([
    supabase.from('cotizaciones_calculador').select('*').order('created_at',{ascending:false}).limit(100),
    supabase.from('configuracion_calculador').select('*').eq('id',1)
  ])
  if (quotes.error || config.error) throw new Error(quotes.error?.message || config.error.message)
  const settings = config.data?.[0]?.datos || defaultPricingSettings
  return {quotes:(quotes.data || []).map(q=>({...q.datos,id:q.id})),settings:{...defaultPricingSettings,...settings,riesgo:{...defaultPricingSettings.riesgo,...settings.riesgo}}}
}
export async function saveCalculatorSettings(settings) {
  const {error}=await supabase.from('configuracion_calculador').upsert({id:1,datos:JSON.parse(JSON.stringify(settings)),updated_at:new Date().toISOString()})
  if(error) throw new Error(error.message)
}
export async function saveCalculatorQuote(quote) {
  const {error}=await supabase.from('cotizaciones_calculador').insert({id:quote.id,datos:quote})
  if(error) throw new Error(error.message)
  return quote
}
export async function addQuoteToOrder(order,quoteId) {
  const {data,error}=await supabase.rpc('agregar_cotizacion_orden',{p_orden_id:order.id,p_cotizacion_id:quoteId,p_total_esperado:Number(order.costo_total || 0)})
  if(error) throw new Error(error.message)
  return data
}
