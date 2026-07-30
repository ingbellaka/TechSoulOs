<script setup>
import { computed,onMounted,ref } from 'vue'
import { adminRepository } from '../repositories/admin.repository'
const rows=ref([]),q=ref(''),loading=ref(true),error=ref('')
const filtradas=computed(()=>{const t=q.value.toLowerCase();return rows.value.filter(r=>!t||[r.usuario_nombre,r.modulo,r.accion,r.entidad,r.entidad_id].some(v=>String(v||'').toLowerCase().includes(t)))})
onMounted(async()=>{try{rows.value=await adminRepository.auditoria()}catch(e){error.value=e.message}finally{loading.value=false}})
</script>
<template><section class="ts-module-page"><header class="ts-module-header"><div><span class="ts-eyebrow">Seguridad</span><h2>Auditoría</h2><p>Bitácora de acciones importantes realizadas dentro del sistema.</p></div></header><div v-if="error" class="alert alert-danger">{{error}}</div><div class="ts-panel p-4"><input v-model="q" class="form-control mb-3" placeholder="Buscar usuario, módulo, acción o folio"><div class="table-responsive"><table class="table align-middle"><thead><tr><th>Fecha</th><th>Usuario</th><th>Módulo</th><th>Acción</th><th>Entidad</th><th>Detalle</th></tr></thead><tbody><tr v-for="r in filtradas" :key="r.id"><td>{{new Date(r.creado_en).toLocaleString('es-MX')}}</td><td>{{r.usuario_nombre||'Sistema'}}</td><td>{{r.modulo}}</td><td><span class="badge text-bg-light">{{r.accion}}</span></td><td>{{r.entidad}} {{r.entidad_id||''}}</td><td><code>{{JSON.stringify(r.detalle||{})}}</code></td></tr></tbody></table><p v-if="!loading&&!filtradas.length" class="text-muted">No hay movimientos registrados.</p></div></div></section></template>
