# 岁悦里俱乐部 · 运营后台 Material Design 3 设计规范

> 适用对象：运营后台（admin）。技术栈：Vue 3 + Vite。
> 设计体系：Material Design 3（M3），以动态色彩（Dynamic Color）角色体系组织语义色，而不是写死具体颜色。
> 本文是设计规范，不是实现说明。落地时应把下方色值收敛为 `--md-sys-color-*` 设计令牌，统一供组件消费。

## 1. 目标与适用范围

运营后台面向内部运营、客服、财务、主理人管理员等角色，核心诉求是：

1. **清晰**：信息密度高，但层级清楚，一眼定位关键数字与待办。
2. **系统化**：所有页面共用同一套色彩、排版、间距、组件，不出现“一页一个风格”。
3. **可操作**：主操作（审核、退款、改归属、导出等）必须显式、可撤销、可追溯。
4. **可追溯**：所有资金、归属、审核类操作都落到“操作日志”。

后台是桌面优先的密集数据工具，整体以**中性表面 + 暖棕主色**为主，避免大面积高饱和色干扰数据阅读。

## 2. M3 设计原则落地

| 原则 | 在运营后台中的落地 |
| --- | --- |
| 自然与一致 | 全站统一使用语义色角色（primary / error / surface…），禁止组件内硬编码十六进制色 |
| 层次与重点 | 通过 surface 层级、字重、容器色表达层级，而不是靠更多颜色 |
| 状态可见 | 待办数量、审核状态用容器色 + 标签双重表达，不只靠颜色区分 |
| 无障碍 | 正文对比度 ≥ 4.5:1，交互目标 ≥ 48×48dp，颜色之外必须有文字/图标辅助 |
| 反馈 | 保存、审核、退款、导出等操作必须有 Snackbar / Dialog 反馈 |

## 3. 色彩（Color）

### 3.1 品牌种子色

品牌种子色沿用小程序主色：

- Seed / Primary：`#C25E3D`（暖陶土棕）

> 说明：M3 不直接大面积使用 seed 色，而是把它映射到 `primary` 等角色。落地时如使用 `@material/material-color-utilities`，以 `#C25E3D` 作为 source color 生成完整 tonal palette。

### 3.2 Tonal Palette（参考）

由种子色生成的理论色调阶（供扩展时参考，工程内优先使用下方“角色令牌”）：

| Tone | Hex | Tone | Hex |
| --- | --- | --- | --- |
| 0 | `#000000` | 50 | `#EFAD8E` |
| 10 | `#735142` | 60 | `#FFBB9A` |
| 20 | `#9E715C` | 70 | `#FFC9A5` |
| 25 | `#AF7E67` | 80 | `#FFD5B0` |
| 30 | `#BE8970` | 90 | `#FFE1B9` |
| 40 | `#D89C80` | 100 | `#FFEBC2` |

### 3.3 M3 色彩角色（Light 主题为主）

后台默认 Light 主题。以下为可落地的角色令牌与推荐值：

| 角色 | 推荐值 | 用途 |
| --- | --- | --- |
| `primary` | `#9E4F2F` | 主按钮、选中态、链接、主进度 |
| `on-primary` | `#FFFFFF` | 主色上的文字/图标 |
| `primary-container` | `#FDE9DF` | 强调容器、选中项背景、高亮行 |
| `on-primary-container` | `#3E1D0F` | primary-container 上的文字 |
| `secondary` | `#755846` | 次要强调、辅助图标 |
| `on-secondary` | `#FFFFFF` | secondary 上的文字 |
| `secondary-container` | `#F7E2D6` | 次要容器、空态插画背景 |
| `on-secondary-container` | `#2B1608` | secondary-container 上的文字 |
| `tertiary` | `#6B5D2E` | 图表第三系列、分类辅助色 |
| `on-tertiary` | `#FFFFFF` | tertiary 上的文字 |
| `tertiary-container` | `#F4E1A7` | 第三容器（用于分类标记） |
| `error` | `#BA1A1A` | 删除、退款、驳回、危险操作 |
| `on-error` | `#FFFFFF` | 错误色上的文字 |
| `error-container` | `#FFDAD6` | 错误提示容器、拒绝状态标签底 |
| `on-error-container` | `#410002` | error-container 上的文字 |
| `success`（扩展） | `#2F7D5C` | 通过、已完成、已结算等正向状态 |
| `success-container`（扩展） | `#E7F3EE` | 正向状态标签底 |
| `background` | `#F6F5F3` | 全局背景 |
| `on-background` | `#1D1B16` | 背景上的文字 |
| `surface` | `#F6F5F3` | 页面基础表面 |
| `on-surface` | `#1D1B16` | 表面上的正文文字 |
| `surface-variant` | `#E7E0D8` | 分隔、描边、输入框描边 |
| `on-surface-variant` | `#4A443D` | 次要文字、辅助说明 |
| `outline` | `#85736B` | 边框、分割线 |
| `outline-variant` | `#D5C7BF` | 轻量分割线、表头下边线 |
| `inverse-surface` | `#2F302B` | 深色浮层（如 Snackbar 深色变体） |
| `inverse-on-surface` | `#F2F1ED` | inverse-surface 上的文字 |

### 3.4 状态语义映射（业务标签）

| 业务状态 | 容器色 | 文字色 | 图标色 |
| --- | --- | --- | --- |
| 通过 / 已完成 / 已结算 / 已核销 | `success-container` | `success` | `success` |
| 待付款 / 待审核 / 待处理 | `tertiary-container` | `#5C4E1E` | `tertiary` |
| 退款中 / 驳回 / 拒绝 | `error-container` | `error` | `error` |
| 已取消 / 已退款 / 已解绑 | `surface-variant` | `on-surface-variant` | `outline` |
| 进行中 / 上架中 | `primary-container` | `primary` | `primary` |

规则：**状态不得只靠颜色区分**，标签文字必须同时出现；颜色只做视觉加速。

## 4. 排版（Typography）

后台使用 M3 五类字型角色。中文回退字体优先级：

```text
"PingFang SC", "Microsoft YaHei", "Noto Sans SC", -apple-system, "Helvetica Neue", sans-serif
```

| 角色 | 字号 / 行高 | 字重 | 在后台中的用途 |
| --- | --- | --- | --- |
| `display-large` | 57 / 64 | 400 | 仅大屏空态/品牌页，后台极少用 |
| `display-medium` | 45 / 52 | 400 | 大屏欢迎页标题 |
| `display-small` | 36 / 44 | 400 | 落地页主标题 |
| `headline-large` | 32 / 40 | 400 | 看板大数字标题 |
| `headline-medium` | 28 / 36 | 400 | 页面一级标题（h1） |
| `headline-small` | 24 / 32 | 400 | 弹窗标题 |
| `title-large` | 22 / 28 | 500 | 卡片标题、区块标题 |
| `title-medium` | 16 / 24 | 500 | 表格内主信息、列表项标题 |
| `title-small` | 14 / 20 | 500 | 标签、按钮内强调文字 |
| `body-large` | 16 / 24 | 400 | 详情长文本、说明段落 |
| `body-medium` | 14 / 20 | 400 | 默认正文、表格单元格 |
| `body-small` | 12 / 16 | 400 | 辅助说明、时间戳 |
| `label-large` | 14 / 20 | 500 | 表单字段标签、按钮 |
| `label-medium` | 12 / 16 | 500 | 状态标签、徽标 |
| `label-small` | 11 / 16 | 500 | 分类小标签 |

约束：

- 页面一级标题统一 `headline-medium`；卡片标题统一 `title-large`；表格正文统一 `body-medium`。
- 数字看板的核心数值建议使用 `headline-large` 并搭配 `tabular-nums`（等宽数字），避免数字跳动。
- 金额、数量、时间等对齐列启用等宽数字。

## 5. 形状（Shape）

M3 用形状表达可点性。圆角统一为角色令牌：

| 角色 | 圆角 | 适用范围 |
| --- | --- | --- |
| `none` | 0 | 表格、分割线 |
| `extra-small` | 4dp | 小标签、表格内小控件 |
| `small` | 8dp | 按钮、输入框、下拉、搜索框、chip |
| `medium` | 12dp | 卡片、数据面板、图片缩略图 |
| `large` | 16dp | 大卡片、FAB |
| `extra-large` | 28dp | Dialog、Sheet、大浮层 |

落地建议：按钮/输入框统一 `8dp`，卡片统一 `12dp`，Dialog 统一 `28dp`。

## 6. 表面与阴影（Surface / Elevation）

后台尽量**少用阴影、多用容器色**区分层级。Elevation 语义：

| 级别 | 表面角色 | 应用 |
| --- | --- | --- |
| Level 0 | `background` | 页面背景 |
| Level 1 | `surface` | 顶部栏、搜索栏 |
| Level 1+ | `surface-container-low` | 侧边导航 |
| Level 2 | `surface-container` | 卡片、表格容器 |
| Level 3 | `surface-container-high` | 悬浮筛选面板、下拉浮层 |
| Level 4 | `surface-container-highest` | 选中项、高亮强调 |

补充令牌：

| 角色 | 推荐值 |
| --- | --- |
| `surface-container-lowest` | `#FFFFFF` |
| `surface-container-low` | `#F0EEEA` |
| `surface-container` | `#EAE7E2` |
| `surface-container-high` | `#E4E1DC` |
| `surface-container-highest` | `#DEDBD6` |

阴影仅在浮层（Dialog、下拉、Snackbar）使用，建议值：

- 卡片：`0 1px 2px rgba(29,27,22,.10)`（轻量）
- 浮层/Dialog：`0 6px 20px rgba(29,27,22,.12)`
- 侧边导航无需阴影，用 `surface-container-low` 区分。

## 7. 状态层与交互态（State Layers）

M3 交互态用“状态层透明度”叠加在当前元素上，而不是切换成另一个颜色：

| 状态 | 叠加透明度 |
| --- | --- |
| hover | `8%` on-surface |
| focus | `12%` on-surface |
| pressed | `12%` on-surface |
| dragged | `16%` on-surface |
| disabled | 元素整体降为 `38%` 不透明度 |

所有可点击元素：

- hover 必须有可见反馈（背景状态层）。
- 交互热区最小 `48×48dp`；表格内紧凑操作按钮允许 `36dp` 高度，但需保留足够间距。
- 键盘可聚焦元素必须有 focus 可见轮廓（使用 `outline` 色）。

## 8. 间距与布局（Spacing / Layout）

基准网格 `4dp`。常用刻度：`4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64`。

布局结构：

```text
+--------------------------------------------------------------+
| Top App Bar（页面标题 + 全局搜索 + 当前账号 + 通知）            |
+------------+-------------------------------------------------+
| Navigation | 内容区                                          |
| Drawer     |  卡片 / 表格 / 筛选条 / 分页 / FAB                |
| (240dp)    |                                                 |
+------------+-------------------------------------------------+
```

- 侧边导航宽 `240dp`，折叠态 `64dp`（只显示图标 + 提示）。
- 内容区内边距 `24dp`，卡片内边距 `16–24dp`。
- 表格行高建议 `48dp`，表头行高 `40dp`。
- 区块之间垂直间距 `24dp`，卡片内元素间距 `16dp`。

响应式断点：

| 断点 | 行为 |
| --- | --- |
| < 960px | 侧边导航折叠为抽屉，点击菜单图标展开 |
| ≥ 960px | 侧边导航常驻展开 |
| 表格列宽不足 | 优先隐藏次要列，保留主键 + 状态 + 操作 |

## 9. 组件规范（Components）

### 9.1 按钮（Buttons）

| 变体 | 用途 | 形态 |
| --- | --- | --- |
| Filled（实心） | 页面的主要动作，每屏原则上只有一个 | `primary` 底 / `on-primary` 文字 |
| Tonal（色调） | 次级但重要的动作（如“提交审核”） | `primary-container` 底 / `on-primary-container` 文字 |
| Outlined（描边） | 常规次要动作、编辑、查看 | 透明底 / `primary` 描边与文字 |
| Text（文字） | 轻量操作、表格内操作 | 无底 / `primary` 文字 |
| Danger（危险） | 删除、退款、驳回、解绑 | `error` 底 / `on-error` 文字；危险操作需二次确认 |

高度：`40dp`；圆角 `8dp`；内边距 `0 24dp`；文案用 `label-large`。

### 9.2 导航抽屉（Navigation Drawer）

- 顶部分组标题用 `label-small` + `on-surface-variant`。
- 菜单项高 `48dp`，圆角 `8dp`，选中态用 `primary-container` 容器 + 左侧 `primary` 选中指示条。
- 带待办数量的菜单项右侧显示 `Badge`（用 `error` 底、`on-error` 文字）。
- 底部分区放置“帮助 / 设置 / 退出”。

### 9.3 数据表格（Data Table）

- 表头：`surface-variant` 底、`on-surface-variant` 文字、`label-medium`。
- 行高 `48dp`，行 hover 显示 `8%` 状态层，选中行用 `primary-container`。
- 分隔线用 `outline-variant`，不用深色边框。
- 状态列统一使用 9.7 的状态标签，不直接用彩色文字。
- 操作列使用 Text 按钮；危险操作单独使用 Danger 色。
- 金额、数量、日期右对齐并启用等宽数字。
- 空态：图标 + `title-medium` 说明 + 一个主操作按钮。

### 9.4 卡片（Cards）

- 圆角 `12dp`，`surface` 底，轻量阴影。
- 看板统计卡：大数值（`headline-large`）+ 标签（`label-medium`）+ 趋势图标。
- 卡片标题 `title-large`，正文 `body-medium`，辅助信息 `body-small`。

### 9.5 对话框（Dialogs）

- 圆角 `28dp`，宽建议 `360–560dp`，`surface-container` 底。
- 标题 `headline-small`，正文 `body-medium`。
- 动作按钮右对齐：次要（Text/Outlined）在左，主要（Filled）在右。
- 危险确认对话框主按钮使用 Danger 色，并在正文明确说明影响范围。

### 9.6 Snackbar / 提示

- 操作成功后：底部居中 Snackbar，`inverse-surface` 底、`inverse-on-surface` 文字。
- 支持一个内联动作（如“撤销”）。
- 错误提示优先使用表单内联错误（`error` 文字 + `error-container` 边框），不打断流程。

### 9.7 状态标签（Chips / Status）

- 用 3.4 的状态语义映射（容器色 + 文字色）。
- 圆角 `8dp`，高度 `24dp`，内边距 `0 10dp`，文案 `label-medium`。
- 可筛选的筛选条使用 Input Chip，选中态 `secondary-container`。

### 9.8 表单控件（Search / Select / Input）

- 搜索框：`40dp` 高、`8dp` 圆角、`surface` 底、`outline` 描边、前置搜索图标。
- 下拉选择：与搜索框同规格；展开面板用 `surface-container-high` + 阴影。
- 输入框：默认 `outline` 描边，聚焦 `primary` 描边 + `2dp`，错误态 `error` 描边。
- 表单标签用 `label-large`，必填项在标签后加 `error` 星号。

### 9.9 FAB（浮动操作按钮）

- 每页仅一个，承载“新建”类主操作（如“新建活动”“新建优惠券”“新建 Banner”）。
- 圆角 `16dp`，`primary-container` 底、`on-primary-container` 图标，`56dp`。
- 位置固定右下角，避免遮挡表格操作列。

## 10. 动效（Motion）

- 页面切换 / 弹窗出现使用淡入 + 轻微上移，时长 `200–300ms`，标准缓动。
- 列表加载使用骨架屏，不闪白。
- 删除/驳回等破坏性动作可用轻微回弹反馈，避免过度动效。
- 所有动效尊重“减少动态效果”系统设置。

## 11. 无障碍（Accessibility）

- 正文文字与背景对比度 ≥ `4.5:1`，大文字 ≥ `3:1`。
- 状态、成功/失败不得只靠颜色，必须同时有文字或图标。
- 所有图标按钮必须有可读文本（`aria-label`）。
- 表格、弹窗支持键盘导航与焦点管理。
- 表单错误提示与控件建立明确关联。

## 12. 模块到 M3 规范的映射

| 模块 | 主布局 | 关键组件 | 重点交互态 |
| --- | --- | --- | --- |
| 数据看板 | 统计卡 + 图表卡 | Card、Data Table、Chip | 大数字 + 状态分布 + 排行表 |
| 活动管理 | 筛选条 + 表格 + FAB | FAB、Table、Dialog、Search、Select | 新建/编辑/删除（Danger） |
| 订单/退款 | 搜索 + 表格 + 导出 | Table、Snackbar、Danger 按钮 | 退款/恢复需二次确认 |
| 用户管理 | 搜索 + 表格 | Table、Dialog、Danger 按钮 | 编辑/改归属/解绑 |
| 优惠券管理 | 表格 + FAB | FAB、Table、Dialog | 新建/删除 |
| 评价管理 | 表格 | Table、状态 Chip、Danger 按钮 | 查看/删除 |
| Banner 管理 | 卡片 + FAB | Card、FAB、Dialog | 预览/编辑/删除 |
| 主理人审核 | 审核表格 | Table、Chip、Tonal 按钮 | 通过/驳回 |
| 主理人管理 | 表格 | Table、Chip | 邀请码、业绩、佣金、状态 |
| 归属管理 | 表格 | Table、Dialog、Danger 按钮 | 改归属/解绑 |
| 佣金管理 | 表格 + 导出 | Table、Chip、Dialog | 调整比例、结算 |
| 提现审核 | 审核表格 | Table、Chip、Tonal/Danger 按钮 | 通过/驳回 |
| 操作日志 | 时间线 + 表格 | Table、Chip、Search | 筛选、详情 |
| 规则配置 | 表单卡片 | Card、Input、Select、Snackbar | 保存配置 |

## 13. 落地优先级（建议）

1. **设计令牌**：把第 3 章色值 + 第 4 章字体 + 第 5 章圆角收敛为 CSS 变量 `--md-sys-color-*`。
2. **基础组件**：Button、Card、Table、Chip、Dialog、Snackbar、Input/Select/Search。
3. **框架层**：Navigation Drawer、Top App Bar、响应式断点。
4. **业务模块**：按第 12 章映射，逐个替换现有硬编码颜色与间距。
5. **无障碍与动效**：全量补 `aria-label`、焦点态、状态文字，收敛动效时长。

> 注意：当前 admin 代码仍为自定义样式（`#C25E3D` 主色、`#f5f6f8` 背景、`12px` 卡片圆角）。本规范是迁移目标，只有在明确要求“按 Material Design 重做/迁移后台 UI”时才进行代码改动。
