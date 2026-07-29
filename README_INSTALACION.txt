TECHSOUL MANAGER - SPRINT PWA + CONFIG NEGOCIO + ORDEN DE COMPRA PDF

Este sprint agrega:

1. PWA móvil
   - Permite instalar TechSoul Manager en el celular como app.
   - Funciona desde navegador y se puede agregar a pantalla de inicio.
   - Requiere instalar paquete:
     npm install vite-plugin-pwa -D

2. Configuración del negocio
   - Nombre del negocio
   - Teléfono
   - WhatsApp
   - Dirección
   - Correo
   - Sitio web/redes
   - Logo
   - Condiciones generales

3. Orden de compra PDF
   - Crear orden de compra con productos libres
   - Folio OC-2026-00001
   - Detalle imprimible / Guardar como PDF
   - Usa logo y datos del negocio

INSTALACIÓN:

1. En terminal, dentro del proyecto:
   cd C:\Users\yuliana.arredondo\Documents\TS-M\techsoul-manager
   npm install vite-plugin-pwa -D

2. En Supabase:
   SQL Editor > New Query

3. Ejecuta:
   SQL_SPRINT_PWA_CONFIG_OC.sql

4. Copia:
   - carpeta src
   - carpeta public
   - vite.config.js

5. Pega en tu proyecto:
   C:\Users\yuliana.arredondo\Documents\TS-M\techsoul-manager

6. NO reemplaces tu .env.

7. Ejecuta:
   npm run dev

USO EN CELULAR:

OPCIÓN TEMPORAL LOCAL:
- Ejecuta:
  npm run dev -- --host 0.0.0.0
- Tu PC y tu celular deben estar en la misma red WiFi.
- En el celular abre la URL Network que muestra Vite.

OPCIÓN RECOMENDADA:
- Subir a Vercel.
- Abrir el link en el celular.
- En iPhone: Compartir > Agregar a pantalla de inicio.
- En Android: menú de Chrome > Instalar app / Agregar a pantalla principal.

NOTA:
Para que PWA instale bien como app real, lo ideal es usar HTTPS. Vercel lo da gratis.
