<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useDashboardStore } from '../store/dashboard'
import DashboardComponent from './DashboardComponent.vue'
import type { Rect } from '../types'

const dash = useDashboardStore()
const canvasEl = ref<HTMLElement>()

interface DragState {
  id: string
  mode: 'move' | 'resize'
  startX: number
  startY: number
  origRect: Rect
}

let drag: DragState | null = null

function pxToPercentRect() {
  const el = canvasEl.value
  return {
    w: el?.clientWidth ?? 1600,
    h: el?.clientHeight ?? 900
  }
}

function onPointerDown(e: PointerEvent, id: string, mode: 'move' | 'resize') {
  const item = dash.getItem(id)
  if (!item) return
  dash.select(id)
  const rect = item.rect
  drag = {
    id,
    mode,
    startX: e.clientX,
    startY: e.clientY,
    origRect: JSON.parse(JSON.stringify(rect)) as Rect
  }
  ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  e.preventDefault()
}

function onPointerMove(e: PointerEvent) {
  if (!drag) return
  const { w, h } = pxToPercentRect()
  const dxPct = ((e.clientX - drag.startX) / w) * 100
  const dyPct = ((e.clientY - drag.startY) / h) * 100
  const o = drag.origRect
  const patch: Rect =
    drag.mode === 'move'
      ? {
          x: { ...o.x, value: round2(o.x.value + (o.x.unit === '%' ? dxPct : (dxPct / 100) * w)) },
          y: { ...o.y, value: round2(o.y.value + (o.y.unit === '%' ? dyPct : (dyPct / 100) * h)) },
          w: o.w,
          h: o.h
        }
      : {
          x: o.x,
          y: o.y,
          w: { ...o.w, value: round2(o.w.value + (o.w.unit === '%' ? dxPct : (dxPct / 100) * w)) },
          h: { ...o.h, value: round2(o.h.value + (o.h.unit === '%' ? dyPct : (dyPct / 100) * h)) }
        }
  dash.updateItem(drag.id, { rect: patch })
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

function onPointerUp() {
  drag = null
}

onMounted(() => {
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
})

const style = computed(() => ({
  background: dash.theme.background,
  color: dash.theme.textColor
}))
</script>

<template>
  <div class="canvas-wrap">
    <div ref="canvasEl" class="canvas" :style="style" @pointerdown.self="dash.select('')">
      <div class="canvas-title">{{ dash.title }}</div>
      <div
        v-for="item in dash.items"
        :key="item.id"
        class="item"
        :class="{ selected: dash.selectedId === item.id }"
        :style="{
          left: item.rect.x.unit === '%' ? item.rect.x.value + '%' : item.rect.x.value + 'px',
          top: item.rect.y.unit === '%' ? item.rect.y.value + '%' : item.rect.y.value + 'px',
          width: item.rect.w.unit === '%' ? item.rect.w.value + '%' : item.rect.w.value + 'px',
          height: item.rect.h.unit === '%' ? item.rect.h.value + '%' : item.rect.h.value + 'px'
        }"
        @pointerdown.stop="onPointerDown($event, item.id, 'move')"
      >
        <DashboardComponent :item="item" />
        <div class="resize-handle" @pointerdown.stop="onPointerDown($event, item.id, 'resize')" />
      </div>
      <div v-if="dash.items.length === 0" class="empty-hint">在左侧输入需求，AI 将自动生成大屏</div>
    </div>
  </div>
</template>

<style scoped>
.canvas-wrap {
  height: 100%;
  padding: 16px;
  background: #070b1c;
  overflow: auto;
}

.canvas {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  min-height: 480px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.canvas-title {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 7%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: clamp(14px, 1.3vw, 22px);
  font-weight: 700;
  letter-spacing: 4px;
  background: linear-gradient(180deg, rgba(54, 207, 201, 0.12), transparent);
  pointer-events: none;
}

.item {
  position: absolute;
  border-radius: 8px;
  background: var(--panel, #121a3a);
  border: 1px solid rgba(255, 255, 255, 0.1);
  overflow: hidden;
  cursor: move;
  user-select: none;
}

.item.selected {
  border-color: #36cfc9;
  box-shadow: 0 0 0 1px rgba(54, 207, 201, 0.5);
}

.resize-handle {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 14px;
  height: 14px;
  cursor: nwse-resize;
  background: linear-gradient(135deg, transparent 50%, rgba(54, 207, 201, 0.7) 50%);
}

.empty-hint {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(220, 228, 255, 0.3);
  font-size: 15px;
  letter-spacing: 2px;
}
</style>
