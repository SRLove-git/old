# 岁悦里俱乐部 · 后端 API

基于 Node.js + Express，数据用 `data.json` 持久化（首次运行自动用 `src/seed.js` 种子数据生成）。数据保存采用同目录临时文件原子替换，并在覆盖前保留一份 `data.json.bak`；如果现有数据无法解析，服务会停止启动，避免用种子数据覆盖业务数据。

## 微信小程序登录

小程序 AppID 已配置为 `wx5d1ccdf824e45e73`。启动生产服务前必须在服务端环境变量中设置：

```powershell
$env:WECHAT_APPID='wx5d1ccdf824e45e73'
$env:WECHAT_APP_SECRET='从微信公众平台获取的 AppSecret'
$env:SESSION_SECRET='长度足够的随机会话签名密钥'
npm start
```

运行服务端测试：

```bash
npm test
```

不要把 AppSecret 或 `SESSION_SECRET` 写进小程序代码、配置文件或 Git。登录流程为：小程序调用 `wx.login`，后端使用临时 code 调用微信 `jscode2session`，再向小程序返回签名会话 Token。

部署时还需要在微信公众平台的「开发管理 → 开发设置 → 服务器域名」中，把生产 API 域名加入 `request` 合法域名（必须使用 HTTPS）。本地开发者工具联调可在项目设置中临时关闭域名校验，但真机和正式版仍以公众平台配置为准。

AppSecret 一旦出现在聊天记录、截图或前端代码中，应立即在微信公众平台重置，并同步更新服务端环境变量。

仅本地接口联调时，可显式开启模拟登录：

```powershell
$env:WECHAT_LOGIN_MOCK='true'
npm start
```

模拟登录在 `NODE_ENV=production` 时自动禁用。

## 微信支付 API v3

项目已按真实小程序支付流程接入：服务端 JSAPI/小程序下单 → 小程序 `wx.requestPayment` → 微信支付通知验签、解密 → 更新订单和发放权益。小程序支付成功回调只表示收银台完成，业务到账状态只以服务端收到并验证通过的微信支付通知为准。

复制 `.env.example` 中的支付配置并填写真实商户资料：

- `WECHAT_PAY_MCH_ID`：与小程序 AppID 绑定的微信支付商户号；
- `WECHAT_PAY_CERT_SERIAL`：商户 API 证书序列号；
- `WECHAT_PAY_PRIVATE_KEY_PATH`：商户 API 证书私钥绝对路径；
- `WECHAT_PAY_API_V3_KEY`：商户平台设置的 32 字节 APIv3 密钥；
- `WECHAT_PAY_NOTIFY_URL`：公网 HTTPS 支付通知地址，路径为 `/api/payments/wechat/notify`；
- `WECHAT_PAY_REFUND_NOTIFY_URL`：退款通知地址；可与支付通知地址相同，服务端会按事件类型分别处理；
- `WECHAT_PAY_PLATFORM_SERIAL`、`WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH`：微信支付平台公钥 ID 和公钥文件，用于回调验签。

证书私钥、APIv3 密钥和平台公钥文件不能提交到 Git。配置不完整时支付接口返回明确错误，不会把订单模拟成已支付。

## 启动

```bash
cd server
npm install
npm start        # 或 npm run dev（文件变化自动重启）
```

默认地址：`http://127.0.0.1:3000`

本地开发可使用管理员 Token `admin-token`（通过请求头 `x-admin-token` 传递）。生产环境不会启用该默认值，必须配置 `ADMIN_PASSWORD`，也可另行设置强随机 `ADMIN_TOKEN`。

## 代码结构

- `src/index.js`：服务启动、全局中间件和路由装配
- `src/services/payments.js`：支付下单与退款流程编排
- `src/services/logistics.js`：物流订阅、查询与定时刷新编排
- `src/middleware/body-parsers.js`：按接口风险分级配置请求体解析上限
- `src/routes/auth.js`：运营后台登录与微信会员登录
- `src/routes/orders.js`：订单、支付、退款、履约、评价和订单物流接口
- `src/routes/balance.js`：会员余额充值、余额流水与微信充值支付接口
- `src/routes/member-data.js`：报名人与收货地址接口，统一执行会员归属校验
- `src/routes/uploads.js`：运营后台上传接口
- `src/routes/webhooks.js`：微信支付/退款与快递鸟原始报文回调
- `src/routes/merchant.js`：商户登录及活动、商品、课程管理接口
- `src/routes/provider-applications.js`：用户申请商户及后台审核开户接口
- `src/routes/customers.js`：后台会员列表、会员档案详情及资料维护接口
- `src/routes/coupons.js`：平台或商家优惠券的发布、编辑和上下架接口
- `src/routes/reviews.js`：评价公开展示、屏蔽及官方回复管理接口
- `src/routes/banners.js`：Banner 发布、图片或视频上传、跳转链接及上下架接口
- `src/middleware/auth.js`：管理员、会员、商户身份与资源归属校验
- `src/lib/json-file-store.js`：JSON 数据文件读取、损坏保护、备份和原子写入
- `test/`：数据持久化与通用领域工具回归测试
- `src/lib/session.js`：签名会话和密码散列
- `src/lib/uploads.js`：图片格式、大小校验及本地存储
- `src/lib/http.js`：统一成功响应和错误响应
- `src/lib/wechat-pay.js`：微信支付 API v3 下单、退款、签名、回调验签与通知解密
- `src/store.js`：数据读写和业务规则

## 主要接口

- `GET /api/home` 首页数据（Banner、分类、活动、配置）
- `GET/POST/PUT/DELETE /api/activities` 活动/商品管理
- `GET/POST /api/orders`，`POST /api/orders/:id/pay` 获取真实微信支付参数；订单到账状态由支付通知更新
- `GET /api/balance/transactions` 查询余额流水；`POST /api/balance/recharges` 创建充值单；`POST /api/balance/recharges/:id/pay` 获取微信充值参数
- `POST /api/payments/wechat/notify` 微信支付与退款通知（原始报文验签并用 APIv3 密钥解密）
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
- `POST /api/merchant/login` 商户登录；商户账号由服务商申请审核通过后在运营后台开通
- `GET /api/merchant/me` 当前商户资料
- `/api/merchant/activities`、`/api/merchant/products`、`/api/merchant/courses` 商户自有内容管理；服务端强制校验归属
- `POST /api/merchant/uploads/image` 商户封面图片上传

## 快递鸟实时物流

在 `.env` 中配置 `KDNIAO_EBUSINESS_ID` 和 `KDNIAO_API_KEY`，并在快递鸟后台将轨迹推送地址设为：

```text
https://你的公网域名/api/logistics/kdniao/callback
```

发货后服务端会自动订阅轨迹，验签接收快递鸟回调，保存完整轨迹并在签收时更新订单状态。系统默认每 6 小时对未签收运单进行一次补偿查询，可通过 `LOGISTICS_REFRESH_INTERVAL_MS` 调整（最低 30 分钟）。

修改类接口需要登录签发的后台令牌；本地开发也可使用 `x-admin-token: admin-token`。以下读接口同样需要对应后台权限：
`GET /api/coupons`（含入会赠送券等归属个人券，小程序改从 `/api/users/:id` 取自己的券）、
`GET /api/commissions`、`GET /api/withdraws`、`GET /api/commission-settlements`、`GET /api/manager-applications`。

## 优惠券数据模型

- `couponTemplates` 保存后台发布的券模板、适用范围、归属商家和发布状态；
- `userCoupons` 保存会员独立持券记录，包括 `userId / templateId / claimedAt / status / usedAt / orderId`；
- 创建待付款订单时会员券进入 `locked`，支付回调确认后进入 `used`；取消订单或符合退券规则的退款会恢复为 `unused`；
- 历史 `coupons` 数据会在启动时迁移为模板和会员券，旧订单会改为关联对应会员券记录。

## 佣金与提现口径

- **主理人身份**：主理人记录用 `userId` 绑定平台会员账号。`GET /api/managers/:id/dashboard` 必须带 `?userId=`
  且只允许本人查看（管理员带 `x-admin-token` 可查看任意主理人）；申请通过时自动绑定申请人账号，
  清退（status 3）后立即失去工作台权限。
- **申请资料校验**：手机号先规范化（去掉空格/短横线/`+86` 前缀）再校验 11 位。
  申请表联系电话可与登录账号手机号不同，且不会覆盖账号资料；账号没有会员档案时按申请信息自动补建，避免申请流程卡死。
- **退款流程**：`POST /api/orders/:id/refund` 是用户申请，默认只把订单置为「退款中」
  （记录 `refundReason / refundAmount / refundApplyTime / refundPrevStatus`），不动钱、不扣佣金、不释放名额；
  运营在后台 `POST /api/orders/:id/refund-audit` 同意后向微信提交退款，只有收到并验证通过的 `REFUND.SUCCESS`
  通知后才标记「已退款」、释放名额、按规则退券并扣回佣金；拒绝则退回申请前的状态并记录 `refundRejected`。
  `config.refundNeedAudit = false` 时自动提交微信退款，但仍以退款成功通知作为最终结果。
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
