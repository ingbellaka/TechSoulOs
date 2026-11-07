# Flujo operativo Implementation Plan

**Goal:** Seguimiento, cotización y entrega sin recapturas, con tickets de 58 mm.
**Architecture:** Reutilizar Taller y detalle, añadir un componente compartido de cobro y una operación transaccional en Supabase. Mantener el adaptador local para pruebas. Cotizaciones compartidas mediante tablas con RLS.
**Tech Stack:** Vue 3, Vite, Supabase, Node test runner.
**Spec:** Propuesta aprobada por la usuaria en este chat el 2026-11-06.

## Global Constraints
- Conservar recepción y evidencia. Pago y entrega se guardan antes de imprimir.
- No publicar a producción ni modificar registros de clientes durante la verificación.
- Reutilizar checkout desde detalle, Taller y Órdenes; rol admin/recepcion para cobrar.

## Review Focus
- Doble clic/reintento de cobro: operación idempotente, bloqueo de orden.
- Pago parcial: registrar sin entregar; entrega requiere estado Listo y saldo cero.
- Error de impresión: permitir reimpresión sin escritura financiera.
- Datos cambiados en otra sesión: rechazar y pedir recarga.
- Cotización menor a pagos recibidos o aplicada a orden cerrada: rechazar.

## Tasks
- [x] 1. Probar validaciones monetarias y checkout local; implementar RPC transaccional y componente compartido.
- [x] 2. Integrar cobro en detalle, Taller y listado; reemplazar selector libre por seguimiento guiado.
- [x] 3. Conectar calculador a órdenes nuevas/existentes, persistir historial y configuración compartida.
- [x] 4. Dashboard operativo con acciones y saldos; mejorar tickets según recepción/entrega y garantía real.
- [x] 5. Ejecutar pruebas Node, compilación, validación SQL transaccional con rollback y revisar diff.

## Execution ledger
- Ejecución directa autorizada: “haz los cambios necesarios”. Se reutiliza checkout existente en rama codex/flujo-cobro-entrega.
- Proyecto Supabase confirmado por URL de configuración: uncuqrenwgylnyenmvhc. Solo migraciones aditivas; pruebas con rollback.
- La revisión independiente pidió conservar el identificador de cobro al recargar, refrescar la ficha al cambiar de orden, preservar recibos divididos y limitar escrituras directas. Se probó la protección en una transacción revertida; se activa al publicar la interfaz nueva.
