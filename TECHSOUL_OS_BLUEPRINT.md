# TechSoul OS Blueprint

## 1. Propósito

TechSoul OS es un sistema operativo para talleres de reparación. Su núcleo es la orden de trabajo y todas las demás áreas deben aportar o consumir información de esa orden sin duplicar capturas.

## 2. Principios inmutables

1. Evolucionar el proyecto actual; no reescribirlo.
2. La Orden de Trabajo es la entidad central.
3. Las fotos son opcionales.
4. Tarifario es la fuente principal de precios públicos.
5. Cotizador se usa para trabajos no registrados o especiales.
6. Inventario puede ser físico o bajo pedido.
7. Toda operación financiera debe quedar en Caja.
8. Toda modificación importante debe quedar en historial.
9. La interfaz no accede directamente a `localStorage`.
10. La app debe funcionar localmente y conservar compatibilidad con Supabase.

## 3. Arquitectura congelada

```text
src/
├── components/
│   ├── navigation/
│   └── ui/
├── composables/
├── config/
├── layouts/
├── lib/
├── repositories/
│   ├── local/
│   └── supabase/
├── services/
├── stores/
├── types/
├── views/
└── router/
```

### Responsabilidades

- **Views:** presentación, interacción y estado temporal del formulario.
- **Components:** UI reutilizable sin reglas de negocio complejas.
- **Services:** casos de uso y reglas que coordinan una o varias entidades.
- **Repositories:** lectura/escritura contra local o Supabase.
- **Stores:** sesión, permisos y estado global realmente compartido.
- **lib:** utilidades puras; no reglas centrales del negocio.

## 4. Modelo de dominio

```text
Cliente 1 ── N Equipo
Cliente 1 ── N Orden
Equipo  1 ── N Orden
Orden   1 ── N ServicioOrden
Orden   1 ── N RefaccionOrden
Orden   1 ── N Pago/MovimientoCaja
Orden   1 ── N EventoHistorial
Orden   1 ── 1 ChecklistRecepcion
Orden   1 ── 0..N Evidencia (opcional)
Orden   1 ── 0..1 Garantía emitida
Compra  1 ── N DetalleCompra
Producto 1 ── N MovimientoInventario
Proveedor 1 ── N Compra
Usuario 1 ── N EventoHistorial
```

## 5. Estados oficiales de orden

- Recibido
- Diagnóstico
- Esperando aprobación
- Esperando refacción
- En reparación
- En pruebas
- Listo
- Entregado
- Cancelado
- Garantía

Los nombres deben almacenarse con un código estable y mostrarse con una etiqueta traducible. No crear variantes como “Reparando”, “En proceso” y “En reparación” para el mismo significado.

## 6. Reglas de integración

### Orden → Tarifario

La orden guarda una copia del nombre, calidad, precio y garantía aplicados. El cambio futuro del Tarifario no altera órdenes históricas.

### Orden → Inventario

- Al asignar una pieza: reservar, si se habilita la reserva.
- Al finalizar: descontar una sola vez.
- Al cancelar antes de usarla: liberar reserva.
- Al reabrir: no volver a descontar automáticamente.

### Orden → Caja

- Anticipo: entrada vinculada a la orden.
- Liquidación: entrada vinculada a la orden.
- Reembolso: salida vinculada a la orden.
- No calcular lo pagado únicamente con el campo `anticipo`; sumar movimientos válidos.

### Compra → Inventario

Al marcar la compra como recibida:

- Crear producto si no existe.
- Incrementar stock.
- Recalcular costo promedio.
- Crear movimiento de inventario.
- Marcar la recepción como procesada para impedir duplicados.

### Entrega → Garantía

Al entregar:

- Usar la regla de garantía copiada en el servicio de la orden.
- Crear garantía solo si la duración es mayor que cero.
- Guardar fecha de inicio, vencimiento, condiciones y estado.

## 7. Seguridad y datos sensibles

- Contraseñas/códigos de desbloqueo no deben guardarse en texto plano en producción.
- En Supabase, aplicar RLS por negocio y sucursal.
- Cada tabla comercial debe incluir `business_id` y, cuando aplique, `branch_id`.
- Eliminaciones financieras e inventario deben ser cancelaciones lógicas, no borrado físico.
- Registrar `created_by`, `updated_by`, `created_at` y `updated_at`.

## 8. Design System

Se mantienen los componentes UI existentes y se amplían solo cuando haya reutilización real:

- PageHeader
- SectionCard
- StatCard
- EmptyState
- StatusBadge
- AppTable
- AppModal
- FormField
- ConfirmDialog
- Toast

Todos los módulos deben usar los tokens globales de color, tipografía, espacio, radio y sombra.

## 9. Definición de v1.0

TechSoul OS v1.0 estará listo para uso diario cuando pueda completar, sin captura duplicada:

**Recepción → Orden → Refacciones → Reparación → Pago → Entrega → Garantía → Reporte**

Supabase, usuarios reales y respaldo son requisitos antes de venderlo a terceros, pero el modo local puede utilizarse internamente mientras se respalde la información.

## 10. Fuera de alcance inicial

- Integración oficial con WhatsApp API.
- Automatizaciones complejas.
- IA generativa autónoma.
- Contabilidad fiscal completa.
- Multisucursal avanzada.

Estas capacidades podrán añadirse después de estabilizar el flujo principal.
