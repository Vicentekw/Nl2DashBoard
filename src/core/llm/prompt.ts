import type { ChatMessage } from './client'
import type { ComponentError, LayoutIssue } from '../../types'

const CUSTOM_COMPONENT_DOC = `自定义组件（create_custom_component）：
- 当标准物料无法表达需求时使用（特殊图形、组合可视化、创意排版）。
- code 是渲染函数源码，必须以 function render(ctx) {...} 形式定义，同步完成渲染。
- ctx 参数：el（已挂载的 DOM 容器）、echarts（完整 echarts 库）、data（由 dataConfig 生成的数据集）、theme（主题色对象）。
- 典型写法：var chart = ctx.echarts.init(ctx.el); chart.setOption({...})。
- 禁止使用 fetch / XMLHttpRequest / localStorage / document.cookie / import / eval。
- 渲染报错会进入自动修复流程，请保证代码健壮（判空、缺省值）。`

const CANVAS_SPEC = `画布规格：
- 画布固定 16:9（1600×900 逻辑像素），坐标支持百分比（推荐）与像素混合，如 "2%"、"400px"。
- 组件不允许重叠、不允许超出画布边界。
- 典型布局：顶部一行 4 个 KPI 卡（y:2%, h:14%），下方分列图表（h 约 36-40%），底部可放表格或文本。`

const WORKFLOW = `生成流程（严格按顺序）：
1. 调用 plan_dashboard 初始化标题与主题。
2. 依次调用 create_kpi / create_chart / create_table / create_text / create_custom_component 创建 5-8 个组件；组件位置必须互不重叠。
3. 若创建结果里返回 layoutWarnings，调用 list_components 查看详情并用 update_component 修正位置，直到无警告。
4. 全部完成后调用 report_finish 结束。

注意：
- 图表类型与数据形态要匹配：趋势用 line+timeSeries，对比用 bar+category，占比用 pie+ratio，排行用 bar+ranking，目标达成用 gauge+metric。
- 每个大屏使用统一配色主题，深色背景。
${CUSTOM_COMPONENT_DOC}`

const MODIFY_WORKFLOW = `当前画布上已有一张大屏，用户会以对话方式提出修改需求。规则：
1. 严禁调用 plan_dashboard（会清空整个画布），除非用户明确要求"重新生成/重做"。
2. 先调用 list_components 了解现有组件，再做修改。
3. 修改已有组件用 update_component；删除用 delete_component；新增用 create_kpi / create_chart / create_table / create_text / create_custom_component。
4. 涉及位置的修改要保证不重叠、不越界；若返回 layoutWarnings，继续修正。
5. 全部完成后调用 report_finish 结束。
${CUSTOM_COMPONENT_DOC}`

export function buildGenerateMessages(goal: string, hasItems: boolean): ChatMessage[] {
  return [
    {
      role: 'system',
      content: hasItems
        ? `你是一个数据大屏智能编辑助手，通过领域工具（Function Calling）以多轮对话方式持续修改一张已有大屏。\n${CANVAS_SPEC}\n${MODIFY_WORKFLOW}`
        : `你是一个数据大屏自动生成助手，通过领域工具（Function Calling）把用户的自然语言需求变成一张完整、无重叠、可读性好的数据大屏。\n${CANVAS_SPEC}\n${WORKFLOW}`
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
      content: `你是大屏自修复助手。当前大屏存在布局问题或组件运行时错误，请你用 update_component / delete_component 修复，直到 list_components 显示无问题后调用 report_finish。\n${CANVAS_SPEC}\n修复原则：优先调整位置与尺寸消除重叠/越界；组件配置错误优先修复配置；自定义组件渲染报错时修复其 code（仍需满足 function render(ctx) 约定）；无法修复时删除该组件。`
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
