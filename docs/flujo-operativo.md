# Seguimiento, cobro y cotización

- El inicio muestra **Cotizar precio**, filtros por etapa y las órdenes listas con su saldo.
- En una orden, **Seguimiento** reúne el avance de Taller, control de calidad y evidencia final. El encabezado muestra total, pagado y saldo.
- Recepción o administración puede registrar abonos o **Cobrar y entregar**. La entrega requiere estado Listo y saldo cubierto; se aceptan varios métodos. Una respuesta perdida se recupera con la misma operación en esa pestaña, incluso tras recargar.
- **Ticket · 58 mm** abre la vista de recepción o entrega. Los recibos de pago se reimprimen en Finanzas. Imprimir no vuelve a guardar el cobro.
- **Cotizar servicio** agrega una línea al total de una orden antes de autorizarla. **Usar en nueva orden** rellena modelo, servicio y precio; cliente, falla y evidencias siguen siendo necesarios. El historial y los ajustes son compartidos. El historial anterior se puede importar desde el navegador que lo contiene.

## Verificación y publicación

`npm ci`, `npm test` y `npm run build`. Para recorrer el flujo con datos de muestra, iniciar Vite con `VITE_DATA_SOURCE=local` y usar la orden de demostración.

Las migraciones aditivas de cotizaciones y cobro ya están registradas en TechSoul-DB con los números de versión guardados en `supabase/migrations`. `tests/checkout-rollback.sql` ejercita la operación como usuario autenticado y revierte sus datos de prueba.

La migración `20261107210000_proteger_cobro_orden.sql` se activa **al publicar la interfaz nueva**. Bloquea cambios directos de cobro/entrega que aún utiliza la versión anterior. Publicar la interfaz primero, comprobar el flujo y aplicar esa migración a TechSoul-DB inmediatamente después. Pedir a los operadores recargar la app para que utilicen la versión nueva.
