<script setup lang="ts">
defineProps<{ title: string; confirmLabel: string; danger?: boolean }>()
defineEmits<{ cancel: []; confirm: [] }>()
</script>

<template>
  <div class="modal-backdrop" @pointerdown.self="$emit('cancel')">
    <form class="modal" @submit.prevent="$emit('confirm')">
      <h2>{{ title }}</h2>
      <slot></slot>
      <footer>
        <button class="btn quiet" type="button" @click="$emit('cancel')">Cancel</button>
        <button class="btn" :class="danger ? 'danger' : 'primary'" type="submit">{{ confirmLabel }}</button>
      </footer>
    </form>
  </div>
</template>
