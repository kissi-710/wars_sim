<script setup lang="ts">
import { computed } from 'vue'

/** 24x24 の線画アイコン(外部ライブラリなし)。fill: true のものは塗りつぶし。 */
const ICONS: Record<string, { d: string; fill?: boolean }> = {
  play: { d: 'M8 5.5v13a.8.8 0 0 0 1.2.7l10.4-6.5a.8.8 0 0 0 0-1.4L9.2 4.8A.8.8 0 0 0 8 5.5z', fill: true },
  pause: { d: 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z', fill: true },
  step: { d: 'M5 5.6v12.8a.8.8 0 0 0 1.2.7l9-6.4a.8.8 0 0 0 0-1.3l-9-6.4A.8.8 0 0 0 5 5.6zM17.5 5h2v14h-2z', fill: true },
  restart: { d: 'M4.5 12a7.5 7.5 0 1 0 2.4-5.5M4.5 4.5v4h4' },
  zoomIn: { d: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20.5 20.5l-4.6-4.6M8 11h6M11 8v6' },
  zoomOut: { d: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20.5 20.5l-4.6-4.6M8 11h6' },
  fit: { d: 'M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4' },
  layers: { d: 'M12 3.5l8.5 4.7-8.5 4.7-8.5-4.7zM3.5 12.3l8.5 4.7 8.5-4.7M3.5 16.3l8.5 4.7 8.5-4.7' },
  settings: { d: 'M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1M15 5v4M9 10v4M17 15v4' },
  help: { d: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.6 9.4a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.2 1-1.2 1.9M12 17h.01' },
  chevronRight: { d: 'M9 5.5l6.5 6.5L9 18.5' },
  chevronLeft: { d: 'M15 5.5L8.5 12l6.5 6.5' },
  chevronDown: { d: 'M5.5 9l6.5 6.5L18.5 9' },
  chevronUp: { d: 'M5.5 15l6.5-6.5L18.5 15' },
  close: { d: 'M6 6l12 12M18 6L6 18' },
  dice: { d: 'M6 3.5h12A2.5 2.5 0 0 1 20.5 6v12a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 18V6A2.5 2.5 0 0 1 6 3.5zM8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01' },
  crosshair: { d: 'M12 3v4M12 17v4M3 12h4M17 12h4M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z' },
  flag: { d: 'M5 21V4M5 4.5c3-1.8 5 1.8 8 0s4-1 6-.5v9c-2-.5-3-1.3-6 .5s-5-1.8-8 0' },
  sword: { d: 'M14.5 4.5h5v5l-9 9-3 .5.5-3zM5 19l2-2M4 20l3-1' },
  alert: { d: 'M12 4l9 16H3zM12 10v4.5M12 17.5h.01' },
  star: { d: 'M12 3.8l2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8z' },
  list: { d: 'M4 6.5h16M4 12h16M4 17.5h10' },
}

const props = withDefaults(defineProps<{ name: string; size?: number; stroke?: number }>(), { size: 16, stroke: 1.9 })
const icon = computed(() => ICONS[props.name] ?? ICONS.help!)
</script>

<template>
  <svg
    class="icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    :fill="icon.fill ? 'currentColor' : 'none'"
    :stroke="icon.fill ? 'none' : 'currentColor'"
    :stroke-width="stroke"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="icon.d" />
  </svg>
</template>
