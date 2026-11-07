-- Pruebas sobre fixtures temporales: siempre termina en ROLLBACK.
begin;
do $$
declare oid bigint; oid_diagnostico bigint; cid bigint; eid bigint; admin_id uuid; op uuid:=gen_random_uuid(); qid uuid:=gen_random_uuid(); r jsonb;
begin
  select id into admin_id from public.perfiles where activo and rol::text='admin' limit 1;
  select id,cliente_id into eid,cid from public.equipos limit 1;
  if eid is null then raise exception 'No hay equipo para la prueba con rollback'; end if;
  insert into public.ordenes(folio,cliente_id,equipo_id,falla_reportada,costo_total,anticipo,estado)
    values('TEST-ROLLBACK-'||gen_random_uuid(),cid,eid,'Verificación temporal',100,20,'Listo') returning id into oid;
  insert into public.ordenes(folio,cliente_id,equipo_id,falla_reportada,costo_total,anticipo,estado)
    values('TEST-ROLLBACK-'||gen_random_uuid(),cid,eid,'Verificación temporal',100,0,'Diagnóstico') returning id into oid_diagnostico;
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  execute 'set local role authenticated';
  r:=public.cobrar_entregar_orden(oid,'[{"metodo":"Efectivo","monto":30},{"metodo":"Transferencia","monto":50}]',true,op,100,20,'Listo');
  if r->>'estado'<>'Entregado' or (r->>'anticipo')::numeric<>100 then raise exception 'Checkout incorrecto'; end if;
  r:=public.cobrar_entregar_orden(oid,'[{"metodo":"Efectivo","monto":30},{"metodo":"Transferencia","monto":50}]',true,op,100,20,'Listo');
  if (select count(*) from public.movimientos_caja where referencia_tipo='orden' and referencia_id=oid::text)<>2 then raise exception 'Pago duplicado'; end if;
  begin
    perform public.cobrar_entregar_orden(oid,'[]',true,op,100,20,'Listo');
    raise exception 'FAIL cambió la solicitud';
  exception when others then if sqlerrm='FAIL cambió la solicitud' then raise; end if; end;
  oid:=oid_diagnostico;
  begin
    perform public.cobrar_entregar_orden(oid,'[{"metodo":"Efectivo","monto":100}]',true,gen_random_uuid(),100,0,'Diagnóstico');
    raise exception 'FAIL entregó sin pruebas';
  exception when others then if sqlerrm='FAIL entregó sin pruebas' then raise; end if; end;
  if exists(select 1 from public.movimientos_caja where referencia_tipo='orden' and referencia_id=oid::text) then raise exception 'Escritura parcial'; end if;
  insert into public.cotizaciones_calculador(id,datos) values(qid,'{"precio_final":75,"servicio":"Pantalla","modelo":"Prueba","marca":"Prueba"}');
  r:=public.agregar_cotizacion_orden(oid,qid,100);
  if (r->>'costo_total')::numeric<>175 then raise exception 'Cotización incorrecta'; end if;
  r:=public.agregar_cotizacion_orden(oid,qid,100);
  if (select count(*) from public.orden_servicios where orden_id=oid)<>1 then raise exception 'Cotización duplicada'; end if;
end $$;
rollback;
select 'PASS: cobro dividido, idempotencia, entrega validada, cotización sin duplicados. Datos de prueba revertidos.' as resultado;
