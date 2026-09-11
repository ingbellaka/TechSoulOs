-- TechSoul OS · Panel de Taller V1
-- Ejecutar una sola vez en Supabase > SQL Editor.
-- No reemplaza el estado de la orden: agrega una capa interna de producción.

begin;

create table if not exists public.orden_produccion (
  orden_id bigint primary key references public.ordenes(id) on delete cascade,
  etapa text not null default 'por_hacer'
    check (etapa in ('por_hacer','diagnostico','reparacion','pruebas','listo')),
  prioridad text not null default 'normal'
    check (prioridad in ('baja','normal','alta','urgente')),
  tecnico_id uuid references public.perfiles(id) on delete set null,
  tiempo_estimado_min integer not null default 60 check (tiempo_estimado_min >= 0),
  tiempo_acumulado_seg bigint not null default 0 check (tiempo_acumulado_seg >= 0),
  corriendo boolean not null default false,
  ultima_reanudacion_en timestamptz,
  iniciado_en timestamptz,
  finalizado_en timestamptz,
  bloqueada boolean not null default false,
  motivo_bloqueo text default '',
  notas_internas text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orden_produccion_etapa_idx on public.orden_produccion(etapa);
create index if not exists orden_produccion_prioridad_idx on public.orden_produccion(prioridad);
create index if not exists orden_produccion_tecnico_idx on public.orden_produccion(tecnico_id);

-- Crea ficha de producción para órdenes abiertas existentes.
insert into public.orden_produccion (orden_id, etapa, prioridad, tiempo_estimado_min)
select
  o.id,
  case
    when o.estado = 'Diagnóstico' then 'diagnostico'
    when o.estado = 'En reparación' then 'reparacion'
    when o.estado = 'Listo' then 'listo'
    else 'por_hacer'
  end,
  'normal',
  60
from public.ordenes o
where o.estado not in ('Entregado','Cancelado')
on conflict (orden_id) do nothing;

-- Las órdenes nuevas reciben automáticamente su ficha de producción.
create or replace function public.crear_produccion_orden()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.orden_produccion (orden_id)
  values (new.id)
  on conflict (orden_id) do nothing;
  return new;
end;
$$;

drop trigger if exists al_crear_orden_produccion on public.ordenes;
create trigger al_crear_orden_produccion
after insert on public.ordenes
for each row execute function public.crear_produccion_orden();

-- updated_at
create or replace function public.actualizar_orden_produccion_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists orden_produccion_actualizar_updated_at on public.orden_produccion;
create trigger orden_produccion_actualizar_updated_at
before update on public.orden_produccion
for each row execute function public.actualizar_orden_produccion_updated_at();

alter table public.orden_produccion enable row level security;

drop policy if exists orden_produccion_leer on public.orden_produccion;
create policy orden_produccion_leer on public.orden_produccion
for select to authenticated
using (public.mi_rol() is not null);

drop policy if exists orden_produccion_insertar on public.orden_produccion;
create policy orden_produccion_insertar on public.orden_produccion
for insert to authenticated
with check (public.mi_rol() in ('admin','recepcion','tecnico'));

drop policy if exists orden_produccion_actualizar on public.orden_produccion;
create policy orden_produccion_actualizar on public.orden_produccion
for update to authenticated
using (public.mi_rol() in ('admin','recepcion','tecnico'))
with check (public.mi_rol() in ('admin','recepcion','tecnico'));

drop policy if exists orden_produccion_eliminar on public.orden_produccion;
create policy orden_produccion_eliminar on public.orden_produccion
for delete to authenticated
using (public.es_admin());

grant select, insert, update, delete on public.orden_produccion to authenticated;

commit;
