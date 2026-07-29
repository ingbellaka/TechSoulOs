-- SPRINT PWA + CONFIGURACIÓN NEGOCIO + ÓRDENES DE COMPRA PDF
-- Ejecutar en Supabase > SQL Editor > New Query

-- 1) Configuración del negocio
create table if not exists configuracion_negocio (
  id bigint generated always as identity primary key,
  nombre_negocio varchar(150) default 'TechSoul',
  telefono varchar(50),
  whatsapp varchar(50),
  direccion text,
  correo varchar(150),
  sitio_web varchar(150),
  logo_url text,
  condiciones_generales text default 'La garantía no cubre golpes, humedad, mal uso, manipulación por terceros o fallas ajenas al trabajo realizado.',
  fecha_actualizacion timestamp default now()
);

alter table configuracion_negocio enable row level security;

drop policy if exists "Permitir todo configuracion negocio" on configuracion_negocio;
create policy "Permitir todo configuracion negocio"
on configuracion_negocio
for all
using (true)
with check (true);

insert into configuracion_negocio (nombre_negocio, whatsapp, condiciones_generales)
select 'TechSoul', '6677487373', 'La garantía no cubre golpes, humedad, mal uso, manipulación por terceros o fallas ajenas al trabajo realizado.'
where not exists (select 1 from configuracion_negocio);

-- 2) Órdenes de compra
create table if not exists ordenes_compra (
  id bigint generated always as identity primary key,
  folio varchar(50) unique not null,
  proveedor_id bigint references proveedores(id),
  estado varchar(50) default 'Pendiente',
  metodo_pago varchar(50),
  subtotal numeric(10,2) default 0,
  total numeric(10,2) default 0,
  notas text,
  fecha_orden timestamp default now()
);

alter table ordenes_compra enable row level security;

drop policy if exists "Permitir todo ordenes compra" on ordenes_compra;
create policy "Permitir todo ordenes compra"
on ordenes_compra
for all
using (true)
with check (true);

create table if not exists ordenes_compra_detalle (
  id bigint generated always as identity primary key,
  orden_compra_id bigint references ordenes_compra(id) on delete cascade,
  descripcion varchar(200) not null,
  cantidad int default 1,
  costo_unitario numeric(10,2) default 0,
  subtotal numeric(10,2) generated always as (cantidad * costo_unitario) stored
);

alter table ordenes_compra_detalle enable row level security;

drop policy if exists "Permitir todo ordenes compra detalle" on ordenes_compra_detalle;
create policy "Permitir todo ordenes compra detalle"
on ordenes_compra_detalle
for all
using (true)
with check (true);

-- 3) Bucket para logos
insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;

drop policy if exists "Logos lectura publica" on storage.objects;
create policy "Logos lectura publica"
on storage.objects
for select
using (bucket_id = 'logos');

drop policy if exists "Logos insertar" on storage.objects;
create policy "Logos insertar"
on storage.objects
for insert
with check (bucket_id = 'logos');

drop policy if exists "Logos actualizar" on storage.objects;
create policy "Logos actualizar"
on storage.objects
for update
using (bucket_id = 'logos')
with check (bucket_id = 'logos');

drop policy if exists "Logos eliminar" on storage.objects;
create policy "Logos eliminar"
on storage.objects
for delete
using (bucket_id = 'logos');
