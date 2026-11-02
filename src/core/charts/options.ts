import type { ChartType, DashboardItem, DashboardTheme, Dataset } from '../../types'

/** 根据图表类型与数据集构建 ECharts option（深色大屏风格） */
export function buildChartOption(item: DashboardItem, theme: DashboardTheme): Record<string, unknown> | null {
  if (item.type !== 'chart') return null
  const data = item.data as Dataset | undefined
  if (!data) return null
  const type = (item.chartType ?? 'bar') as ChartType
  const seriesName = data.series[0]?.name ?? item.title
  const values = data.series[0]?.values ?? []
  const unit = item.dataConfig?.unit ?? ''

  const axisText = { color: theme.textColor, fontSize: 11 }
  const splitLine = { lineStyle: { color: 'rgba(255,255,255,0.08)' } }
  const tooltip = {
    trigger: type === 'pie' ? 'item' : 'axis',
    backgroundColor: 'rgba(10,16,40,0.92)',
    borderColor: 'rgba(255,255,255,0.15)',
    textStyle: { color: theme.textColor, fontSize: 12 }
  }

  if (type === 'pie') {
    return {
      backgroundColor: 'transparent',
      tooltip,
      legend: { bottom: 0, textStyle: axisText, itemWidth: 10, itemHeight: 10 },
      series: [
        {
          name: seriesName,
          type: 'pie',
          radius: ['42%', '68%'],
          center: ['50%', '46%'],
          label: { color: theme.textColor, fontSize: 11, formatter: '{b}\n{d}%' },
          data: data.labels.map((label, i) => ({ name: label, value: values[i] }))
        }
      ]
    }
  }

  if (type === 'gauge') {
    const value = Number(data.value ?? values[0] ?? 0)
    const max = item.dataConfig?.max ?? 100
    return {
      backgroundColor: 'transparent',
      tooltip,
      series: [
        {
          type: 'gauge',
          min: 0,
          max,
          startAngle: 210,
          endAngle: -30,
          progress: { show: true, width: 12, itemStyle: { color: theme.primary } },
          axisLine: { lineStyle: { width: 12, color: [[1, 'rgba(255,255,255,0.1)']] } },
          axisTick: { show: false },
          splitLine: { length: 6, lineStyle: { color: 'rgba(255,255,255,0.25)' } },
          axisLabel: { color: theme.textColor, fontSize: 9, distance: 14 },
          pointer: { itemStyle: { color: theme.primary } },
          detail: {
            valueAnimation: true,
            formatter: `{value}${unit}`,
            color: theme.textColor,
            fontSize: 20,
            offsetCenter: [0, '62%']
          },
          data: [{ value }]
        }
      ]
    }
  }

  const isScatter = type === 'scatter'
  return {
    backgroundColor: 'transparent',
    tooltip,
    grid: { left: 8, right: 12, top: 28, bottom: 4, containLabel: true },
    ...(isScatter
      ? {}
      : {
          xAxis: { type: 'category', data: data.labels, axisLabel: axisText, axisLine: { lineStyle: { color: 'rgba(255,255,255,0.2)' } } },
          yAxis: { type: 'value', axisLabel: axisText, splitLine }
        }),
    ...(isScatter
      ? {
          xAxis: { type: 'value', axisLabel: axisText, splitLine },
          yAxis: { type: 'value', axisLabel: axisText, splitLine }
        }
      : {}),
    series: [
      {
        name: seriesName,
        type: isScatter ? 'scatter' : type,
        data: isScatter
          ? values.map((v, i) => [data.labels[i] ? Number(data.labels[i]) || i : i, v])
          : values,
        barMaxWidth: 22,
        smooth: true,
        showSymbol: values.length <= 20,
        symbolSize: 8,
        lineStyle: { width: 2, color: theme.primary },
        itemStyle: { color: type === 'bar' ? buildGradient(theme) : theme.primary },
        areaStyle: type === 'line' ? { color: 'rgba(54,207,201,0.12)' } : undefined
      }
    ],
    ...(type === 'radar'
      ? {
          radar: {
            indicator: data.labels.map((label) => ({ name: label, max: Math.max(...values, 1) * 1.2 })),
            axisName: { color: theme.textColor, fontSize: 11 },
            splitLine: { lineStyle: { color: 'rgba(255,255,255,0.12)' } },
            splitArea: { show: false }
          }
        }
      : {})
  }
}

function buildGradient(theme: DashboardTheme) {
  return {
    type: 'linear' as const,
    x: 0,
    y: 0,
    x2: 0,
    y2: 1,
    colorStops: [
      { offset: 0, color: theme.primary },
      { offset: 1, color: theme.accent }
    ]
  }
}
