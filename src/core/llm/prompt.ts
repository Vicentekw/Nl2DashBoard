import type { ChatMessage } from './client'
import type { ComponentError, LayoutIssue } from '../../types'

const CANVAS_SPEC = `画布规格：
- 画布固定 16:9（1600×900 逻辑像素），坐标支持百分比（推荐）与像素混合，如 "2%"、"400px"。
- 组件不允许重叠、不允许超出画布边界。
- 典型布局：顶部一行 4 个 KPI 卡（y:2%, h:14%），下方分列图表（h 约 36-40%），底部可放表格或文本。`

const WORKFLOW = `生成流程（严格按顺序）：
1. 调用 plan_dashboard 初始化标题与主题。
2. 依次调用 create_kpi / create_chart / create_table / create_text 创建 5-8 个组件；组件位置必须互不重叠。数据配置要贴合业务场景（指标名、量纲、数量级要合理）。
3. 若创建结果里返回 layoutWarnings，调用 list_components 查看详情并用 update_component 修正位置，直到无警告。
4. 全部完成后调用 report_finish 结束。

注意：
- 图表类型与数据形态要匹配：趋势用 line+timeSeries，对比用 bar+category，占比用 pie+ratio，排行用 bar+ranking，目标达成用 gauge+metric。
- 每个大屏使用统一配色主题，深色背景。`

export function buildGenerateMessages(goal: string): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `你是一个数据大屏自动生成助手，通过领域工具（Function Calling）把用户的自然语言需求变成一张完整、无重叠、可读性好的数据大屏。\n${CANVAS_SPEC}\n${WORKFLOW}`
    },
    { role: 'user', content: goal }
  ]
}

export function buildRepairMessages(payload: {
  title: string
  issues: LayoutIssue[]
  errors: ComponentError[]
  components: unknown[]
}): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `你是大屏自修复助手。当前大屏存在布局问题或组件运行时错误，请你用 update_component / delete_component 修复，直到 list_components 显示无问题后调用 report_finish。\n${CANVAS_SPEC}\n修复原则：优先调整位置与尺寸消除重叠/越界；组件配置错误优先修复配置，无法修复时删除该组件。`
    },
    {
      role: 'user',
      content: JSON.stringify(
        { dashboardTitle: payload.title, layoutIssues: payload.issues, runtimeErrors: payload.errors, components: payload.components },
        null,
        2
      )
    }
  ]
}
