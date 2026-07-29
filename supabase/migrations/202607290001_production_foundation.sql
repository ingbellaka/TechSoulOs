-- TechSoul OS v2.0 · Base segura de producción
-- Ejecutar UNA VEZ en Supabase > SQL Editor.
-- Administrador inicial: ingyulianaarredondo@gmail.com

begin;

create type public.app_role as enum ('admin', 'recepcion', 'tecnico', 'consulta');

create table if not exists public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  nombre text,
  rol public.app_role not null default 'tecnico',
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.crear_perfil_usuario()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.perfiles (id, email, nombre, rol)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'nombre', split_part(coalesce(new.email, ''), '@', 1)),
    case when lower(coalesce(new.email, '')) = 'ingyulianaarredondo@gmail.com'
      then 'admin'::public.app_role
      else 'tecnico'::public.app_role
    end
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario
after insert or update of email on auth.users
for each row execute procedure public.crear_perfil_usuario();

-- Crea el perfil del administrador si la cuenta ya fue creada antes de ejecutar este script.
insert into public.perfiles (id, email, nombre, rol)
select id, email, coalesce(raw_user_meta_data ->> 'nombre', 'Yuliana Arredondo'), 'admin'::public.app_role
from auth.users
where lower(email) = 'ingyulianaarredondo@gmail.com'
on conflict (id) do update set rol = 'admin', activo = true, email = excluded.email;

create or replace function public.mi_rol()
returns public.app_role
language sql
stable
security definer set search_path = public
as $$
  select rol from public.perfiles where id = auth.uid() and activo = true;
$$;

create or replace function public.es_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$ select coalesce(public.mi_rol() = 'admin'::public.app_role, false); $$;

grant execute on function public.mi_rol() to authenticated;
grant execute on function public.es_admin() to authenticated;

alter table public.perfiles enable row level security;
drop policy if exists perfiles_lectura on public.perfiles;
create policy perfiles_lectura on public.perfiles
for select to authenticated
using (id = auth.uid() or public.es_admin());

drop policy if exists perfiles_admin_modifica on public.perfiles;
create policy perfiles_admin_modifica on public.perfiles
for update to authenticated
using (public.es_admin()) with check (public.es_admin());

-- Aplica RLS base a las tablas operativas que ya existan.
-- Lectura: usuarios autenticados activos.
-- Escritura: admin/recepción/técnico. Configuración, usuarios y caja sensible: admin/recepción.
do $$
declare
  t text;
  tablas text[] := array[
    'clientes','equipos','ordenes','detalle_orden','ordenes_historial','presupuestos',
    'presupuesto_detalle','ventas','detalle_ventas','productos','movimientos_inventario',
    'proveedores','ordenes_compra','ordenes_compra_detalle','solicitudes_compra',
    'movimientos_caja','cajas','garantias','reclamaciones_garantia','tarifas',
    'firmas_orden','configuracion_negocio','configuracion_garantias'
  ];
begin
  foreach t in array tablas loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists %I on public.%I', t || '_leer', t);
      execute format(
        'create policy %I on public.%I for select to authenticated using (public.mi_rol() is not null)',
        t || '_leer', t
      );
      execute format('drop policy if exists %I on public.%I', t || '_insertar', t);
      execute format(
        'create policy %I on public.%I for insert to authenticated with check (public.mi_rol() in (''admin'',''recepcion'',''tecnico''))',
        t || '_insertar', t
      );
      execute format('drop policy if exists %I on public.%I', t || '_actualizar', t);
      execute format(
        'create policy %I on public.%I for update to authenticated using (public.mi_rol() in (''admin'',''recepcion'',''tecnico'')) with check (public.mi_rol() in (''admin'',''recepcion'',''tecnico''))',
        t || '_actualizar', t
      );
      execute format('drop policy if exists %I on public.%I', t || '_eliminar', t);
      execute format(
        'create policy %I on public.%I for delete to authenticated using (public.es_admin())',
        t || '_eliminar', t
      );
    end if;
  end loop;
end $$;

-- Buckets privados.
insert into storage.buckets (id, name, public)
values ('evidencias', 'evidencias', false), ('documentos', 'documentos', false)
on conflict (id) do update set public = false;

drop policy if exists techsoul_storage_lectura on storage.objects;
create policy techsoul_storage_lectura on storage.objects
for select to authenticated
using (bucket_id in ('evidencias','documentos') and public.mi_rol() is not null);

drop policy if exists techsoul_storage_insertar on storage.objects;
create policy techsoul_storage_insertar on storage.objects
for insert to authenticated
with check (bucket_id in ('evidencias','documentos') and public.mi_rol() in ('admin','recepcion','tecnico'));

drop policy if exists techsoul_storage_actualizar on storage.objects;
create policy techsoul_storage_actualizar on storage.objects
for update to authenticated
using (bucket_id in ('evidencias','documentos') and public.mi_rol() in ('admin','recepcion','tecnico'))
with check (bucket_id in ('evidencias','documentos') and public.mi_rol() in ('admin','recepcion','tecnico'));

drop policy if exists techsoul_storage_eliminar on storage.objects;
create policy techsoul_storage_eliminar on storage.objects
for delete to authenticated
using (bucket_id in ('evidencias','documentos') and public.es_admin());

commit;
