# TechSoul OS v2.0 RC1 · Conexión a Supabase

El proyecto ya incluye la URL y la clave pública proporcionadas, y está configurado con `VITE_DATA_SOURCE=supabase`.

## 1. Crear la cuenta administradora

En Supabase abre **Authentication → Users → Add user** y crea:

- Correo: `ingyulianaarredondo@gmail.com`
- Contraseña: defínela tú; no la guardes en el código.
- Marca el correo como confirmado si Supabase ofrece esa opción.

## 2. Ejecutar la base existente

Si el proyecto está vacío, ejecuta primero los scripts SQL base que acompañan al proyecto y crean las tablas operativas. Respeta las dependencias: tablas principales antes que scripts `alter table`.

## 3. Ejecutar seguridad de producción

Abre **SQL Editor → New query**, pega y ejecuta:

`supabase/migrations/202607290001_production_foundation.sql`

Este script:

- crea perfiles y roles;
- convierte el correo administrador en rol `admin`;
- activa RLS en tablas existentes;
- evita eliminaciones salvo para administradores;
- crea buckets privados para evidencias y documentos.

## 4. Iniciar TechSoul OS

```bash
npm install
npm run dev
```

Entra con el correo administrador y la contraseña creada en Supabase.

## Seguridad

La clave `sb_publishable_...` es pública y puede usarse en el frontend con RLS. Nunca agregues al proyecto `service_role`, `sb_secret_...`, contraseña de PostgreSQL u `OPENAI_API_KEY`.

## Siguiente etapa

Después de validar inicio de sesión y lectura/escritura, se integrará el agente de IA mediante una Edge Function. La llave de OpenAI se guardará como secreto de Supabase y nunca llegará al navegador.
