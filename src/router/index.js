import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

import LoginView from '../views/LoginView.vue'
import RecuperarContrasenaView from '../views/RecuperarContrasenaView.vue'
import RestablecerContrasenaView from '../views/RestablecerContrasenaView.vue'
import SinPermisoView from '../views/SinPermisoView.vue'
import DashboardView from '../views/DashboardView.vue'
import ClientesView from '../views/ClientesView.vue'
import EquiposView from '../views/EquiposView.vue'
import NuevaOrdenView from '../views/NuevaOrdenView.vue'
import OrdenesView from '../views/OrdenesView.vue'
import DetalleOrdenView from '../views/DetalleOrdenView.vue'
import EditarOrdenView from '../views/EditarOrdenView.vue'
import InventarioView from '../views/InventarioView.vue'
import CatalogoServiciosView from '../views/CatalogoServiciosView.vue'
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
import BaseConocimientoView from '../views/BaseConocimientoView.vue'
import PromocionesView from '../views/PromocionesView.vue'
import PlantillasView from '../views/PlantillasView.vue'
import AuditoriaView from '../views/AuditoriaView.vue'
import IAConfigView from '../views/IAConfigView.vue'
import AgenteIAView from '../views/AgenteIAView.vue'
import ConfigAgenteIAView from '../views/ConfigAgenteIAView.vue'

const OPERACION = ['admin', 'recepcion', 'tecnico']
const FINANZAS = ['admin', 'recepcion']
const SOLO_ADMIN = ['admin']

const routes = [
  { path: '/login', name: 'login', component: LoginView, meta: { public: true, guestOnly: true } },
  { path: '/recuperar-contrasena', name: 'recuperarContrasena', component: RecuperarContrasenaView, meta: { public: true, guestOnly: true } },
  { path: '/restablecer-contrasena', name: 'restablecerContrasena', component: RestablecerContrasenaView, meta: { public: true } },
  { path: '/sin-permiso', name: 'sinPermiso', component: SinPermisoView },
  { path: '/', name: 'dashboard', component: DashboardView },
  { path: '/clientes', name: 'clientes', component: ClientesView, meta: { roles: OPERACION } },
  { path: '/equipos', name: 'equipos', component: EquiposView, meta: { roles: OPERACION } },
  { path: '/nueva-orden', name: 'nuevaOrden', component: NuevaOrdenView, meta: { roles: OPERACION } },
  { path: '/ordenes', name: 'ordenes', component: OrdenesView, meta: { roles: OPERACION } },
  { path: '/ordenes/:id', name: 'detalleOrden', component: DetalleOrdenView, meta: { roles: OPERACION } },
  { path: '/ordenes/:id/editar', name: 'editarOrden', component: EditarOrdenView, meta: { roles: OPERACION } },
  { path: '/catalogo-servicios', name: 'catalogoServicios', component: CatalogoServiciosView, meta: { roles: OPERACION } },
  { path: '/inventario', name: 'inventario', component: InventarioView, meta: { roles: OPERACION } },
  { path: '/ventas', name: 'ventas', component: VentasView, meta: { roles: FINANZAS } },
  { path: '/tarifario', name: 'tarifario', component: TarifarioView, meta: { roles: OPERACION } },
  { path: '/cotizador', name: 'cotizador', component: CotizadorView, meta: { roles: OPERACION } },
  { path: '/presupuestos', name: 'presupuestos', component: PresupuestosView, meta: { roles: OPERACION } },
  { path: '/inteligencia-precios', name: 'inteligenciaPrecios', component: InteligenciaPreciosView, meta: { roles: FINANZAS } },
  { path: '/compras', name: 'compras', component: ComprasView, meta: { roles: FINANZAS } },
  { path: '/compras/:id', name: 'ordenCompraDetalle', component: OrdenCompraDetalleView, meta: { roles: FINANZAS } },
  { path: '/caja', name: 'caja', component: CajaView, meta: { roles: FINANZAS } },
  { path: '/conversaciones', name: 'conversaciones', component: ConversacionesView, meta: { roles: OPERACION } },
  { path: '/garantias', name: 'garantias', component: GarantiasView, meta: { roles: OPERACION } },
  { path: '/reportes', name: 'reportes', component: ReportesView, meta: { roles: FINANZAS } },
  { path: '/ia', name: 'ia', component: AIHubView, meta: { roles: OPERACION } },
  { path: '/agente-ia', name: 'agenteIA', component: AgenteIAView, meta: { roles: OPERACION } },
  { path: '/agente-ia/configuracion', name: 'configAgenteIA', component: ConfigAgenteIAView, meta: { roles: SOLO_ADMIN } },
  { path: '/automatizaciones', name: 'automatizaciones', component: AutomatizacionesView, meta: { roles: SOLO_ADMIN } },
  { path: '/usuarios', name: 'usuarios', component: UsuariosView, meta: { roles: SOLO_ADMIN } },
  { path: '/base-conocimiento', name: 'baseConocimiento', component: BaseConocimientoView, meta: { roles: SOLO_ADMIN } },
  { path: '/promociones', name: 'promociones', component: PromocionesView, meta: { roles: SOLO_ADMIN } },
  { path: '/plantillas', name: 'plantillas', component: PlantillasView, meta: { roles: SOLO_ADMIN } },
  { path: '/auditoria', name: 'auditoria', component: AuditoriaView, meta: { roles: SOLO_ADMIN } },
  { path: '/ia-configuracion', name: 'iaConfiguracion', component: IAConfigView, meta: { roles: SOLO_ADMIN } },
  { path: '/configuracion', name: 'configuracion', component: ConfiguracionView, meta: { roles: SOLO_ADMIN } },
  { path: '/:pathMatch(.*)*', redirect: '/' }
]

const router = createRouter({ history: createWebHistory(), routes })

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.initialize()

  if (to.meta.guestOnly && auth.isLoggedIn) return '/'
  if (to.meta.public) return true
  if (!auth.isLoggedIn) return { path: '/login', query: { redirect: to.fullPath } }
  if (!auth.perfil || auth.perfil.activo === false) {
    await auth.logout()
    return '/login'
  }
  if (Array.isArray(to.meta.roles) && !auth.can(to.meta.roles)) return '/sin-permiso'
  return true
})

export default router
