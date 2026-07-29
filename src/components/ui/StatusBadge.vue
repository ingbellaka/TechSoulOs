<script setup>
defineProps({ tone: { type: String, default: 'neutral' } })
</script>
<template><span class="ui-status-badge" :class="`is-${tone}`"><slot /></span></template>
