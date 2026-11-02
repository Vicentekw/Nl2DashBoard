<script setup lang="ts">
/** ECharts 渲染封装：初始化 / 响应式更新 / 尺寸自适应 / 错误捕获上报（自修复闭环入口） */
import * as echarts from 'echarts'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  option: Record<string, unknown> | null
  primary: string
}>()

const emit = defineEmits<{ (e: 'render-error', message: string): void }>()

const elRef = ref<HTMLElement>()
let chart: echarts.ECharts | null = null
let observer: ResizeObserver | null = null

function render() {
  if (!elRef.value) return
  try {
    if (!chart) {
      chart = echarts.init(elRef.value)
    }
    if (props.option) {
      chart.setOption(props.option as never, true)
    } else {
      chart.clear()
    }
  } catch (e) {
    emit('render-error', e instanceof Error ? e.message : String(e))
  }
}

onMounted(() => {
  render()
  observer = new ResizeObserver(() => chart?.resize())
  if (elRef.value) observer.observe(elRef.value)
})

watch(
  () => props.option,
  () => render(),
  { deep: true }
)

onBeforeUnmount(() => {
  observer?.disconnect()
  chart?.dispose()
  chart = null
})
</script>

<template>
  <div ref="elRef" class="echart" />
</template>

<style scoped>
.echart {
  width: 100%;
  height: 100%;
}
</style>
