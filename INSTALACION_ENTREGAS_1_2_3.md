# TechSoul OS · Sprint final · Entregas 1, 2 y 3

Este paquete integra la base administrativa y de conocimiento, los repositorios de acceso a datos y el módulo de reportes ejecutivos.

## 1. Copiar archivos

Copia las carpetas `src` y `supabase` sobre la raíz de tu proyecto TechSoul OS, permitiendo reemplazar archivos existentes.

## 2. Ejecutar migraciones en Supabase

Ejecuta primero las migraciones anteriores que aún tengas pendientes y después, en este orden:

1. `202607300008_compras_caja_dashboard.sql`
2. `202607300009_sprint_final_entrega_1_3.sql`

La segunda migración crea:

- `configuracion_negocio`
- `faq`
- `promociones`
- `plantillas_respuesta`
- `auditoria`
- campos enriquecidos en `catalogo_servicios`
- vistas de apoyo para reportes
- índices, RLS y datos iniciales

## 3. Probar

```bash
npm install
npm run dev
```

Revisa:

- Dashboard
- Reportes
- Caja
- Compras
- Inventario

En Reportes prueba los botones **Exportar órdenes** y **Exportar resumen CSV**.

## Notas de cálculo

- Ventas: entradas registradas en caja.
- Gastos: salidas registradas en caja.
- Flujo: entradas menos salidas.
- Saldo pendiente: total de la orden menos anticipo.
- Utilidad estimada: total de órdenes menos costo registrado en servicios y salidas del mes. Es una referencia administrativa, no contable.
