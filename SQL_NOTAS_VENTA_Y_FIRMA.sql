-- TECHSOUL OS — NOTAS DE VENTA + FIRMA AUTOMÁTICA
-- Ejecutar una sola vez en Supabase > SQL Editor.

ALTER TABLE configuracion_negocio
  ADD COLUMN IF NOT EXISTS firma_url text,
  ADD COLUMN IF NOT EXISTS responsable_nombre varchar(150);

-- La firma reutiliza el bucket público `logos` que ya usa TechSoul OS.
-- No se necesita crear otro bucket si ya ejecutaste SQL_SPRINT_PWA_CONFIG_OC.sql.
