# TechSoul OS v2.1 RC1 · Auth y despliegue

## Incluye
- Inicialización única y persistente de sesión Supabase.
- Escucha de cambios de autenticación.
- Login sin registro público.
- Recuperación y restablecimiento de contraseña.
- Protección de rutas por roles: admin, recepción, técnico y consulta.
- Bloqueo de perfiles desactivados.
- Página de acceso denegado.
- Corrección de roles en minúsculas para coincidir con `app_role` de PostgreSQL.
- `vercel.json` para navegación SPA en rutas directas.

## Requerido en Supabase
En Authentication > URL Configuration agrega:
- Site URL: la URL principal de Vercel.
- Redirect URL: `https://TU-DOMINIO.vercel.app/restablecer-contrasena`
- Redirect local: `http://localhost:5173/restablecer-contrasena`
