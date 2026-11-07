create or replace function public.agregar_cotizacion_orden(p_orden_id bigint,p_cotizacion_id uuid,p_total_esperado numeric)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare o public.ordenes%rowtype; q jsonb; precio numeric; descripcion_servicio text;
begin
  if auth.uid() is null or not exists(select 1 from public.perfiles where id=auth.uid() and activo and rol::text in ('admin','recepcion','tecnico')) then raise exception 'Sin permiso.'; end if;
  select * into o from public.ordenes where id=p_orden_id for update;
  if not found then raise exception 'Orden no encontrada.'; end if;
  if o.estado not in ('Recibido','Diagnóstico','Esperando autorización','Esperando pieza') then raise exception 'Esta orden ya no admite cambios de cotización.'; end if;
  if exists(select 1 from public.orden_historial where orden_id=o.id and tipo='cotizacion' and descripcion=p_cotizacion_id::text) then return to_jsonb(o); end if;
  if o.costo_total is distinct from p_total_esperado then raise exception 'El total cambió. Recarga la orden.'; end if;
  select datos into q from public.cotizaciones_calculador where id=p_cotizacion_id;
  if q is null then raise exception 'Cotización no encontrada.'; end if;
  precio := round((q->>'precio_final')::numeric,2);
  if precio is null or precio <= 0 or precio::text in ('NaN','Infinity','-Infinity') then raise exception 'Precio inválido.'; end if;
  descripcion_servicio := concat_ws(' · ',q->>'servicio',q->>'marca',q->>'modelo',nullif(q->>'calidad',''));
  insert into public.orden_servicios(orden_id,tipo_servicio,descripcion,precio,estado,orden_visual)
    values(o.id,q->>'servicio',descripcion_servicio,precio,'Pendiente',(select coalesce(max(orden_visual),0)+1 from public.orden_servicios where orden_id=o.id));
  update public.ordenes set costo_total=coalesce(costo_total,0)+precio where id=o.id returning * into o;
  insert into public.orden_historial(orden_id,tipo,titulo,descripcion,usuario_id) values(o.id,'cotizacion','Servicio cotizado agregado',p_cotizacion_id::text,auth.uid());
  return to_jsonb(o);
end $$;
revoke all on function public.agregar_cotizacion_orden(bigint,uuid,numeric) from public,anon;
grant execute on function public.agregar_cotizacion_orden(bigint,uuid,numeric) to authenticated;
