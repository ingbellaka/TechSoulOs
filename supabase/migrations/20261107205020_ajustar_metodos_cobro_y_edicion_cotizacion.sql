create or replace function public.cobrar_entregar_orden(
  p_orden_id bigint, p_pagos jsonb, p_entregar boolean, p_operacion uuid,
  p_total_esperado numeric, p_pagado_esperado numeric, p_estado_esperado text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  o public.ordenes%rowtype; op public.operaciones_orden%rowtype;
  pago jsonb; monto numeric; suma numeric := 0; pagado numeric;
  respuesta jsonb; solicitud jsonb; movimiento public.movimientos_caja%rowtype; movimientos jsonb := '[]';
begin
  if auth.uid() is null or not exists(select 1 from public.perfiles where id=auth.uid() and activo and rol::text in ('admin','recepcion')) then
    raise exception 'No tienes permiso para cobrar o entregar.';
  end if;
  if p_operacion is null or p_entregar is null or p_pagos is null or jsonb_typeof(p_pagos) <> 'array' then raise exception 'Operación inválida.'; end if;
  select * into o from public.ordenes where id=p_orden_id for update;
  if not found then raise exception 'Orden no encontrada.'; end if;
  solicitud := jsonb_build_object('pagos',p_pagos,'entregar',p_entregar,'total',p_total_esperado,'pagado',p_pagado_esperado,'estado',p_estado_esperado);
  select * into op from public.operaciones_orden where id=p_operacion;
  if found then
    if op.orden_id <> p_orden_id or op.solicitud <> solicitud then raise exception 'La operación ya se utilizó con otros datos.'; end if;
    return op.resultado;
  end if;
  if o.costo_total is distinct from p_total_esperado or coalesce(o.anticipo,0) is distinct from p_pagado_esperado or o.estado is distinct from p_estado_esperado then
    raise exception 'La orden cambió en otra sesión. Recarga antes de cobrar.';
  end if;
  if o.estado in ('Entregado','Cancelado','Devuelto sin reparación') then raise exception 'La orden está cerrada.'; end if;
  for pago in select value from jsonb_array_elements(p_pagos) loop
    if coalesce(pago->>'metodo','') not in ('Efectivo','Transferencia','Tarjeta','Mercado Pago','Otro') or coalesce(pago->>'monto','') !~ '^[0-9]+(\.[0-9]{1,2})?$' then raise exception 'Pago inválido.'; end if;
    monto := (pago->>'monto')::numeric;
    if monto <= 0 then raise exception 'El pago debe ser mayor a cero.'; end if;
    suma := suma + monto;
  end loop;
  pagado := coalesce(o.anticipo,0) + suma;
  if suma > greatest(0, o.costo_total-coalesce(o.anticipo,0)) then raise exception 'El pago supera el saldo.'; end if;
  if p_entregar and (o.estado <> 'Listo' or pagado < o.costo_total) then raise exception 'Para entregar debe estar Listo y liquidado.'; end if;
  if not p_entregar and suma <= 0 then raise exception 'Captura un pago.'; end if;
  for pago in select value from jsonb_array_elements(p_pagos) loop
    insert into public.movimientos_caja(tipo,concepto,monto,metodo_pago,referencia_tipo,referencia_id,usuario_id)
    values('Entrada',case when pagado >= o.costo_total then 'Liquidación' else 'Abono' end || ' orden ' || o.folio,
      (pago->>'monto')::numeric,pago->>'metodo','orden',o.id::text,auth.uid()) returning * into movimiento;
    movimientos := movimientos || jsonb_build_array(jsonb_build_object('id',movimiento.id,'fecha_movimiento',movimiento.fecha_movimiento,'monto',movimiento.monto,'metodo_pago',movimiento.metodo_pago));
  end loop;
  update public.ordenes set anticipo=pagado,
    estado=case when p_entregar then 'Entregado' else estado end,
    fecha_entrega=case when p_entregar then now() else fecha_entrega end where id=o.id;
  insert into public.orden_historial(orden_id,tipo,titulo,descripcion,estado_anterior,estado_nuevo,usuario_id)
  values(o.id,case when p_entregar then 'estado' else 'pago' end,
    case when p_entregar then 'Equipo entregado' else 'Pago registrado' end,
    'Pago recibido: $' || suma || '. Saldo: $' || greatest(0,o.costo_total-pagado),o.estado,
    case when p_entregar then 'Entregado' else o.estado end,auth.uid());
  select to_jsonb(x) || jsonb_build_object('movimientos_checkout',movimientos) into respuesta from public.ordenes x where id=o.id;
  insert into public.operaciones_orden(id,orden_id,solicitud,resultado) values(p_operacion,o.id,solicitud,respuesta);
  return respuesta;
end $$;
revoke all on function public.cobrar_entregar_orden(bigint,jsonb,boolean,uuid,numeric,numeric,text) from public, anon;
grant execute on function public.cobrar_entregar_orden(bigint,jsonb,boolean,uuid,numeric,numeric,text) to authenticated;

create or replace function public.agregar_cotizacion_orden(p_orden_id bigint,p_cotizacion_id uuid,p_total_esperado numeric)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare o public.ordenes%rowtype; q jsonb; precio numeric; descripcion_servicio text;
begin
  if auth.uid() is null or not exists(select 1 from public.perfiles where id=auth.uid() and activo and rol::text in ('admin','recepcion','tecnico')) then raise exception 'Sin permiso.'; end if;
  select * into o from public.ordenes where id=p_orden_id for update;
  if not found then raise exception 'Orden no encontrada.'; end if;
  if o.estado not in ('Recibido','Diagnóstico','Esperando autorización') then raise exception 'Esta orden ya no admite cambios de cotización.'; end if;
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
