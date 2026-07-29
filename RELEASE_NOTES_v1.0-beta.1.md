# TechSoul OS v1.0-beta.1

## Entrega consolidada

Esta versión conserva el proyecto completo y la integración existente de órdenes, inventario, compras, caja y garantías.

### Correcciones incluidas

- Adaptador local compatible con `like`, `ilike`, `limit`, `range`, `gt`, `gte`, `lt`, `lte`, `is` y `contains`.
- Datos iniciales de usuarios para modo local.
- Versión del proyecto actualizada a `1.0.0-beta.1`.
- Validación sintáctica de `src/repositories/local/client.js` completada correctamente.

## Validación pendiente en equipo local

El build no pudo ejecutarse en el entorno de generación porque el registro npm interno no ofrece el paquete transitivo `yallist@3.1.1`. Esto no representa un error confirmado del proyecto. En el equipo de desarrollo ejecutar:

```bash
npm install
npm run build
npm run dev
```

## Estado real

Esta entrega es una base beta consolidada. No se declara finalizado Supabase de producción, RLS, multi-sucursal, IA externa ni auditoría completa hasta probarlos con credenciales y entorno reales.

## Actualización: Ventas inteligentes (v1.1.0-beta.1)

- Venta con múltiples renglones.
- Productos de inventario, productos por encargo, servicios y conceptos libres.
- Anticipos y saldo pendiente.
- Estados individuales de entrega y entrega parcial.
- Solicitudes de compra automáticas para encargos.
- Salidas de inventario y movimientos de caja vinculados.
