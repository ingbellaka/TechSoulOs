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
import AgendaView from '../views/AgendaView.vue'
import TallerView from '../views/TallerView.vue'
import ControlCalidadView from '../views/ControlCalidadView.vue'
import CorteCajaView from '../views/CorteCajaView.vue'
import ConfiguracionView from '../views/ConfiguracionView.vue'
import GarantiasView from '../views/GarantiasView.vue'
import ReportesView from '../views/ReportesView.vue'
import UsuariosView from '../views/UsuariosView.vue'
import TarifarioView from '../views/TarifarioView.vue'
import CotizadorView from '../views/CotizadorView.vue'
import RentabilidadView from '../views/RentabilidadView.vue'
import FirmaGarantiaPublicaView from '../views/FirmaGarantiaPublicaView.vue'

/* Módulos desactivados por simplificación (código intacto en src/views, solo
   desconectados del router y del menú). Para reactivar alguno: descomenta su
   import aquí arriba, agrega su ruta abajo, y agrégalo de vuelta en
   AppSidebar.vue.
   - ConversacionesView, AIHubView, AutomatizacionesView, InteligenciaPreciosView,
     BaseConocimientoView, PromocionesView, PlantillasView, AuditoriaView,
     IAConfigView, AgenteIAView, ConfigAgenteIAView, PresupuestosView
*/

const OPERACION = ['admin', 'recepcion', 'tecnico']
const FINANZAS = ['admin', 'recepcion']
const SOLO_ADMIN = ['admin']

const routes = [
  { path: '/login', name: 'login', component: LoginView, meta: { public: true, guestOnly: true } },
  { path: '/recuperar-contrasena', name: 'recuperarContrasena', component: RecuperarContrasenaView, meta: { public: true, guestOnly: true } },
  { path: '/restablecer-contrasena', name: 'restablecerContrasena', component: RestablecerContrasenaView, meta: { public: true } },
  { path: '/firma-garantia/:token', name: 'firmaGarantiaPublica', component: FirmaGarantiaPublicaView, meta: { public: true } },
  { path: '/sin-permiso', name: 'sinPermiso', component: SinPermisoView },
  { path: '/', name: 'dashboard', component: DashboardView },
  { path: '/clientes', name: 'clientes', component: ClientesView, meta: { roles: OPERACION } },
  { path: '/equipos', name: 'equipos', component: EquiposView, meta: { roles: OPERACION } },
  { path: '/nueva-orden', name: 'nuevaOrden', component: NuevaOrdenView, meta: { roles: OPERACION } },
  { path: '/ordenes', name: 'ordenes', component: OrdenesView, meta: { roles: OPERACION } },
  { path: '/agenda', name: 'agenda', component: AgendaView, meta: { roles: OPERACION } },
  { path: '/taller', name: 'taller', component: TallerView, meta: { roles: OPERACION } },
  { path: '/taller/:id/control', name: 'controlCalidad', component: ControlCalidadView, meta: { roles: OPERACION } },
  { path: '/ordenes/:id', name: 'detalleOrden', component: DetalleOrdenView, meta: { roles: OPERACION } },
  { path: '/ordenes/:id/editar', name: 'editarOrden', component: EditarOrdenView, meta: { roles: OPERACION } },
  { path: '/catalogo-servicios', name: 'catalogoServicios', component: CatalogoServiciosView, meta: { roles: OPERACION } },
  { path: '/inventario', name: 'inventario', component: InventarioView, meta: { roles: OPERACION } },
  { path: '/ventas', name: 'ventas', component: VentasView, meta: { roles: FINANZAS } },
  { path: '/tarifario', name: 'tarifario', component: TarifarioView, meta: { roles: OPERACION } },
  { path: '/cotizador', name: 'cotizador', component: CotizadorView, meta: { roles: OPERACION } },
  { path: '/compras', name: 'compras', component: ComprasView, meta: { roles: FINANZAS } },
  { path: '/compras/:id', name: 'ordenCompraDetalle', component: OrdenCompraDetalleView, meta: { roles: FINANZAS } },
  { path: '/caja', name: 'caja', component: CajaView, meta: { roles: FINANZAS } },
  { path: '/corte-caja', name: 'corteCaja', component: CorteCajaView, meta: { roles: FINANZAS } },
  { path: '/garantias', name: 'garantias', component: GarantiasView, meta: { roles: OPERACION } },
  { path: '/reportes', name: 'reportes', component: ReportesView, meta: { roles: FINANZAS } },
  { path: '/rentabilidad', name: 'rentabilidad', component: RentabilidadView, meta: { roles: SOLO_ADMIN } },
  { path: '/usuarios', name: 'usuarios', component: UsuariosView, meta: { roles: SOLO_ADMIN } },
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
