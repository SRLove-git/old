# Vendored QR encoder

`qrcode-generator.js` is the unmodified CommonJS distribution from
`qrcode-generator@2.0.4`, by Kazuhiko Arase, licensed under MIT.

Source: https://github.com/kazuhikoarase/qrcode-generator

The version is pinned in the server development dependencies and lockfile. To
refresh this copy after reviewing an upstream update:

```sh
cp server/node_modules/qrcode-generator/dist/qrcode.js miniprogram/utils/vendor/qrcode-generator.js
```

The Mini Program loads this local file directly; no npm build is required in
WeChat Developer Tools. The wrapper enables UTF-8 and draws integer-sized cells.
Regression tests compare the vendored bytes with the pinned distribution and
decode the rendered output with the independent jsQR decoder.
