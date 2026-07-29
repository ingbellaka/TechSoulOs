<script setup>
defineProps({ label: String, value: [String, Number], hint: String })
</script>
<template><article class="ui-stat-card"><span>{{ label }}</span><strong>{{ value }}</strong><small v-if="hint">{{ hint }}</small></article></template>
