# Auditoría real — TechSoul OS v0.9

Fecha: 28 de julio de 2026
Proyecto auditado: `TechSoul-OS-Sprint-UIUX-1.0-COMPLETO(1).zip`

## Dictamen ejecutivo

TechSoul OS ya no es un prototipo vacío. El proyecto contiene 22 vistas, enrutamiento completo, autenticación local compatible con Supabase, repositorios, servicios de dominio, almacenamiento local, componentes UI reutilizables y flujos reales para órdenes, clientes, equipos, inventario, compras, caja y configuración.

La prioridad correcta no es rehacer módulos. La prioridad es cerrar integraciones, sustituir datos estáticos, consolidar una única capa de datos y probar el flujo completo del taller.

## Estado por módulo

| Módulo | Estado | Evidencia observada | Trabajo pendiente |
|---|---:|---|---|
| Clientes | 85% | Alta, búsqueda, WhatsApp, correo y persistencia | Edición, ficha individual, historial de equipos/órdenes, validación de duplicados |
| Equipos | 85% | Alta, relación con clientes y consulta | Ficha individual, historial de reparaciones y acceso cruzado desde cliente |
| Nueva orden / Recepción | 90% | Flujo por pasos, cliente, equipo, checklist, foto opcional, garantía, anticipo y caja | Selección directa desde Tarifario, refacciones utilizadas, validaciones transaccionales |
| Órdenes | 90% | Listado, filtros, estados, historial, liquidación, gasto, cancelar/eliminar | Unificar estados, impedir cobros duplicados, consumo de inventario, pruebas de regresión |
| Detalle de orden | 90% | Resumen, evidencia, checklist, garantía, caja, firma e historial | Mejorar manejo de errores, impresión/PDF estable, piezas consumidas y auditoría de usuario |
| Tarifario | 80% | CRUD local, categorías, márgenes y alertas | Migrar a repositorio, importación masiva, historial de precios y uso directo en órdenes |
| Cotizador | 80% | Cálculo de costos, riesgo, margen, guardar cotización, enviar a Tarifario/Inventario | Persistencia unificada, relación con cliente/orden, reglas de riesgo editables desde configuración |
| Inventario | 85% | Alta/edición, stock, bajo pedido, ajustes, movimientos y borrador desde Cotizador | Costo promedio, movimientos persistidos en tabla única, reserva por orden y descuento idempotente |
| Compras | 75% | Proveedores, órdenes de compra, detalle, estados y salida de caja | Al recibir: crear/actualizar productos, costo promedio, entrada de stock y evitar doble registro |
| Caja | 80% | Entradas, salidas, filtros, totales y movimientos vinculados | Apertura/cierre, cortes, conciliación, arqueo y protección contra duplicados automáticos |
| Garantías | 35% | Tabla visual y configuración de garantías; creación desde orden | Sustituir datos estáticos, reclamaciones reales, resolución, costos, estados y detalle |
| Dashboard | 75% | KPIs reales de clientes, órdenes y caja; recientes | Stock crítico, garantías reales, utilidad, periodos, gráficos y accesos basados en datos reales |
| Reportes | 20% | Maqueta visual | Consultas reales, filtros, exportación CSV/Excel/PDF y definición financiera consistente |
| Configuración | 80% | Negocio, logo y reglas de garantía | Folios, impuestos, métodos de pago, estados, riesgos y preferencias de impresión |
| Usuarios | 15% | Maqueta con dos usuarios estáticos | CRUD, roles, permisos, perfil y políticas de acceso |
| IA | 15% | Vista conceptual con agentes | Métricas reales, reglas explicables y conexión opcional a un proveedor de IA |
| Conversaciones | 15% | Datos estáticos | Plantillas reales y enlace/copiar WhatsApp; integración externa solo más adelante |
| Automatizaciones | 15% | Datos estáticos | Reglas reales, disparadores y bitácora; dejar fuera de v1 inicial si no es esencial |
| Ventas | 80% | Venta de productos, descuento de stock y entrada en caja | Devoluciones, cancelaciones, ticket y costo/utilidad real |

## Hallazgos técnicos prioritarios

### 1. Hay dos estrategias de persistencia

Varias vistas usan la interfaz tipo Supabase (`supabase.from(...)`), mientras Tarifario, Cotizador y parte de Inventario usan helpers y claves directas de `localStorage`. Esto funciona, pero dificulta migrar, probar y mantener.

**Decisión:** toda vista nueva o modificada debe consumir servicios/repositorios. `localStorage` solo debe existir dentro del adaptador local.

### 2. El adaptador local es una base valiosa

`src/repositories/local/client.js` simula una parte del API de Supabase y contiene tablas semilla relacionadas. Esto permite seguir trabajando offline y migrar después.

**Decisión:** mantenerlo, pero ampliar sus operaciones de consulta y transacciones de dominio en servicios.

### 3. Los servicios todavía cubren muy poco

Existen servicios base para clientes, equipos y órdenes, pero muchas vistas consultan directamente a `supabase`.

**Decisión:** crear servicios de Inventario, Compras, Caja, Garantías, Tarifario y Reportes. Las reglas que afectan varias tablas deben vivir en servicios de caso de uso, no en vistas.

### 4. Existen módulos que son maquetas

Usuarios, Reportes, Garantías, IA, Conversaciones y Automatizaciones tienen contenido parcial o estático.

**Decisión:** no presentarlos como terminados. Ocultar del menú las funciones no utilizables o marcarlas como Beta hasta completarlas.

### 5. Riesgo de operaciones duplicadas

Anticipos, liquidaciones, compras y cambios de stock se registran desde diferentes pantallas. Sin identificadores de idempotencia, una doble pulsación o reintento puede duplicar caja o inventario.

**Decisión:** cada operación automática deberá tener `origen`, `referencia_tipo`, `referencia_id` y una clave única de evento.

### 6. El build no pudo verificarse en este entorno

`npm ci` fue bloqueado porque el registro interno no encontró `yallist@3.1.1`. No se encontró un error de código durante la auditoría, pero la compilación debe ejecutarse en el equipo local con el registro público de npm.

## Flujo crítico que debe aprobarse antes de v1.0

1. Crear o seleccionar cliente.
2. Crear o seleccionar equipo.
3. Crear orden con servicio del Tarifario o precio manual.
4. Registrar anticipo una sola vez en Caja.
5. Agregar refacción y reservar existencias.
6. Cambiar estados con historial automático.
7. Terminar la reparación y descontar stock una sola vez.
8. Liquidar saldo y registrar el pago una sola vez.
9. Entregar y generar garantía conforme a la regla configurada.
10. Reflejar ventas, utilidad, caja, inventario y garantía en Dashboard/Reportes.

## Criterio de terminado

Un módulo se considera terminado solo cuando:

- Persiste datos mediante servicio/repositorio.
- Maneja carga, vacío, error y éxito.
- Tiene validación de datos.
- No duplica operaciones.
- Se integra con los módulos dependientes.
- Funciona en escritorio y tablet.
- Tiene al menos una prueba manual documentada de flujo feliz y una de error.
