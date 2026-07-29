# Roadmap de cierre — TechSoul OS v1.0

## Sprint 1 — Operación integrada

- Unificar estados de órdenes.
- Extraer reglas de órdenes a servicios.
- Integrar Tarifario en Nueva Orden.
- Registrar pagos desde movimientos de caja, evitando duplicados.
- Relacionar piezas/refacciones con la orden.
- Completar historial de cliente y equipo.

**Salida:** flujo Cliente → Equipo → Orden estable.

## Sprint 2 — Inventario y compras

- Tabla de movimientos de inventario.
- Reserva y consumo por orden.
- Costo promedio.
- Compra recibida actualiza inventario automáticamente.
- Alertas de stock mínimo.
- Producto bajo pedido.

**Salida:** trazabilidad completa de cada refacción.

## Sprint 3 — Caja y garantías

- Apertura y corte de caja.
- Conciliación por método de pago.
- Reembolsos y cancelaciones.
- Garantías con reclamaciones, resolución y costo.
- Integración entrega → garantía.

**Salida:** operación financiera diaria controlada.

## Sprint 4 — Administración

- Dashboard con consultas reales.
- Reportes por periodo, servicio, modelo, técnico y utilidad.
- Exportación CSV/Excel y PDF.
- Usuarios, roles y permisos.
- Configuración de folios, estados, pagos y riesgos.

**Salida:** administración y supervisión completa.

## Sprint 5 — Supabase, IA y optimización

- Esquema SQL final y migración.
- RLS, autenticación y permisos.
- Respaldo y restauración.
- IA basada en métricas verificables: márgenes, rotación, stock y precios.
- Rendimiento, lazy loading, manejo centralizado de errores y pruebas finales.

**Salida:** v1.0 lista para piloto controlado.

## Orden técnico de implementación inmediata

1. Crear servicios de Caja, Inventario, Compras y Garantías.
2. Eliminar accesos directos a `localStorage` desde vistas.
3. Crear `ordenWorkflowService` para transiciones y efectos secundarios.
4. Implementar identificadores de idempotencia.
5. Sustituir datos estáticos de Garantías, Usuarios y Reportes.
6. Documentar pruebas manuales del flujo crítico.
