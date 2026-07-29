# Ventas inteligentes

Esta versión permite registrar en una misma venta:

- Productos de inventario: descuentan existencias.
- Productos por encargo: generan una solicitud de compra y quedan pendientes de entrega.
- Servicios: no afectan inventario.
- Conceptos libres: permiten cobrar cualquier concepto no catalogado.

También incorpora cliente, teléfono, anticipo, saldo, estado de pago, entrega parcial y estado individual por artículo.

## Modo local

Funciona directamente con el adaptador local. La tabla `solicitudes_compra` se crea automáticamente en localStorage.

## Supabase

Ejecuta `SQL_VENTAS_INTELIGENTES.sql` en el SQL Editor antes de usar esta versión con Supabase.
