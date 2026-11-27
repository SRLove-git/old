import assert from 'node:assert/strict'
import test from 'node:test'
import { resolvePreviewUrl } from '../src/utils/preview-url.js'

test('legacy mini-program assets use the bundled admin preview', () => {
  const bundledUrl = '/admin/assets/product-tumbler-v2.abc123.jpg'
  assert.equal(
    resolvePreviewUrl('/assets/product-tumbler-v2.jpg', {
      production: true,
      legacyAssets: { '/assets/product-tumbler-v2.jpg': bundledUrl }
    }),
    bundledUrl
  )
})

test('production API uploads keep using the admin proxy', () => {
  assert.equal(
    resolvePreviewUrl('/api/uploads/products/cup.jpg', { production: true }),
    '/admin/api/uploads/products/cup.jpg'
  )
})

test('absolute and local development URLs stay compatible', () => {
  assert.equal(resolvePreviewUrl('https://cdn.example.com/cup.jpg'), 'https://cdn.example.com/cup.jpg')
  assert.equal(resolvePreviewUrl('assets/cup.jpg'), '/assets/cup.jpg')
})
