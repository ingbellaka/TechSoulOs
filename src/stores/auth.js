import { defineStore } from 'pinia'
import { supabase } from '../lib/supabase'

const normalizeRole = (role) => String(role || '').trim().toLowerCase()

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    perfil: null,
    loading: true,
    initialized: false,
    authSubscription: null
  }),

  getters: {
    isLoggedIn: (state) => Boolean(state.user),
    role: (state) => normalizeRole(state.perfil?.rol),
    isAdmin() { return this.role === 'admin' },
    isActive: (state) => state.perfil?.activo !== false,
    can: (state) => (roles = []) => {
      const current = normalizeRole(state.perfil?.rol)
      return roles.length === 0 || roles.map(normalizeRole).includes(current)
    }
  },

  actions: {
    async initialize() {
      if (this.initialized) return
      this.loading = true

      const { data, error } = await supabase.auth.getSession()
      if (error) console.error('No fue posible recuperar la sesión:', error)

      this.user = data?.session?.user || null
      if (this.user) await this.cargarPerfil()

      const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
        this.user = session?.user || null
        if (this.user) await this.cargarPerfil()
        else this.perfil = null
      })

      this.authSubscription = listener?.subscription || null
      this.initialized = true
      this.loading = false
    },

    async cargarSesion() {
      return this.initialize()
    },

    async cargarPerfil() {
      if (!this.user) {
        this.perfil = null
        return null
      }

      const { data, error } = await supabase
        .from('perfiles')
        .select('*')
        .eq('id', this.user.id)
        .single()

      if (error) {
        console.error('No fue posible cargar el perfil:', error)
        this.perfil = null
        return null
      }

      this.perfil = data
      return data
    },

    async login(email, password) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: String(email || '').trim().toLowerCase(),
        password
      })

      if (error) throw error
      this.user = data.user
      await this.cargarPerfil()

      if (!this.perfil) {
        await supabase.auth.signOut()
        throw new Error('Tu usuario no tiene un perfil de TechSoul OS configurado.')
      }

      if (this.perfil.activo === false) {
        await supabase.auth.signOut()
        throw new Error('Tu usuario está desactivado. Contacta al administrador.')
      }

      return data
    },

    async solicitarRecuperacion(email) {
      const redirectTo = `${window.location.origin}/restablecer-contrasena`
      const { error } = await supabase.auth.resetPasswordForEmail(
        String(email || '').trim().toLowerCase(),
        { redirectTo }
      )
      if (error) throw error
    },

    async actualizarContrasena(password) {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
    },

    async logout() {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      this.user = null
      this.perfil = null
    }
  }
})
