# Agenda + Corte de Caja — TechSoul OS

## Instalación

1. Abre **Supabase > SQL Editor > New Query**.
2. Ejecuta completo el archivo `SQL_AGENDA_CORTE_CAJA.sql`.
3. Publica/ejecuta esta versión del frontend normalmente.

## Qué se agregó

- **Agenda** en Operación: citas manuales y órdenes programadas en una misma vista diaria.
- **Nueva Orden**: fecha/hora programada y duración estimada.
- **Editar Orden**: permite reprogramar la reparación y cambiar la duración.
- **Corte de Caja** en Finanzas: movimientos del día, efectivo, transferencia y tarjeta.
- Entradas y salidas se descuentan por método de pago.
- Tarjeta muestra cobro bruto y un neto estimado usando un porcentaje de comisión editable (4.06% por defecto).
- Validación manual de efectivo contado: **Empata / Faltante / Sobrante**.
- Historial de cortes guardado en `cortes_caja` (un corte por fecha, actualizable).

## Importante

El Corte de Caja **no duplica movimientos**. Lee directamente `movimientos_caja`. Por eso, para que una salida a proveedor se descuente correctamente, registra la salida en Caja con su método real: Efectivo, Transferencia o Tarjeta.
