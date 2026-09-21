<script setup lang="ts">
import { ui } from '../store'
import Icon from './Icon.vue'
import CellInspector from './CellInspector.vue'
import CountryList from './CountryList.vue'
</script>

<template>
  <aside class="sidebar">
    <div class="tabs" role="tablist">
      <button class="tab" :class="{ active: ui.sidebarTab === 'country' }" role="tab" @click="ui.sidebarTab = 'country'">国</button>
      <button class="tab" :class="{ active: ui.sidebarTab === 'cell' }" role="tab" @click="ui.sidebarTab = 'cell'">マス</button>
      <span class="spacer" />
      <button class="btn tiny icon" title="サイドバーを閉じる" @click="ui.sidebarOpen = false"><Icon name="chevronRight" :size="14" /></button>
    </div>
    <div class="side-body">
      <CountryList v-show="ui.sidebarTab === 'country'" />
      <CellInspector v-show="ui.sidebarTab === 'cell'" />
    </div>
  </aside>
</template>
