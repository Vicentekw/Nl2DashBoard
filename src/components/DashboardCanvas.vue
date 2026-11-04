<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useDashboardStore } from '../store/dashboard'
import DashboardComponent from './DashboardComponent.vue'
import type { Rect } from '../types'

const dash = useDashboardStore()
const canvasEl = ref<HTMLElement>()
const wrapEl = ref<HTMLElement>()

/** 等比缩放：画布逻辑尺寸固定，按可视区域 fit-to-view，保证整屏完整可见、不出滚动条 */
const scale = ref(1)
let resizeObserver: ResizeObserver | null = null

function updateScale() {
  const el = wrapEl.value
  if (!el) return
  const availW = Math.max(120, el.clientWidth - 28)
  const availH = Math.max(90, el.clientHeight - 28)
  scale.value = Math.max(0.1, Math.min(availW / dash.canvas.w, availH / dash.canvas.h))
}

onMounted(() => {
  resizeObserver = new ResizeObserver(updateScale)
  if (wrapEl.value) resizeObserver.observe(wrapEl.value)
  updateScale()
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
})

watch(() => [dash.canvas.w, dash.canvas.h], updateScale)

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
})

interface DragState {
  id: string
  mode: 'move' | 'resize'
  startX: number
  startY: number
  origRect: Rect
}

let drag: DragState | null = null

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
  const w = dash.canvas.w
  const h = dash.canvas.h
  // 屏幕位移 → 逻辑坐标位移（除以缩放比）
  const dx = (e.clientX - drag.startX) / scale.value
  const dy = (e.clientY - drag.startY) / scale.value
  const dxPct = (dx / w) * 100
  const dyPct = (dy / h) * 100
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
  dash.updateItem(drag.id, { rect: patch }, undefined)
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

function onPointerUp() {
  drag = null
}

const canvasStyle = computed(() => ({
  background: dash.theme.background,
  color: dash.theme.textColor,
  width: dash.canvas.w + 'px',
  height: dash.canvas.h + 'px',
  transform: `scale(${scale.value})`
}))

const stageStyle = computed(() => ({
  width: dash.canvas.w * scale.value + 'px',
  height: dash.canvas.h * scale.value + 'px'
}))
</script>

<template>
  <div ref="wrapEl" class="canvas-wrap">
    <div class="stage" :style="stageStyle">
      <div ref="canvasEl" class="canvas" :style="canvasStyle" @pointerdown.self="dash.select('')">
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
  </div>
</template>

<style scoped>
.canvas-wrap {
  height: 100%;
  background: var(--bg);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* stage 占位实际渲染尺寸，canvas 按逻辑尺寸 1600×900 等比缩放 */
.stage {
  position: relative;
  flex-shrink: 0;
}

.canvas {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: top left;
  border-radius: 8px;
  border: 1px solid var(--border);
  overflow: hidden;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
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
  font-size: 26px;
  font-weight: 700;
  letter-spacing: 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  pointer-events: none;
}

.item {
  position: absolute;
  border-radius: 6px;
  background: var(--panel, #121a3a);
  border: 1px solid rgba(255, 255, 255, 0.1);
  overflow: hidden;
  cursor: move;
  user-select: none;
  transition: border-color 0.12s;
}

.item.selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}

.resize-handle {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 14px;
  height: 14px;
  cursor: nwse-resize;
  background: linear-gradient(135deg, transparent 50%, var(--accent) 50%);
  opacity: 0;
}

.item:hover .resize-handle,
.item.selected .resize-handle {
  opacity: 0.85;
}

.empty-hint {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  justify-content: center;
  color: var(--text-3);
  font-size: 20px;
  letter-spacing: 1px;
}
</style>
