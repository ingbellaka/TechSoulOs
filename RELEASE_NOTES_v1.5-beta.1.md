# TechSoul OS v1.5.0-beta.1

## Corrección del cotizador TechSoul AI

- Coincidencia estricta por marca y modelo.
- `iPhone 13` ya no mezcla tarifas de iPhone 13 mini, 13 Pro, 13 Pro Max ni otros modelos.
- Filtro estricto por servicio y calidad.
- Consolidación de registros duplicados por marca, modelo, servicio y calidad.
- Cuando existen precios contradictorios, se conserva una sola tarifa usando primero la fecha de actualización y, si no existe una fecha útil, el precio mayor para evitar mostrar tarifas antiguas demasiado bajas.
- Los presupuestos creados desde TechSoul AI reciben únicamente las opciones consolidadas.
- Se agregó una función de auditoría para localizar conflictos de precios en el tarifario.

## Resultado esperado

La consulta `Pantalla para iPhone 13` devuelve solamente las tarifas exactas registradas para:

- Apple / iPhone 13 / Pantalla / INCELL
- Apple / iPhone 13 / Pantalla / OLED

No se muestran tarifas de otros modelos ni varias copias de la misma calidad.
