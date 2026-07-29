-- SPRINT AUTH + ROLES + FIRMA DIGITAL
-- Ejecutar en Supabase > SQL Editor > New Query

create table if not exists perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre varchar(150),
  rol varchar(50) default 'Tecnico',
  activo boolean default true,
  fecha_registro timestamp default now()
);

alter table perfiles enable row level security;

drop policy if exists "Permitir todo perfiles" on perfiles;
create policy "Permitir todo perfiles"
on perfiles
for all
using (true)
with check (true);

create table if not exists firmas_orden (
  id bigint generated always as identity primary key,
  orden_id bigint references ordenes(id) on delete cascade,
  firma_base64 text not null,
  nombre_firmante varchar(150),
  fecha_firma timestamp default now()
);

alter table firmas_orden enable row level security;

drop policy if exists "Permitir todo firmas" on firmas_orden;
create policy "Permitir todo firmas"
on firmas_orden
for all
using (true)
with check (true);
