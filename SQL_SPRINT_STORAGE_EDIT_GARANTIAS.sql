-- SPRINT STORAGE + CONFIGURACIÓN DE GARANTÍAS
-- Ejecutar en Supabase > SQL Editor > New Query

-- 1) Tabla para configurar garantías por tipo de servicio
create table if not exists configuracion_garantias (
  id bigint generated always as identity primary key,
  tipo_servicio varchar(120) not null,
  dias_garantia int default 0,
  condiciones text,
  activo boolean default true,
  fecha_registro timestamp default now()
);

alter table configuracion_garantias enable row level security;

drop policy if exists "Permitir todo configuracion garantias" on configuracion_garantias;
create policy "Permitir todo configuracion garantias"
on configuracion_garantias
for all
using (true)
with check (true);

insert into configuracion_garantias (tipo_servicio, dias_garantia, condiciones)
select 'Pantalla', 90, 'No cubre golpes, humedad, presión, manchas, líneas por golpe o manipulación por terceros.'
where not exists (select 1 from configuracion_garantias where tipo_servicio = 'Pantalla');

insert into configuracion_garantias (tipo_servicio, dias_garantia, condiciones)
select 'Batería', 90, 'No cubre humedad, golpes, inflado por cargadores dañados o manipulación por terceros.'
where not exists (select 1 from configuracion_garantias where tipo_servicio = 'Batería');

insert into configuracion_garantias (tipo_servicio, dias_garantia, condiciones)
select 'Centro de carga', 30, 'No cubre humedad, daño por cargadores, pines rotos o manipulación por terceros.'
where not exists (select 1 from configuracion_garantias where tipo_servicio = 'Centro de carga');

insert into configuracion_garantias (tipo_servicio, dias_garantia, condiciones)
select 'Tapa', 30, 'No cubre golpes, caídas, presión, humedad o manipulación por terceros.'
where not exists (select 1 from configuracion_garantias where tipo_servicio = 'Tapa');

insert into configuracion_garantias (tipo_servicio, dias_garantia, condiciones)
select 'Diagnóstico', 0, 'Sin garantía por diagnóstico.'
where not exists (select 1 from configuracion_garantias where tipo_servicio = 'Diagnóstico');

insert into configuracion_garantias (tipo_servicio, dias_garantia, condiciones)
select 'Sin garantía', 0, 'Trabajo realizado sin garantía por condición especial aceptada por el cliente.'
where not exists (select 1 from configuracion_garantias where tipo_servicio = 'Sin garantía');


-- 2) Bucket para evidencias
-- Si ya existe, no pasa nada.
insert into storage.buckets (id, name, public)
values ('evidencias', 'evidencias', true)
on conflict (id) do nothing;

-- 3) Políticas abiertas de desarrollo para Storage
-- Más adelante se cierran por usuario/rol.

drop policy if exists "Evidencias lectura publica" on storage.objects;
create policy "Evidencias lectura publica"
on storage.objects
for select
using (bucket_id = 'evidencias');

drop policy if exists "Evidencias insertar" on storage.objects;
create policy "Evidencias insertar"
on storage.objects
for insert
with check (bucket_id = 'evidencias');

drop policy if exists "Evidencias actualizar" on storage.objects;
create policy "Evidencias actualizar"
on storage.objects
for update
using (bucket_id = 'evidencias')
with check (bucket_id = 'evidencias');

drop policy if exists "Evidencias eliminar" on storage.objects;
create policy "Evidencias eliminar"
on storage.objects
for delete
using (bucket_id = 'evidencias');
