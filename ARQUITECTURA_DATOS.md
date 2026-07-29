# Arquitectura de datos — TechSoul OS

## Estado actual
El proyecto trabaja localmente, pero está preparado para conectarse a Supabase sin rehacer las vistas.

La selección se controla con:

```env
VITE_DATA_SOURCE=local
```

En producción se cambia a:

```env
VITE_DATA_SOURCE=supabase
VITE_SUPABASE_URL=...
VITE_SUPABASE_KEY=...
```

## Flujo recomendado

```text
Vista → Store/Service → Repository client → Local o Supabase
```

Las vistas existentes siguen usando la importación histórica `src/lib/supabase.js`. Ese archivo ahora es solo una capa de compatibilidad y selecciona automáticamente el proveedor configurado.

Los módulos nuevos deben usar archivos dentro de `src/services/`.

## Carpetas nuevas

- `src/config/`: configuración central.
- `src/repositories/local/`: adaptador local para desarrollo.
- `src/repositories/supabase/`: cliente real para producción.
- `src/services/`: lógica de acceso a datos por módulo.
- `src/composables/`: lógica reutilizable de Vue.
- `src/types/`: modelos y contratos futuros.

## Importante
No borres el adaptador local cuando conectes Supabase. Sirve para demostraciones, pruebas y desarrollo sin internet.
