<script setup lang="ts">
import { ui } from '../store'
import MapMinimap from './MapMinimap.vue'
import MapStatusBar from './MapStatusBar.vue'
import MapToolbar from './MapToolbar.vue'
import MapView from './MapView.vue'
</script>

<template>
  <section class="map-area">
    <MapToolbar />
    <div class="map-stage">
      <MapView />
      <MapMinimap v-if="ui.minimap" />
    </div>
    <MapStatusBar />
  </section>
</template>
