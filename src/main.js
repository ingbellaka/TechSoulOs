import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'

import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap/dist/js/bootstrap.bundle.min.js'
import './assets/styles/tokens.css'
import './assets/styles/shell.css'
import './assets/styles/modules.css'
import './assets/styles.css'
import './assets/styles/responsive.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
