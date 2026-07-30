# TechSoul OS · Sprints 1 y 2

Incluye:

- Catálogo maestro de servicios, precios y garantías.
- Vinculación opcional de cada servicio con una refacción.
- Inventario progresivo con entradas, salidas, ajustes, stock mínimo, bajo pedido y kardex.
- Menú y ruta nueva: `/catalogo-servicios`.
- Orden de servicio múltiple del Sprint 2.5 incluida.

## Instalación

1. Copia los archivos del paquete respetando las carpetas.
2. En Supabase SQL Editor ejecuta, en este orden:
   - `supabase/migrations/202607300006_orden_servicios.sql`
   - `supabase/migrations/202607300007_catalogo_inventario.sql`
3. Reinicia el proyecto:

```bash
npm install
npm run dev
```

## Prueba rápida

1. Abre **Inventario > Catálogo de servicios**.
2. Crea una refacción desde **Existencias**.
3. Edita o crea un servicio y vincula esa refacción.
4. Confirma que precio, garantía de 90 días y margen se guarden.
5. Crea una orden con dos servicios y revisa total, anticipo y saldo.

> El descuento automático de refacciones queda preparado mediante la vinculación del catálogo. Debe ejecutarse al cerrar/entregar la orden para evitar descontar piezas de cotizaciones o trabajos cancelados.
