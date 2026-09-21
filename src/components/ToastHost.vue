<script setup lang="ts">
import { ui } from '../store'
import Icon from './Icon.vue'
</script>

<template>
  <div class="toast-host" aria-live="polite">
    <div v-for="t in ui.toastList" :key="t.id" class="toast" :style="{ borderLeftColor: t.color }">
      <Icon name="flag" :size="14" :style="{ color: t.color }" />{{ t.text }}
    </div>
  </div>
</template>
