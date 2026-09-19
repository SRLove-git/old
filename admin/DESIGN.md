# 岁悦里俱乐部 · 运营后台 Arco Design 设计规范

> 适用对象：运营后台（admin）。技术栈：Vue 3 + Vite + Arco Design Vue（`@arco-design/web-vue`）。
> 本文是设计规范与落地约定，工程内已按此实现。主色通过覆盖 Arco 品牌色阶完成，组件统一使用 `a-*` 语义组件，不写死业务色。

## 1. 目标与适用范围

运营后台面向内部运营、客服、财务、主理人管理员等角色，核心诉求：

1. **清晰**：信息密度高，但层级清楚，一眼定位关键数字与待办。
2. **一致**：全站共用同一套 Arco 色彩、排版、间距、组件，不出现“一页一个风格”。
3. **可操作**：主操作（审核、退款、改归属、导出等）显式、可撤销、可追溯。
4. **可追溯**：资金、归属、审核类操作均落到“操作日志”。

桌面优先的密集数据工具，整体以**中性表面 + 暖陶土棕主色**为主，避免大面积高饱和色干扰数据阅读。

## 2. 主题定制

品牌种子色沿用小程序主色 `#C25E3D`（暖陶土棕）。Arco 的 `--primary-*` 与 `--link-*` 均映射到 `--arcoblue-*`，因此只需在 `src/style.css` 中覆盖 `--arcoblue-1..10`，即可让主按钮、选中态、链接、菜单高亮等全部切到品牌色：

| 色阶 | RGB | 用途 |
| --- | --- | --- |
| `--arcoblue-1` | `253, 233, 223` | 最浅容器 / 选中项浅底 |
| `--arcoblue-2` | `248, 214, 200` | 浅容器 hover |
| `--arcoblue-3` | `240, 187, 166` | 浅描边 / 弱强调 |
| `--arcoblue-4` | `222, 149, 123` | 次级强调 |
| `--arcoblue-5` | `208, 112, 82` | 主色 hover |
| `--arcoblue-6` | `194, 94, 61` | 主色（按钮 / 链接 / 选中） |
| `--arcoblue-7` | `166, 76, 47` | 主色 active |
| `--arcoblue-8..10` | 深棕阶 | 深色场景扩展 |

状态语义色沿用 Arco 默认（`green` 成功、`orange` 待处理、`red` 危险、`gray` 中性），不额外定义十六进制业务色。

## 3. 组件落地约定

后台为单文件 `src/App.vue`，通过 `app.use(ArcoVue)` 全量注册组件。整体布局：

```text
Layout
├─ LayoutSider（可折叠，宽度 240 / 折叠 64，lg 断点自动收起）
│   └─ Menu（选中键 = 当前 view）
└─ Layout
    ├─ LayoutHeader（折叠开关 + 页面标题 + 账号）
    └─ LayoutContent（各业务模块）
```

| 业务元素 | Arco 组件 | 说明 |
| --- | --- | --- |
| 侧边导航 | `a-layout-sider` + `a-menu` | 选中态用 `--primary-6`，折叠仅显图标 |
| 顶部栏 | `a-layout-header` | 左侧折叠开关 + 标题 + 右侧头像 |
| 数据看板 | `a-row`/`a-col` + `a-card` + `a-statistic` | 大数字看板 |
| 数据表格 | `a-table` | `slotName` 自定义单元格，`pagination=false` 全量展示 |
| 状态标签 | `a-tag` | 用 `color` 语义色 + 文字，不只靠颜色区分 |
| 按钮 | `a-button` | `primary` 主操作、默认/`outline` 次要、`text` 表格内操作、`status="danger"` 危险 |
| 搜索/筛选 | `a-input-search` + `a-select` | 工具栏统一规格 |
| 表单 | `a-form` + `a-form-item` + `a-input`/`a-input-number`/`a-select`/`a-textarea` | 弹窗与规则配置 |
| 弹窗 | `a-modal` | 新建/编辑、改归属、调佣、分类/Banner/优惠券 |
| 反馈 | `Message` / `Modal.confirm` | 成功/失败提示，破坏性操作二次确认 |
| 加载 | `a-spin` | 页面切换加载态 |
| 错误 | `a-alert` | 顶部可关闭错误条 |

## 4. 状态语义映射（业务标签）

用 `a-tag` 的颜色名表达状态，同时保留文字：

| 业务状态 | Arco 颜色 |
| --- | --- |
| 通过 / 已完成 / 已结算 / 已核销 / 上架 | `green` |
| 待付款 / 待审核 / 待处理 / 已冻结 | `orange` |
| 退款中 / 驳回 / 拒绝 | `red` |
| 已取消 / 已退款 / 已解绑 / 已清退 | `gray` |
| 分类 / 操作日志 | `arcoblue` |

## 5. 交互约定

- 破坏性操作（删除、清退、退款、一键转结算）统一 `Modal.confirm` 二次确认，主按钮使用 `status="danger"`。
- 需要输入原因的拒绝/解绑，用 `a-modal` + `a-input` 收集，替代浏览器原生 `prompt`。
- 操作成功后 `Message.success`，失败 `Message.error`，页面级错误用顶部 `a-alert`。
- 金额、数量等对齐列使用 `.num`（`font-variant-numeric: tabular-nums`）等宽数字。
- 键盘可聚焦元素保留 Arco 默认焦点态，图标按钮带 `aria-label`。

## 6. 已知边界

- 当前为全量引入 Arco，产物体积较大（含全组件库与样式）。如后续关注加载性能，可改用 `unplugin-vue-components` 按需引入。
- 界面以桌面为主，`lg` 断点下侧边栏自动折叠，未做移动端抽屉式导航。
