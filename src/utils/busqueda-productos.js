function textoComparable(valor) {
  return String(valor ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}
export function coincideBusquedaProducto(campos, consulta = '') {
  const palabras = textoComparable(consulta).split(/\s+/).filter(Boolean)
  const texto = textoComparable(campos.filter(Boolean).join(' '))
  const compacto = texto.replace(/\s+/g, '')
  return palabras.every(palabra => texto.includes(palabra) || compacto.includes(palabra))
}

export function buscarProductosVenta(productos, consulta = '') {
  return productos.filter(producto => {
    if (!(Number(producto.stock || 0) > 0)) return false
    return coincideBusquedaProducto([producto.nombre, producto.compatible_con, producto.modelo, producto.marca, producto.sku, producto.codigo, producto.codigo_barras, producto.categoria, producto.tipo_producto, producto.color], consulta)
  })
}
export function modeloProductoVenta(producto) {
  return [producto.marca, producto.modelo, producto.compatible_con].filter(Boolean).filter((valor, indice, lista) => lista.indexOf(valor) === indice).join(' · ') || 'Modelo sin registrar'
}
