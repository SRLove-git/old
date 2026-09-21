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
- `POST /api/orders/:id/ship`（管理员）订单发货：`{ carrier, trackingNo, note }` 快递发货，
  `{ deliveryType: 'self' }` 表示无需物流（线下交付/自提）；待收货阶段传 `{ update: true, ... }` 只改物流信息。
  发货会写入 `carrier / trackingNo / shipTime / shippingNote` 并把状态推进到「待收货」
- `GET/POST /api/manager-applications`，`POST /api/manager-applications/:id/{approve,reject}` 主理人审核
- `GET /api/managers`，`POST /api/managers/:id/status` 主理人管理（冻结/清退）
- `GET /api/customers`、`GET /api/bindings`、`POST /api/bindings/{unbind,rebind}` 客户归属
- `GET /api/commissions`、`POST /api/commissions/settle`、`POST /api/commissions/:id/adjust` 佣金
- `GET /api/commission-settlements` 结算流水（可按 `?managerId=` 过滤）
- `GET /api/withdraws`、`POST /api/withdraws`、`POST /api/withdraws/:id/{approve,reject}` 提现
- `GET/PUT /api/config` 全局分佣比例等配置
- `GET/POST/PUT/DELETE /api/lives` 私域直播（`GET` 可选 `?userId=` 过滤该用户可见的私域直播）
- `GET /api/stats/dashboard` 数据看板

修改类接口需要 `x-admin-token: admin-token` 请求头。以下读接口同样需要管理员令牌：
`GET /api/coupons`（含入会赠送券等归属个人券，小程序改从 `/api/users/:id` 取自己的券）、
`GET /api/commissions`、`GET /api/withdraws`、`GET /api/commission-settlements`、`GET /api/manager-applications`。

## 佣金与提现口径

- **主理人身份**：主理人记录用 `userId` 绑定平台会员账号。`GET /api/managers/:id/dashboard` 必须带 `?userId=`
  且只允许本人查看（管理员带 `x-admin-token` 可查看任意主理人）；申请通过时自动绑定申请人账号，
  清退（status 3）后立即失去工作台权限。
- **申请资料校验**：手机号先规范化（去掉空格/短横线/`+86` 前缀）再校验 11 位。
  账号已有有效手机号时必须与账号一致（错误信息里带回脱敏号码）；账号手机号缺失或不完整时，
  允许申请人补填并回写账号；账号没有会员档案时按申请信息自动补建，避免申请流程卡死。
- **退款流程**：`POST /api/orders/:id/refund` 是用户申请，默认只把订单置为「退款中」
  （记录 `refundReason / refundAmount / refundApplyTime / refundPrevStatus`），不动钱、不扣佣金、不释放名额；
  运营在后台 `POST /api/orders/:id/refund-audit` 同意后才真正退款（释放名额、按规则退券、按比例扣回佣金、写 `refundTime`），
  拒绝则退回申请前的状态并记录 `refundRejected`。`config.refundNeedAudit = false` 时恢复为即时退款。
- **公开接口不暴露钱**：`GET /api/managers` 对外只返回店铺信息（无 `available / pending / settled / totalCommission`），
  带管理员 Token 才返回完整账本；主理人工作台只对本人开放，非主理人进入小程序会看到「暂无主理人工作台」。
- **余额只认佣金单**：`available / pending / withdrawing / settled / total` 全部由 `commissions` 实时汇总，
  `managers` 表里的同名字段只是缓存值，服务启动时会自动重算，后台排行榜与数据看板使用同一口径。
- **提现申请服务端校验**：金额必须大于 0、不低于 `config.minWithdraw`、不超过可结算余额，
  且按 `applyTime` 统计当月次数不超过 `config.withdrawMonthlyLimit`；任一条件不满足返回 400。
- **只锁定申请金额**：提现单按时间顺序锁定等额的可结算佣金；跨越边界时把该佣金单拆成「提现中」与「可结算」两张，
  不会把主理人名下全部可结算佣金一次性锁死。提现单记录 `commissionIds / commissionCount` 便于对账。
- **打款与拒绝**：`approve` 只把该提现单锁定的佣金标记为「已结算」并写入 `settleTime`，重复打款会被拒绝；
  `reject` 把锁定佣金释放回「可结算」。
- **退款扣回**：退款时按退款比例冲减佣金。
  「待结算 / 可结算」直接扣减；「提现中」同步下调提现单金额与税费（金额归零则自动撤销提现单）；
  「已结算」（已打款）会生成一张负向「待结算」佣金单作为负债，抵扣后续佣金，工作台 `balance.debt` 可见。
- **结算粒度**：`POST /api/commissions/settle` 支持 `{ managerId, orderId, ids, from, to }`
  按主理人 / 订单 / 指定佣金单 / 时间区间结算，每次结算写入 `settlementRecords` 结算流水。
- **课程购课进入分佣**：`POST /api/lives/:id/purchase` 除了发计次卡，还会生成课程订单（`source: 'live'`）
  并按主理人比例生成佣金单，课程销售不再游离在佣金体系之外。
