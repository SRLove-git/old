# 岁悦里商户端

独立于运营后台的商户工作台。用户先在小程序提交服务商申请，由运营后台审核并开通商户账号；审核通过后，商户可登录并发布、维护本人名下的活动、商品和课程。

代码结构与开发规范见 [`docs/DEVELOPMENT.md`](../docs/DEVELOPMENT.md)。

## 本地运行

先启动后端：

```bash
cd server
npm ci
npm run dev
```

再启动商户端：

```bash
cd merchant
npm install
npm run dev
```

开发地址为 `http://127.0.0.1:5174`。生产构建使用 `/merchant/` 子路径：

```bash
npm run build
```

商户会话使用 Bearer Token。所有活动、商品、课程接口都会在服务端检查资源的 `managerId`，不能通过修改请求参数访问其他商户数据。
