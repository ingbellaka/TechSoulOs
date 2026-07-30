# Siguiente paso después del despliegue

1. Ejecutar la migración `supabase/migrations/202607290001_production_foundation.sql`.
2. Crear el administrador en Authentication > Users.
3. Confirmar que `public.perfiles` tenga el rol `admin` y `activo = true`.
4. Configurar Site URL y Redirect URLs en Supabase Auth.
5. Agregar en Vercel las variables públicas de Supabase.
6. Hacer commit y push de esta versión; Vercel desplegará automáticamente.
7. Probar login, cierre de sesión, recuperación de contraseña y permisos.
8. Después de validar Auth, comenzar la migración de cada módulo a tablas reales y finalmente desplegar la Edge Function del agente IA.
