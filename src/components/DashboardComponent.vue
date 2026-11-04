<script setup lang="ts">
import { computed, ref } from 'vue'
import type { DashboardItem, Dataset, TableData } from '../types'
import { useDashboardStore } from '../store/dashboard'
import { buildChartOption } from '../core/charts/options'
import EChart from './materials/EChart.vue'
import CustomSandbox from './materials/CustomSandbox.vue'

const props = defineProps<{ item: DashboardItem }>()

const dash = useDashboardStore()
const renderError = ref('')

const theme = computed(() => dash.theme)
const option = computed(() => {
  renderError.value = ''
  try {
    return buildChartOption(props.item, theme.value)
  } catch (e) {
    renderError.value = e instanceof Error ? e.message : String(e)
    return null
  }
})

const kpi = computed(() => {
  const d = props.item.data as Dataset | undefined
  if (!d) return null
  const value = d.value ?? d.series[0]?.values[0] ?? 0
  const unit = props.item.dataConfig?.unit ?? ''
  return { value, unit, trend: d.trend ?? 0 }
})

const table = computed(() => props.item.data as TableData | undefined)

function onRenderError(message: string) {
  renderError.value = message
  dash.pushError({ itemId: props.item.id, itemTitle: props.item.title, message })
}
</script>

<template>
  <div class="comp" :style="{ background: dash.theme.panel, color: dash.theme.textColor }">
    <div class="comp-title">
      <span class="bar" :style="{ background: dash.theme.primary }" />
      {{ item.title }}
    </div>

    <div class="comp-body">
      <template v-if="item.type === 'chart'">
        <div v-if="renderError" class="comp-error">渲染出错：{{ renderError }}</div>
        <EChart v-else :option="option" :primary="dash.theme.primary" @render-error="onRenderError" />
      </template>

      <div v-else-if="item.type === 'kpi' && kpi" class="kpi">
        <div class="kpi-value" :style="{ color: dash.theme.primary }">
          {{ Number(kpi.value).toLocaleString() }}
          <span class="kpi-unit">{{ kpi.unit }}</span>
        </div>
        <div class="kpi-trend" :class="kpi.trend >= 0 ? 'up' : 'down'">
          环比 {{ kpi.trend >= 0 ? '▲' : '▼' }} {{ Math.abs(kpi.trend) }}%
        </div>
      </div>

      <div v-else-if="item.type === 'table' && table" class="table-wrap">
        <table>
          <thead>
            <tr>
              <th v-for="c in table.columns" :key="c">{{ c }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, ri) in table.rows" :key="ri">
              <td v-for="(cell, ci) in row" :key="ci">{{ cell }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else-if="item.type === 'text'" class="text-body">{{ item.text }}</div>

      <template v-else-if="item.type === 'custom'">
        <div v-if="renderError" class="comp-error">沙箱渲染出错：{{ renderError }}</div>
        <CustomSandbox
          v-else
          :code="item.code ?? ''"
          :data="item.data"
          :theme="dash.theme"
          :item-id="item.id"
          @render-error="onRenderError"
        />
      </template>
    </div>
  </div>
</template>

<style scoped>
.comp {
  display: flex;
  flex-direction: column;
  height: 100%;
  border-radius: 8px;
}

.comp-title {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px 5px;
  font-size: 12px;
  font-weight: 600;
  opacity: 0.9;
  flex-shrink: 0;
}

.bar {
  width: 3px;
  height: 12px;
  border-radius: 2px;
}

.comp-body {
  flex: 1;
  min-height: 0;
  padding: 0 8px 8px;
}

.comp-error {
  color: #ff8f8f;
  font-size: 11px;
  padding: 10px;
}

.kpi {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.kpi-value {
  font-size: 30px;
  font-weight: 700;
  font-family: 'DIN Alternate', 'Consolas', monospace;
}

.kpi-unit {
  font-size: 12px;
  font-weight: 400;
  margin-left: 2px;
}

.kpi-trend {
  font-size: 11px;
}

.kpi-trend.up {
  color: #ff7a7a;
}

.kpi-trend.down {
  color: #5adba0;
}

.table-wrap {
  height: 100%;
  overflow: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}

th,
td {
  padding: 5px 8px;
  text-align: left;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  white-space: nowrap;
}

th {
  color: rgba(220, 228, 255, 0.55);
  font-weight: 500;
  position: sticky;
  top: 0;
  background: inherit;
}

.text-body {
  font-size: 12px;
  line-height: 1.7;
  opacity: 0.8;
  padding: 4px 2px;
  overflow: auto;
}
</style>
