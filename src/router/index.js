import { createRouter, createWebHistory } from 'vue-router'
import { supabase } from '../lib/supabase'

import LoginView from '../views/LoginView.vue'
import DashboardView from '../views/DashboardView.vue'
import ClientesView from '../views/ClientesView.vue'
import EquiposView from '../views/EquiposView.vue'
import NuevaOrdenView from '../views/NuevaOrdenView.vue'
import OrdenesView from '../views/OrdenesView.vue'
import DetalleOrdenView from '../views/DetalleOrdenView.vue'
import EditarOrdenView from '../views/EditarOrdenView.vue'
import InventarioView from '../views/InventarioView.vue'
import VentasView from '../views/VentasView.vue'
import ComprasView from '../views/ComprasView.vue'
import OrdenCompraDetalleView from '../views/OrdenCompraDetalleView.vue'
import CajaView from '../views/CajaView.vue'
import ConfiguracionView from '../views/ConfiguracionView.vue'
import ConversacionesView from '../views/ConversacionesView.vue'
import AIHubView from '../views/AIHubView.vue'
import AutomatizacionesView from '../views/AutomatizacionesView.vue'
import GarantiasView from '../views/GarantiasView.vue'
import ReportesView from '../views/ReportesView.vue'
import UsuariosView from '../views/UsuariosView.vue'
import TarifarioView from '../views/TarifarioView.vue'
import CotizadorView from '../views/CotizadorView.vue'
import PresupuestosView from '../views/PresupuestosView.vue'
import InteligenciaPreciosView from '../views/InteligenciaPreciosView.vue'

const routes = [
  { path: '/login', name: 'login', component: LoginView, meta: { public: true } },
  { path: '/', name: 'dashboard', component: DashboardView },
  { path: '/clientes', name: 'clientes', component: ClientesView },
  { path: '/equipos', name: 'equipos', component: EquiposView },
  { path: '/nueva-orden', name: 'nuevaOrden', component: NuevaOrdenView },
  { path: '/ordenes', name: 'ordenes', component: OrdenesView },
  { path: '/ordenes/:id', name: 'detalleOrden', component: DetalleOrdenView },
  { path: '/ordenes/:id/editar', name: 'editarOrden', component: EditarOrdenView },
  { path: '/inventario', name: 'inventario', component: InventarioView },
  { path: '/ventas', name: 'ventas', component: VentasView },
  { path: '/tarifario', name: 'tarifario', component: TarifarioView },
  { path: '/cotizador', name: 'cotizador', component: CotizadorView },
  { path: '/presupuestos', name: 'presupuestos', component: PresupuestosView },
  { path: '/inteligencia-precios', name: 'inteligenciaPrecios', component: InteligenciaPreciosView },
  { path: '/compras', name: 'compras', component: ComprasView },
  { path: '/compras/:id', name: 'ordenCompraDetalle', component: OrdenCompraDetalleView },
  { path: '/caja', name: 'caja', component: CajaView },
  { path: '/conversaciones', name: 'conversaciones', component: ConversacionesView },
  { path: '/garantias', name: 'garantias', component: GarantiasView },
  { path: '/reportes', name: 'reportes', component: ReportesView },
  { path: '/ia', name: 'ia', component: AIHubView },
  { path: '/automatizaciones', name: 'automatizaciones', component: AutomatizacionesView },
  { path: '/usuarios', name: 'usuarios', component: UsuariosView },
  { path: '/configuracion', name: 'configuracion', component: ConfiguracionView }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach(async (to) => {
  if (to.meta.public) return true

  const { data } = await supabase.auth.getSession()

  if (!data.session) {
    return '/login'
  }

  return true
})

export default router
