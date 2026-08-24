-- Condiciones de entrega: notificación al cliente, garantía de 3 meses desde
-- que el equipo queda listo, y cuota de almacenamiento por equipos no recogidos.
begin;

-- Fecha en la que la orden pasó a "Listo" (= momento en que se notifica al
-- cliente). A partir de esta fecha cuentan tanto la garantía como los 30 días
-- de gracia antes del cobro de almacenamiento.
alter table public.ordenes add column if not exists fecha_listo timestamptz;

-- Configuración del negocio: cuota diaria de almacenamiento y días de gracia
-- antes de empezar a cobrarla.
alter table public.configuracion_negocio add column if not exists cuota_almacenamiento_dia numeric(10,2) not null default 0;
alter table public.configuracion_negocio add column if not exists dias_gracia_almacenamiento integer not null default 30;

-- Valor por defecto acordado con el negocio: $50 MXN por día después de 30
-- días de gracia. Solo se aplica si el negocio aún no había configurado un
-- monto distinto (evita sobreescribir un valor ya personalizado).
update public.configuracion_negocio
set cuota_almacenamiento_dia = 50
where cuota_almacenamiento_dia = 0;

-- Estandariza la garantía de "Reparación" a 3 meses (90 días), como condición
-- general del taller.
update public.configuracion_garantias
set dias_garantia = 90,
    condiciones = 'Garantía de 3 meses sobre el trabajo realizado, vigente a partir de la fecha en que se notifica al cliente que el equipo está listo. No cubre golpes, humedad, mal uso ni manipulación por terceros.'
where tipo_servicio = 'Reparación';

commit;
