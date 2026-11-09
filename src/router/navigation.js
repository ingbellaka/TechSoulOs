export const moduleGroups = [
  {
    label: 'Operación',
    items: [
      { label: 'Inicio', to: '/', icon: 'home' },
      { label: 'Taller', to: '/taller', icon: 'settings' },
      { label: 'Órdenes', to: '/ordenes', icon: 'clipboard' },
      { label: 'Agenda', to: '/agenda', icon: 'calendar' },
      { label: 'Garantías', to: '/garantias', icon: 'shield' }
    ]
  },
  {
    label: 'Ventas y caja',
    items: [
      { label: 'Caja', to: '/caja', icon: 'wallet' },
      { label: 'Ventas', to: '/ventas', icon: 'cart' },
      { label: 'Corte de caja', to: '/corte-caja', icon: 'cashcheck' }
    ]
  },
  {
    label: 'Finanzas',
    items: [
      { label: 'Rentabilidad', to: '/rentabilidad', icon: 'profit', roles: ['admin'] }
    ]
  },
  {
    label: 'Gestión',
    items: [
      { label: 'Clientes', to: '/clientes', icon: 'users' },
      { label: 'Equipos', to: '/equipos', icon: 'phone' }
    ]
  },
  {
    label: 'Inventario',
    items: [
      { label: 'Existencias', to: '/inventario', icon: 'box' },
      { label: 'Compras y proveedores', to: '/compras', icon: 'truck' }
    ]
  },
  {
    label: 'Herramientas',
    items: [
      { label: 'Catálogo de servicios', to: '/catalogo-servicios', icon: 'tag' },
      { label: 'Cotizador', to: '/cotizador', icon: 'calculator' },
      { label: 'Tarifario', to: '/tarifario', icon: 'tag' },
      { label: 'Reportes', to: '/reportes', icon: 'chart' }
    ]
  },
  {
    label: 'Sistema',
    items: [
      { label: 'Usuarios y permisos', to: '/usuarios', icon: 'users', roles: ['admin'] },
      { label: 'Configuración', to: '/configuracion', icon: 'settings', roles: ['admin'] }
    ]
  }
]
