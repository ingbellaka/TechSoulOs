import { supabase } from '../lib/supabase'
const unwrap=(r,m)=>{if(r?.error)throw new Error(r.error.message||m);return r?.data??null}
export const aiRepository={
 async buscar(termino,limite=12){return unwrap(await supabase.rpc('buscar_conocimiento_ia',{termino,limite}),'No se pudo buscar conocimiento')||[]},
 async contextoNegocio(){
  const [config,faq,promos,servicios]=await Promise.all([
   supabase.from('configuracion_negocio').select('*').order('id').limit(1).maybeSingle(),
   supabase.from('faq').select('*').eq('activo',true).order('prioridad',{ascending:false}),
   supabase.from('promociones').select('*').eq('activo',true),
   supabase.from('catalogo_servicios').select('*').eq('activo',true)
  ]); return {config:unwrap(config,'Configuración'),faq:unwrap(faq,'FAQ')||[],promociones:unwrap(promos,'Promociones')||[],servicios:unwrap(servicios,'Servicios')||[]}
 }
}
