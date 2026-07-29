# Decisiones de arquitectura — TechSoul OS

## ADR-001: No reescribir
Se conserva Vue 3 + Vite + Pinia y la arquitectura local/Supabase existente.

## ADR-002: Orden como agregado central
Los pagos, piezas, garantía, checklist e historial se relacionan con una orden.

## ADR-003: Repositorios intercambiables
Las vistas consumen servicios. Los servicios consumen `dataClient`. El origen local o Supabase se elige en configuración.

## ADR-004: Operaciones idempotentes
Descontar stock, recibir compra, registrar anticipo o emitir garantía debe poder reintentarse sin duplicar resultados.

## ADR-005: Históricos inmutables
Las órdenes conservan el precio, garantía y descripción aplicados en su fecha; no dependen del valor vigente del Tarifario.

## ADR-006: Eliminación lógica
Órdenes entregadas, movimientos de caja, compras recibidas y movimientos de inventario no se borran físicamente.

## ADR-007: Funciones opcionales
Fotos, firma, IMEI, correo, fecha compromiso y notas son opcionales según el flujo del taller.

## ADR-008: IA explicable
Las recomendaciones deben indicar los datos usados y no modificar precios o inventario sin aprobación humana.
