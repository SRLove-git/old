# 岁悦里俱乐部 · 开发规范

本文档是仓库统一的代码结构与规范约定。核心原则：**页面只做渲染与交互，API 调用进服务层，业务规则进 store/service 层**。

## 目录结构

```text
old/
├── miniprogram/            # 原生微信小程序（用户端 + 主理人端）
│   ├── pages/              # 页面，一页一目录（四件套同名）
│   ├── components/         # 跨页面组件，一组件一目录
│   ├── services/           # API 封装：只负责请求，不读写缓存
│   ├── store/              # 客户端缓存与业务编排
│   └── utils/              # 纯工具（request、config、store-helpers、qrcode、region）
│
├── admin/                  # Vue 3 + Vite + Arco 运营后台
│   └── src/
│       ├── views/          # 按菜单拆分的视图（异步加载）
│       ├── utils/          # presentation、regions 等纯工具
│       ├── api.js          # HTTP 客户端（token、错误处理）
│       ├── navigation.js   # 菜单配置
│       ├── options.js      # 下拉选项常量
│       ├── config-model.js # 配置编辑/存储模型
│       └── App.vue         # 外壳：登录、侧边栏、视图切换
│
├── merchant/               # Vue 3 + Vite 商家端
│   └── src/                # App.vue + api.js
│
├── server/                 # Node + Express 后端
│   ├── src/
│   │   ├── index.js        # 启动与路由挂载
│   │   ├── store.js        # 数据访问与业务逻辑（待拆分，见下方路线图）
│   │   ├── lib/            # 纯函数与基础设施（session、uploads、退款、微信支付、快递鸟等）
│   │   ├── middleware/     # 鉴权、请求体解析
│   │   ├── routes/         # 按领域拆分的路由
│   │   ├── services/       # 定时任务与外部服务（物流、支付）
│   │   └── seed.js
│   ├── test/               # node --test 单测（`npm test`）
│   └── .env.example        # 环境变量模板（.env 本地保留、不入库）
│
├── .deploy/                # 部署脚本与 nginx 配置
├── docs/                   # 规范与文档
├── eslint.config.mjs
├── .editorconfig
├── jsconfig.json
└── package.json            # 根目录：lint 脚本
```

## 分层职责

- 小程序 `pages/`：只做渲染与交互，业务调用 `utils/store.js`（兼容入口，实现见 `store/`）。
- 小程序 `services/`：原始 HTTP 调用，返回接口数据，不读写本地缓存。
- 小程序 `store/`：缓存、派生数据与业务编排（含支付轮询、余额充值等）。
- 后端 `routes/`：参数解析、鉴权挂载，调用 `store.js`，不写业务规则。
- 后端 `store.js`：数据读写与业务规则（订单、佣金、提现、退款、账号、直播等）。
- 后端 `lib/`：无状态的纯函数与外部集成，`test/` 里已有对应单测。
- 运营后台 `views/`：按菜单拆分，通过 props/emits 与 `App.vue` 交互。

## 命名

- 目录与路由用 kebab-case：`live-room`、`/api/point-orders`、`/api/provider-applications`。
- 小程序页面四件套同名：`detail.js / detail.wxml / detail.wxss / detail.json`。
- 函数与变量 camelCase，常量 UPPER_SNAKE_CASE，Vue 组件 PascalCase。
- 后端 lib 文件按职责命名：`refund-policy.js`、`wechat-pay.js`、`json-file-store.js`。

## 规模红线

- 单个 JS 文件尽量不超过 300 行，Vue SFC 不超过 500 行，函数不超过 50 行。
- 超出时按领域继续拆分；后端新逻辑优先下沉到 `lib/` 或独立 `routes/`，避免继续膨胀 `store.js`。

## 接口约定

- 统一响应结构 `{ code, message, data }`；HTTP 状态码表达语义，`code` 表达业务错误。
- 管理接口需要 `x-admin-token`；会员接口用 `Authorization: Bearer <token>`。
- 错误统一抛 `httpError(status, message)`，由 `wrap` 中间件转 JSON。
- 新增接口后同步更新 `server/README.md` 的接口清单，并尽量补 `server/test/` 单测。

## 配置与密钥

- 密钥只写在 `server/.env`（已 gitignore），模板见 `server/.env.example`。
- 微信支付证书放在 `server/secrets/`（已 gitignore），路径通过环境变量注入。
- `WECHAT_APP_SECRET`、`WECHAT_PAY_API_V3_KEY` 等一旦泄露，应立即在微信平台重置。

## 工具链

```bash
npm install          # 根目录安装 ESLint
npm run lint         # 全仓库 ESLint 检查
npm run lint:fix     # 自动修复可修复项
```

各应用独立运行与构建：

```bash
cd server && npm test && npm start      # 后端（默认 http://127.0.0.1:3000）
cd admin && npm run build               # 运营后台
cd merchant && npm run build            # 商家端
```

## Git 规范

- 提交信息使用 Conventional Commits：`feat: / fix: / refactor: / chore:`。
- 新功能分支前缀 `codex/`。
- 不提交 `node_modules/`、`dist/`、`server/data.json`、任何 `.env`、`server/secrets/`。

## 已知超大文件与拆分路线（待办）

以下文件体量过大，是后续拆分的重点，建议按顺序推进并在每步后跑通测试/构建：

1. `server/src/store.js`（约 4200 行）：按领域拆成 `store/` 模块（orders、finance、managers、catalog、users、lives、points、accounts），保留 `store.js` 作为统一出口以兼容 `routes/` 的现有导入。
2. `admin/src/App.vue`（约 4800 行）：继续把剩余内联 `<section v-if>` 视图与共享弹窗抽到 `views/` 与独立组件，`App.vue` 只保留登录、侧边栏与视图调度。
3. 为拆分出的后端领域模块补 `server/test/` 单测，避免纯靠接口冒烟兜底。
