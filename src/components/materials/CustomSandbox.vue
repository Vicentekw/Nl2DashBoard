<script setup lang="ts">
/**
 * AI 自定义组件的 iframe 沙箱运行时：
 * - sandbox="allow-scripts"（opaque origin，无法访问父页面与存储）
 * - 渲染代码通过 postMessage 注入，运行时错误捕获后上报父页面 → 进入自修复闭环
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { DashboardTheme } from '../../types'

const props = defineProps<{
  code: string
  data: unknown
  theme: DashboardTheme
  itemId: string
}>()

const emit = defineEmits<{ (e: 'render-error', message: string): void }>()

const frameRef = ref<HTMLIFrameElement>()
const ready = ref(false)

const SANDBOX_HTML = [
  '<!doctype html><html><head><meta charset="utf-8">',
  '<script src="https://cdn.jsdelivr.net/npm/echarts@5.6.0/dist/echarts.min.js"><\/script>',
  '</head><body style="margin:0;background:transparent;overflow:hidden">',
  '<div id="root" style="width:100%;height:100%"></div>',
  '<script>',
  'var chart = null;',
  'window.addEventListener("message", function (e) {',
  '  var m = e.data;',
  '  if (!m || m.__nl2d !== "render") return;',
  '  var root = document.getElementById("root");',
  '  root.innerHTML = "";',
  '  if (chart) { chart.dispose(); chart = null; }',
  '  try {',
  '    var fn = new Function(m.code + "\\n;return render;")();',
  '    fn({ el: root, echarts: window.echarts, data: m.data, theme: m.theme });',
  '    parent.postMessage({ __nl2d: "ok", id: m.id }, "*");',
  '  } catch (err) {',
  '    parent.postMessage({ __nl2d: "error", id: m.id, message: String((err && err.message) || err) }, "*");',
  '  }',
  '});',
  'parent.postMessage({ __nl2d: "ready" }, "*");',
  '<\/script></body></html>'
].join('')

function postRender() {
  const win = frameRef.value?.contentWindow
  if (!win || !ready) return
  win.postMessage(
    { __nl2d: 'render', id: props.itemId, code: props.code, data: props.data, theme: props.theme },
    '*'
  )
}

function onMessage(e: MessageEvent) {
  if (e.source !== frameRef.value?.contentWindow) return
  const m = e.data as { __nl2d?: string; id?: string; message?: string }
  if (!m || m.__nl2d !== 'error' || m.id !== props.itemId) return
  emit('render-error', m.message ?? '未知沙箱错误')
}

onMounted(() => {
  window.addEventListener('message', onMessage)
})

onBeforeUnmount(() => {
  window.removeEventListener('message', onMessage)
})

watch(ready, () => postRender())

function onLoad() {
  ready.value = true
  postRender()
}

watch(
  () => [props.code, props.data, props.theme],
  () => postRender(),
  { deep: true }
)
</script>

<template>
  <iframe
    ref="frameRef"
    class="sandbox"
    sandbox="allow-scripts"
    :srcdoc="SANDBOX_HTML"
    @load="onLoad"
  />
</template>

<style scoped>
.sandbox {
  width: 100%;
  height: 100%;
  border: none;
  background: transparent;
}
</style>
