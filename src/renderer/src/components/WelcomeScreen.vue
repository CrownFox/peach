<script setup lang="ts">
import type { RecentProject } from '@shared/recent'

defineProps<{ recents: RecentProject[] }>()
defineEmits<{ new: []; open: []; openRecent: [path: string]; forgetRecent: [path: string] }>()
</script>

<template>
  <div class="welcome">
    <section class="welcome-card">
      <div class="mark">P</div>
      <h1>Peach Game Maker</h1>
      <p>Build menus, buttons, and images, then play the game in the editor before you export it.</p>
      <div class="inline-actions">
        <button class="btn primary" type="button" @click="$emit('new')">New project</button>
        <button class="btn" type="button" @click="$emit('open')">Open project</button>
      </div>
      <div v-if="recents.length > 0" class="recent">
        <div class="field-label">Recent projects</div>
        <div v-for="item in recents" :key="item.path" class="recent-row">
          <button class="recent-open" type="button" :title="item.path" @click="$emit('openRecent', item.path)">
            <span class="recent-name">{{ item.name }}</span>
            <span class="recent-path">{{ item.path }}</span>
          </button>
          <button class="recent-forget" type="button" title="Remove from recent projects" @click="$emit('forgetRecent', item.path)">×</button>
        </div>
      </div>
    </section>
  </div>
</template>
