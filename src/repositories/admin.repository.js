import { supabase } from '../lib/supabase'

const unwrap = (r, msg) => { if (r?.error) throw new Error(r.error.message || msg); return r?.data ?? null }
export const adminRepository = {
  async usuarios(){ return unwrap(await supabase.from('perfiles').select('*').order('nombre'), 'No se pudieron cargar usuarios') || [] },
  async guardarUsuario(usuario){
    const payload={ nombre:usuario.nombre, email:usuario.email, rol:usuario.rol, activo:usuario.activo, telefono:usuario.telefono||null, puesto:usuario.puesto||null, actualizado_en:new Date().toISOString() }
    return unwrap(await supabase.from('perfiles').update(payload).eq('id',usuario.id).select().single(),'No se pudo guardar el usuario')
  },
  async roles(){ return unwrap(await supabase.from('roles_sistema').select('*').eq('activo',true).order('nombre'),'No se pudieron cargar roles')||[] },
  async permisos(){ return unwrap(await supabase.from('permisos_sistema').select('*').order('rol_clave').order('modulo'),'No se pudieron cargar permisos')||[] },
  async guardarPermiso(p){ return unwrap(await supabase.from('permisos_sistema').update({puede_ver:p.puede_ver,puede_crear:p.puede_crear,puede_editar:p.puede_editar,puede_eliminar:p.puede_eliminar,puede_cobrar:p.puede_cobrar,actualizado_en:new Date().toISOString()}).eq('id',p.id).select().single(),'No se pudo guardar el permiso') },
  async metodos(){ return unwrap(await supabase.from('metodos_pago_config').select('*').order('orden'),'No se pudieron cargar métodos')||[] },
  async guardarMetodo(m){ if(m.id) return unwrap(await supabase.from('metodos_pago_config').update(m).eq('id',m.id).select().single(),'No se pudo actualizar'); return unwrap(await supabase.from('metodos_pago_config').insert(m).select().single(),'No se pudo crear') },
  async auditoria(limit=200){ return unwrap(await supabase.from('auditoria').select('*').order('creado_en',{ascending:false}).limit(limit),'No se pudo cargar auditoría')||[] }
}
