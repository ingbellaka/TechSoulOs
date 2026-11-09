-- Activar junto con la publicación de la interfaz nueva. El cliente anterior
-- registraba abonos mediante escrituras separadas que esta protección bloquea.
create or replace function public.proteger_finanzas_orden()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if current_user not in ('authenticated','anon') then return new; end if;
  if tg_op='INSERT' then
    if new.estado in ('Listo','Entregado') or new.fecha_entrega is not null then
      raise exception 'Recibe el equipo primero y completa el flujo de Taller.';
    end if;
    return new;
  end if;
  if (new.anticipo is distinct from old.anticipo or new.fecha_entrega is distinct from old.fecha_entrega
      or (new.estado='Entregado' and new.estado is distinct from old.estado))
    and current_setting('techsoul.checkout_orden',true) is distinct from old.id::text then
    raise exception 'Usa Cobrar y entregar desde la ficha para registrar pagos o entregas.';
  end if;
  if new.estado='Listo' and new.estado is distinct from old.estado and (
    old.estado <> 'En pruebas'
    or exists(select 1 from public.control_calidad_orden where orden_id=old.id and estado='No funciona')
    or not exists(select 1 from public.evidencias where orden_id=old.id and tipo in ('Reparación interna','Blindajes antes de cierre'))
    or not exists(select 1 from public.evidencias where orden_id=old.id and tipo='Salida')
  ) then raise exception 'Completa las evidencias y resuelve las fallas registradas antes de liberar el equipo.'; end if;
  return new;
end $$;
revoke all on function public.proteger_finanzas_orden() from public,anon,authenticated;
create trigger proteger_finanzas_orden before insert or update on public.ordenes
for each row execute function public.proteger_finanzas_orden();

create or replace function public.proteger_movimiento_orden()
returns trigger language plpgsql security invoker set search_path='' as $$
declare pagado numeric; suma numeric;
begin
  if current_user not in ('authenticated','anon') then return new; end if;
  if tg_op='UPDATE' and old.referencia_tipo='orden' and old.tipo='Entrada' and
    (new.monto,new.tipo,new.referencia_tipo,new.referencia_id,new.metodo_pago) is distinct from
    (old.monto,old.tipo,old.referencia_tipo,old.referencia_id,old.metodo_pago) then
    raise exception 'El importe y método de un pago registrado no se editan directamente.';
  end if;
  if new.tipo='Entrada' and new.referencia_tipo='orden' then
    if current_setting('techsoul.checkout_orden',true) = new.referencia_id then return new; end if;
    if tg_op='UPDATE' and old.tipo='Entrada' and old.referencia_tipo='orden' then return new; end if;
    -- La recepción puede reflejar en caja el anticipo ya declarado al crear
    -- la orden; nunca puede aumentar el pago acumulado ni liquidar una orden.
    if new.referencia_id !~ '^[0-9]+$' then raise exception 'Referencia de orden inválida.'; end if;
    select anticipo into pagado from public.ordenes where id=new.referencia_id::bigint for update;
    if not found then raise exception 'Orden no encontrada.'; end if;
    select coalesce(sum(monto),0) into suma from public.movimientos_caja
      where tipo='Entrada' and referencia_tipo='orden' and referencia_id=new.referencia_id;
    if suma+new.monto>coalesce(pagado,0) then raise exception 'Usa el cobro de la ficha de la orden.'; end if;
  end if;
  return new;
end $$;
revoke all on function public.proteger_movimiento_orden() from public,anon,authenticated;
create trigger proteger_movimiento_orden before insert or update on public.movimientos_caja
for each row execute function public.proteger_movimiento_orden();

-- Los roles de caja pueden reimprimir cobros de otro operador.
alter policy operaciones_orden_leer on public.operaciones_orden
using (public.mi_rol()::text in ('admin','recepcion'));
alter policy operaciones_orden_insertar on public.operaciones_orden
with check (usuario_id=(select auth.uid()) and public.mi_rol()::text in ('admin','recepcion')
  and current_setting('techsoul.checkout_orden',true)=orden_id::text);

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
    if op.orden_id <> p_orden_id or op.usuario_id <> auth.uid() or op.solicitud <> solicitud then raise exception 'La operación ya se utilizó con otros datos.'; end if;
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
  perform set_config('techsoul.checkout_orden',o.id::text,true);
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
  perform set_config('techsoul.checkout_orden','',true);
  return respuesta;
end $$;
revoke all on function public.cobrar_entregar_orden(bigint,jsonb,boolean,uuid,numeric,numeric,text) from public, anon;
grant execute on function public.cobrar_entregar_orden(bigint,jsonb,boolean,uuid,numeric,numeric,text) to authenticated;
