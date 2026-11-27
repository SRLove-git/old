# 岁悦里俱乐部 · 后端 API

基于 Node.js + Express，数据用 `data.json` 持久化（首次运行自动用 `src/seed.js` 种子数据生成）。数据保存采用同目录临时文件原子替换，并在覆盖前保留一份 `data.json.bak`；如果现有数据无法解析，服务会停止启动，避免用种子数据覆盖业务数据。

代码结构与开发规范见 [`docs/DEVELOPMENT.md`](../docs/DEVELOPMENT.md)。`npm test` 运行 `test/` 下的单测与隔离接口回归测试。

## 微信小程序登录

小程序 AppID 已配置为 `wx5d1ccdf824e45e73`。启动生产服务前必须在服务端环境变量中设置：

```powershell
$env:NODE_ENV='production'
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

会员接口默认只接受 `Authorization: Bearer <签名会话>`。未设置 `NODE_ENV` 也不会信任 `x-user-id`、查询参数或请求体中的 `userId` 作为登录凭据；请求体 `userId` 只能指定与已登录身份一致的用户。确需旧客户端本地联调时，必须同时设置 `NODE_ENV=development` 和 `ALLOW_LEGACY_USER_ID=true`，签名会话仍优先。生产环境始终忽略该联调开关，部署配置应使用 `NODE_ENV=production`、`ALLOW_LEGACY_USER_ID=false`。

## 主理人推广小程序码

`GET /api/managers/:id/promotion-code` 返回 `{ imageBase64, mimeType, envVersion }`，只有持有效签名会员会话、与本人 `userId` 关联且启用中的主理人可获取，管理员令牌和旧联调身份头不能代替会员会话。

服务端使用 `WECHAT_APPID`、`WECHAT_APP_SECRET` 获取微信 `stable_token`，再调用 `getwxacodeunlimit` 生成 `pages/index/index` 的小程序码，场景为 `ref=<主理人ID>`。access_token 只保存在服务端内存，提前刷新；失效时最多重新获取并重试一次，不使用强制刷新。图片缓存有效期 15 分钟，最多 64 张且不超过 16 MiB，所有缓存请求仍检查主理人状态。

`WECHAT_CODE_ENV_VERSION` 默认 `release`，仅可配置 `release`、`trial` 或 `develop`；只有正式版启用微信页面路径校验。正式版需已发布首页，体验版/开发版扫码权限遵循微信平台规则。`WECHAT_CODE_TIMEOUT_MS` 默认 8000（范围 1000–30000）。还需在微信公众平台配置服务器出口 IP 白名单。测试全部使用模拟微信响应，真实凭证、白名单及手机扫码效果需部署后验收。

## 公众号发布联调

`src/lib/wechat-mp.js` 封装了公众号发布链路所需的 `stable_token`、正文图片上传（`media/uploadimg`）、封面永久素材（`material/add_material?type=image`）、新增草稿（`draft/add`）、提交发布（`freepublish/submit`）和发布状态查询（`freepublish/get`）。公众号与小程序使用两套 AppID/AppSecret，不能混用。

在服务端的 `.env.local` 配置岁悦里文化科技的公众号凭证：

```bash
WECHAT_MP_APPID=wx4ff9702f8188c0c0
WECHAT_MP_APPSECRET=
WECHAT_MP_TIMEOUT_MS=10000
WECHAT_MP_AUTHOR=
```

公众号需为企业主体已认证账号，并在公众平台后台确认“草稿箱/发布能力”接口权限、把服务器出口 IP 加入白名单。先只建草稿，确认后台排版：

```bash
cd server
npm run wechat-mp:spike
```

预览后使用同一个草稿 ID 提交：

```bash
npm run wechat-mp:spike -- --publish --media-id=已预览的草稿ID
```

脚本默认生成一张测试封面和正文图，也可以传 `--image=/absolute/path/to/cover.png`。真实 token、白名单、草稿和发布结果需用真实公众号验收；测试全部使用模拟微信响应。

运营后台“资讯视频”中的政策资讯支持生成公众号草稿、提交发布和查询发布状态。封面与正文图片必须先上传到运营后台；服务端会将 WebP 安全转换为公众号支持的 JPEG。提交发布前必须先到公众号后台草稿箱预览，政策资讯在生成草稿后发生修改时会阻止发布，要求重新生成并预览。

“资讯视频”支持生成图文或贴图，查看各次发表结果。有内容管理权限的人员可点“同步公众号发表记录”，将微信返回的标题、摘要和封面同步到小程序政策资讯。发表列表的更新时间与临时链接仅用于同步。小程序从发表成功回执或运营人员核对过的文章取得原文链接。已有记录可点“核对原文”，补上实际发表日期和已发表文章链接。微信返回 48001 时，可点“按文章链接导入”，打开原文核对发表账号为“岁悦里文化科技”，再填写原标题、日期和链接。

获得发表列表权限后，可设置 `WECHAT_MP_SYNC_ENABLED=true` 在服务启动时及其后每 30 分钟同步。下架、删除和微信撤回会同步影响小程序的可见性。后台原创资讯在微信撤回后保留本地正文并移除对应的公众号阅读入口。首页的“查看全部”可进入资讯列表，卡片由运营勾选推荐。

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

## 商家转账（提现打款到微信零钱）

提现审核只允许通过微信零钱商家转账打款，后台不能人工标记到账。启用微信转账需要在商户平台[开通商家转账](https://pay.weixin.qq.com/doc/v3/merchant/4013740645.md)、完成转账场景审核，并在「产品中心 → 商家转账 → 前往功能」配置接口安全 IP（服务端出口 IP）。

配置项（基于已有的微信支付商户证书与 APIv3 密钥）：

- `WECHAT_TRANSFER_ENABLED=true`：显式启用；不设置时禁用提现审核打款，避免未开通产品时出现 `NO_AUTH`；
- `WECHAT_TRANSFER_SCENE_ID`：转账场景 ID，默认 `1005`（佣金报酬）；
- `WECHAT_TRANSFER_SCENE_REPORT_INFOS`：场景报备信息 JSON 数组；1005 默认传「岗位类型=主理人、报酬说明=推广佣金」，切换其他场景时必须按[场景报备说明](https://pay.weixin.qq.com/doc/v3/merchant/4013774588.md)配置；
- `WECHAT_TRANSFER_PERCEPTION`、`WECHAT_TRANSFER_REMARK`：用户收款时看到的收款感知与备注；
- `WECHAT_TRANSFER_NOTIFY_URL`：商家转账回调地址，默认由 `WECHAT_PAY_NOTIFY_URL` 推导为 `/api/transfers/wechat/notify`。

打款流程：管理员在提现审核中发起「微信商家转账」→ 服务端创建转账单（佣金锁定、状态变为「打款中」）→ 主理人在小程序工作台点「确认收款」拉起微信官方页面 → 微信回调 `/api/transfers/wechat/notify` 或服务端每分钟主动查单 → 只有 `SUCCESS` 才结算佣金，`FAIL/CANCELLED` 才释放佣金。后台不提供人工标记到账。

注意事项：

- 单笔转账金额 ≥ 2000 元时微信强制校验收款人实名姓名，必须传入与微信支付实名一致的姓名（只取实名字段，不用昵称代替）；金额更大时还需在商户平台[申请提额](https://pay.weixin.qq.com/doc/v3/merchant/4013747667.md)。
- 用户 24 小时内未确认收款，微信会自动关单退款，提现单会变为「打款失败」并释放锁定佣金，主理人可重新申请。
- 项目未接入微信订阅消息：主理人下次进入小程序工作台会看到「待确认收款」提示，运营可另用客服消息/电话提醒。
- 发起转账遇到任何 HTTP 非 200、网络超时或未知错误码时，服务端保留原商户单号、原请求参数和「打款中」状态，持续查单；不允许人工标记失败或释放锁定佣金。
- 打款账户（运营账户）余额不足时转账会停留在 `PROCESSING`，需先充值；回调与查单结果才是资金到账的唯一依据。

## 启动

```bash
cd server
npm install
npm start        # 或 npm run dev（文件变化自动重启）
```

默认地址：`http://127.0.0.1:3000`

只有显式设置 `NODE_ENV=development` 才会启用本地管理员 Token `admin-token`、初始管理员口令和会话签名密钥的开发默认值。生产环境及未设置 `NODE_ENV` 时均不启用这些默认凭据：必须配置 `SESSION_SECRET` 才能签发会话，首次创建管理员需要配置 `ADMIN_PASSWORD`，也可另行设置强随机 `ADMIN_TOKEN`。持久化的已有管理员账号、密码和启停状态不因缺少启动口令而改变。

## 代码结构

- `src/index.js`：服务启动、全局中间件和路由装配
- `src/services/payments.js`：支付下单与退款流程编排
- `src/services/transfers.js`：商家转账发起、查单、撤销与定时对账
- `src/lib/wechat-pay.js`：微信支付 APIv3 签名、验签与请求封装
- `src/lib/wechat-transfer.js`：商家转账接口封装（场景报备、姓名加密）
- `src/services/logistics.js`：物流订阅、查询与定时刷新编排
- `src/middleware/body-parsers.js`：按接口风险分级配置请求体解析上限
- `src/routes/auth.js`：运营后台登录与微信会员登录
- `src/routes/orders.js`：订单、支付、退款、履约、评价和订单物流接口
- `src/routes/balance.js`：会员余额充值、余额流水与微信充值支付接口
- `src/routes/member-data.js`：报名人与收货地址接口，统一执行会员归属校验
- `src/routes/uploads.js`：运营后台上传接口
- `src/routes/webhooks.js`：微信支付/退款、商家转账与快递鸟原始报文回调
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
- `POST /api/customers/:id/bind` 客户自助绑定。归属按首触固定：客户已有有效主理人时，
  扫码/链接来源（`source` 1/2）静默保留原归属并返回原主理人，不会覆盖；主动输入其他邀请码（`source` 3）
  返回“请先申请解绑”的明确错误。管理员变更归属仍使用 `/api/bindings/rebind`。
- `GET /api/commissions`、`POST /api/commissions/settle`、`POST /api/commissions/:id/adjust` 佣金
- `GET /api/commission-settlements` 结算流水（可按 `?managerId=` 过滤）
- `GET /api/withdraws`、`POST /api/withdraws`、`POST /api/withdraws/:id/{approve,reject}` 提现
- `POST /api/withdraws/:id/transfer/{sync,cancel,reset}` 微信转账查单、撤销与结果不明确时标记失败
- `POST /api/transfers/wechat/notify` 商家转账终态通知（验签 + 解密，幂等更新提现单）
- `GET/PUT /api/config` 全局分佣比例等配置
- `POST /api/content-posts/:id/wechat-{draft,publish,status}` 生成公众号草稿、提交发布和查询发布状态
- `GET /api/lives` 公开学堂列表。管理员可通过 `POST /api/lives` 创建课程，通过 `PUT/DELETE /api/lives/:id` 编辑或删除。活动、商品和课程都支持 `publisherType: "platform"`、`managerId: null` 的自营发布；商家发布使用 `publisherType: "merchant"` 和对应的商家 ID。
- `GET /api/stats/dashboard` 数据看板
- `POST /api/admin/merchant-accounts` 管理员按核实后的商户名称创建账号，可关联一条已通过的服务商申请
- `POST /api/merchant/login` 使用运营后台开通的商户账号登录
- `GET /api/merchant/me` 当前商户资料
- `/api/merchant/activities`、`/api/merchant/products`、`/api/merchant/courses` 商户自有内容管理；服务端强制校验归属
- `POST /api/merchant/uploads/image` 商户封面图片上传

## 快递鸟实时物流

在 `.env` 中配置 `KDNIAO_EBUSINESS_ID` 和 `KDNIAO_API_KEY`，并在快递鸟后台将轨迹推送地址设为：

```text
https://你的公网域名/api/logistics/kdniao/callback
```

发货后服务端会自动订阅轨迹，验签接收快递鸟回调，保存完整轨迹并在签收时更新订单状态。系统默认每 6 小时对未签收运单进行一次补偿查询，可通过 `LOGISTICS_REFRESH_INTERVAL_MS` 调整（最低 30 分钟）。

修改类接口需要登录签发的后台令牌；显式 `NODE_ENV=development` 的本地开发也可使用 `x-admin-token: admin-token`。以下读接口同样需要对应后台权限：
`GET /api/coupons`（含入会赠送券等归属个人券，小程序改从 `/api/users/:id` 取自己的券）、
`GET /api/commissions`、`GET /api/withdraws`、`GET /api/commission-settlements`、`GET /api/manager-applications`。
`/api/logistics/*` 管理接口（配置、查询、异常列表和刷新）统一要求 `orders.manage` 权限；会员订单物流入口仍校验订单归属。

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
- **打款与拒绝**：`approve` 只支持 `payMethod: 'wechat'`，必须经微信回调或主动查单确认后才能把该提现单锁定的佣金标记为
  「已结算」并写入 `settleTime`，重复打款会被拒绝；微信转账则先进入「打款中」，以微信回调/查单结果为准结算，
  失败或撤销会把锁定佣金释放回「可结算」。`reject` 直接释放锁定佣金。
- **退款扣回**：退款时按退款比例冲减佣金。
  「待结算 / 可结算」直接扣减；「提现中」同步下调提现单金额与税费（金额归零则自动撤销提现单）；
  「已结算」（已打款）会生成一张负向「待结算」佣金单作为负债，抵扣后续佣金，工作台 `balance.debt` 可见。
- **结算粒度**：`POST /api/commissions/settle` 支持 `{ managerId, orderId, ids, from, to }`
  按主理人 / 订单 / 指定佣金单 / 时间区间结算，每次结算写入 `settlementRecords` 结算流水。
- **课程购课进入分佣**：`POST /api/lives/:id/purchase` 除了发计次卡，还会生成课程订单（`source: 'live'`）
  并按主理人比例生成佣金单，课程销售不再游离在佣金体系之外。
