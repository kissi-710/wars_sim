<script setup lang="ts">
import { ui } from '../store'
</script>

<template>
  <div class="toast-host" aria-live="polite">
    <div v-for="t in ui.toastList" :key="t.id" class="toast" :style="{ borderLeftColor: t.color }">{{ t.text }}</div>
  </div>
</template>
