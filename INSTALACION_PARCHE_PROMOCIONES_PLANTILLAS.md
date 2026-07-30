# TechSoul OS — Parche Promociones y Plantillas

Este parche agrega accesos independientes y CRUD completos para:

- Promociones (`/promociones`)
- Plantillas de respuesta (`/plantillas`)

## Instalación

1. Copia la carpeta `src` sobre la carpeta `src` de tu proyecto.
2. Acepta reemplazar `src/router/index.js` y `src/components/navigation/AppSidebar.vue`.
3. No requiere una migración SQL nueva si ya ejecutaste:

   `202607300010_entregas_4_5_admin_ia.sql`

4. Reinicia el proyecto:

   `npm run dev`

## Ubicación en el menú

Inteligencia → Promociones

Inteligencia → Plantillas de respuesta

## Prueba rápida

Promoción:
- Nombre: Cristal templado de regalo
- Descripción: Incluido en cambios de pantalla participantes.
- Activa: Sí

Plantilla:
- Nombre: Equipo mojado
- Categoría: Diagnóstico
- Palabras clave: mojado, humedad, no enciende
