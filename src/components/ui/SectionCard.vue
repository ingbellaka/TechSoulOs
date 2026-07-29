<script setup>
defineProps({
  eyebrow: { type: String, default: '' },
  title: { type: String, default: '' },
  description: { type: String, default: '' },
  flush: { type: Boolean, default: false }
})
</script>

<template>
  <section class="ui-section-card" :class="{ 'is-flush': flush }">
    <header v-if="title || eyebrow || description || $slots.actions" class="ui-section-card__header">
      <div>
        <span v-if="eyebrow" class="ui-eyebrow">{{ eyebrow }}</span>
        <h3 v-if="title">{{ title }}</h3>
        <p v-if="description">{{ description }}</p>
      </div>
      <div v-if="$slots.actions" class="ui-section-card__actions"><slot name="actions" /></div>
    </header>
    <div class="ui-section-card__body"><slot /></div>
  </section>
</template>
