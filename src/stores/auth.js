import { defineStore } from 'pinia'
import { supabase } from '../lib/supabase'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    perfil: null,
    loading: false
  }),

  getters: {
    isLoggedIn: (state) => !!state.user,
    isAdmin: (state) => state.perfil?.rol === 'Administrador'
  },

  actions: {
    async cargarSesion() {
      this.loading = true

      const { data } = await supabase.auth.getSession()
      this.user = data.session?.user || null

      if (this.user) {
        await this.cargarPerfil()
      }

      this.loading = false
    },

    async cargarPerfil() {
      if (!this.user) return

      const { data, error } = await supabase
        .from('perfiles')
        .select('*')
        .eq('id', this.user.id)
        .single()

      if (!error && data) {
        this.perfil = data
      }
    },

    async login(email, password) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      })

      if (error) throw error

      this.user = data.user
      await this.cargarPerfil()
    },

    async registro(nombre, email, password, rol = 'Tecnico') {
      const { data, error } = await supabase.auth.signUp({
        email,
        password
      })

      if (error) throw error

      if (data.user) {
        await supabase.from('perfiles').insert({
          id: data.user.id,
          nombre,
          rol
        })

        this.user = data.user
        await this.cargarPerfil()
      }
    },

    async logout() {
      await supabase.auth.signOut()
      this.user = null
      this.perfil = null
    }
  }
})
