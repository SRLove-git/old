# 部署密钥

`deploy.env.enc` 是使用 AES-256-CBC 和 PBKDF2 加密的服务端环境配置。解密密码不得提交到 Git，请通过独立的安全渠道获取。

部署到服务器时，在 `server` 目录执行：

```bash
export DEPLOY_ENC_PASSWORD='通过安全渠道收到的解密密码'
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -in deploy.env.enc -out .env -pass env:DEPLOY_ENC_PASSWORD
chmod 600 .env
npm start
```

`.env` 已被仓库根目录的 `.gitignore` 排除，禁止强制提交。

