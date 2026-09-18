# 岁悦里俱乐部 · 后端 API

基于 Node.js + Express，数据用 `data.json` 持久化（首次运行自动用 `src/seed.js` 种子数据生成）。

## 启动

```bash
cd server
npm install
npm start        # 或 npm run dev（文件变化自动重启）
```

默认地址：`http://127.0.0.1:3000`

管理员 Token：`admin-token`（通过请求头 `x-admin-token` 传递）

## 主要接口

- `GET /api/home` 首页数据（Banner、分类、活动、配置）
- `GET/POST/PUT/DELETE /api/activities` 活动/商品管理
- `GET/POST /api/orders`，`POST /api/orders/:id/{pay,cancel,refund,advance,review}` 订单
- `GET/POST /api/manager-applications`，`POST /api/manager-applications/:id/{approve,reject}` 主理人审核
- `GET /api/managers`，`POST /api/managers/:id/status` 主理人管理（冻结/清退）
- `GET /api/customers`、`GET /api/bindings`、`POST /api/bindings/{unbind,rebind}` 客户归属
- `GET /api/commissions`，`POST /api/commissions/settle`，`POST /api/commissions/:id/adjust` 佣金
- `GET /api/withdraws`，`POST /api/withdraws`，`POST /api/withdraws/:id/{approve,reject}` 提现
- `GET/PUT /api/config` 全局分佣比例等配置
- `GET /api/stats/dashboard` 数据看板

修改类接口需要 `x-admin-token: admin-token` 请求头。
