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
  ) then raise exception 'El equipo debe estar En pruebas y sin fallas registradas para liberarse.'; end if;
  return new;
end $$;
revoke all on function public.proteger_finanzas_orden() from public,anon,authenticated;
