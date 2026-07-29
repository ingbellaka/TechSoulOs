# TechSoul OS v1.6.0-beta.1 — Flujo operativo conectado

## Incluido

- Presupuestos migrados al repositorio de datos, listos para usar en modo local o Supabase.
- Conversión directa de presupuesto a orden de reparación.
- Conversión directa de presupuesto a venta pendiente de cobro.
- Creación/reutilización automática del cliente y creación del equipo al convertir a orden.
- Relaciones `presupuesto_id`, `orden_id` y `venta_id` para trazabilidad.
- Historial automático al crear una orden desde presupuesto.
- Registro de abonos en ventas con actualización de saldo y estado de pago.
- Registro automático del ingreso del abono en caja.
- Tabla local `presupuestos` incluida en el adaptador local.
- Prevención de conversiones duplicadas.

## Flujo disponible

Presupuesto → Orden o Venta → Caja → Historial

Los módulos de inventario, compras, encargos y garantías conservan sus integraciones existentes.

## Validación

- Sintaxis JavaScript del nuevo servicio validada con Node.
- La compilación completa no pudo ejecutarse en el entorno de entrega porque el registro npm interno no contiene `yallist@3.1.1`.
