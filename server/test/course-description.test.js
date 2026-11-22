import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { descriptionFields } from '../src/lib/description-blocks.js'

const require = createRequire(import.meta.url)
const apiBase = require('../../miniprogram/utils/config.js').API_BASE
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'suiyueli-course-intro-'))
process.env.DATA_FILE = path.join(directory, 'data.json')
test.after(() => fs.rmSync(directory, { recursive: true, force: true }))
const store = await import('../src/store.js')
const initial = store.init()
const image = { type: 'image', src: '/api/uploads/files/lesson.webp', caption: '动作分解' }
const text = value => ({ type: 'text', text: value })
const blocks = [text('先热身'), image, text('接着拉伸')]

function renderCourseData(course) {
  // Use the production asset resolver, with no real login or network requests.
  const module = { exports: {} }
  vm.runInNewContext(fs.readFileSync(new URL('../../miniprogram/store/index.js', import.meta.url), 'utf8'), {
    module, require: id => id.endsWith('config.js') ? { API_BASE: apiBase } : {}
  })
  const miniStore = {
    assetUrl: module.exports.assetUrl, getLive: () => course, isCoursePurchased: () => false, getCopy: () => ({})
  }
  let page
  vm.runInNewContext(fs.readFileSync(new URL('../../miniprogram/pages/live-room/live-room.js', import.meta.url), 'utf8'), {
    Page: value => { page = value }, require: () => miniStore
  })
  page.setData = patch => Object.assign(page.data, patch)
  page.loadCourse()
  return JSON.parse(JSON.stringify(page.data))
}

test('mixed course introduction is saved, survives reload and resolves uploads on the public detail page', async () => {
  const course = store.createLive({
    title: '伸展课', managerId: initial.managers[0].id, memberPrice: 12, status: 'ended',
    description: '弹窗里保留的旧摘要', detailBlocks: blocks,
    lessons: [{ title: '付费课节', videoUrl: 'https://video.example.test/private.mp4', status: 1 }],
    replayUrl: 'https://video.example.test/replay.mp4'
  })
  const reloaded = await import('../src/store.js?course-roundtrip')
  const publicCourse = reloaded.listLives().find(item => item.id === course.id)
  assert.deepEqual(publicCourse.detailBlocks, blocks)
  assert.equal(publicCourse.description, '先热身\n\n接着拉伸')
  assert.equal(publicCourse.lessons[0].videoUrl, '')
  assert.equal(publicCourse.replayUrl, '')
  const rendered = renderCourseData(publicCourse)
  assert.deepEqual(rendered.live.detailBlocks.map(block => block.type), ['text', 'image', 'text'])
  assert.equal(rendered.live.detailBlocks[1].src, `${apiBase}/api/uploads/files/lesson.webp`)
  assert.equal(rendered.live.detailBlocks[1].caption, image.caption)
  assert.equal(rendered.purchased, false)
  assert.equal(rendered.playableUrl, '')
})

test('existing description-only course remains readable until a rich introduction is saved', () => {
  const legacy = initial.lives.find(item => item.description && !item.detailBlocks)
  assert.ok(legacy)
  const rendered = renderCourseData({ ...legacy, activityId: null })
  assert.equal(rendered.live.detailBlocks[0].text, legacy.description)
  assert.equal(rendered.live.detailBlocks.length, 1)
})

test('both old editor request shapes update text while retaining uploaded illustrations', () => {
  const current = { detailBlocks: blocks, description: '先热身\n\n接着拉伸' }
  for (const request of [{ description: '新介绍' }, { ...current, description: '新介绍' }]) {
    const result = descriptionFields(request, current)
    assert.deepEqual(result, { detailBlocks: [text('新介绍'), image], description: '新介绍' })
  }
  assert.deepEqual(descriptionFields({}, current), current)
  assert.deepEqual(descriptionFields({ description: '' }, current), { detailBlocks: [image], description: '' })
})

test('explicitly clearing all course blocks clears the old summary and page content', () => {
  const target = initial.lives[0]
  store.updateLive(target.id, { detailBlocks: blocks })
  const cleared = store.updateLive(target.id, { detailBlocks: [], description: '旧摘要' })
  assert.equal(cleared.description, '')
  assert.deepEqual(cleared.detailBlocks, [])
  assert.deepEqual(renderCourseData({ ...cleared, activityId: null }).live.detailBlocks, [])
})

test('image-only and reordered rich introductions retain exact order and have a compatible summary', () => {
  const current = { detailBlocks: blocks, description: '先热身\n\n接着拉伸' }
  assert.deepEqual(descriptionFields({ detailBlocks: [image], description: '旧摘要' }, current), {
    detailBlocks: [image], description: ''
  })
  const reordered = [image, text('接着拉伸'), text('先热身')]
  assert.deepEqual(descriptionFields({ detailBlocks: reordered }, current), {
    detailBlocks: reordered, description: '接着拉伸\n\n先热身'
  })
})

test('invalid rich updates cannot partially overwrite a course introduction', () => {
  const target = initial.lives[0]
  store.updateLive(target.id, { detailBlocks: blocks })
  for (const detailBlocks of [
    'invalid', null, [{ type: 'video', url: 'https://example.test/lesson.mp4' }],
    [{ type: 'image', src: 'http://example.test/insecure.jpg' }], Array(101).fill(image)
  ]) {
    assert.throws(() => store.updateLive(target.id, { title: '不得生效', detailBlocks }), { status: 400 })
    const unchanged = store.listLives().find(item => item.id === target.id)
    assert.deepEqual(unchanged.detailBlocks, blocks)
    assert.notEqual(unchanged.title, '不得生效')
  }
})

test('all catalog editors preserve selected formatting, legacy plain text and ordered media after restart', async () => {
  const markup = '<p>前<strong>选中</strong>后</p><script>discard()</script>'
  const data = { title: '排版验收', coverImage: '/assets/cover.jpg', memberPrice: 1, price: 2, pointsCost: 10 }
  const cases = [
    [store.createActivity, store.updateActivity, 'activities', 'detail'],
    [store.createProduct, store.updateProduct, 'products', 'detail'],
    [store.createLive, store.updateLive, 'lives', 'description'],
    [store.createPointProduct, store.updatePointProduct, 'pointProducts', 'description']
  ]
  const expected = []
  for (const [create, update, collection, field] of cases) {
    const record = create({ ...data, publisherType: 'platform', [field]: '旧介绍' })
    assert.equal(record.detailBlocks[0].text, '旧介绍')
    const media = { ...image, align: 'right', width: 55 }
    const blocks = [{ type: 'text', html: markup }, media]
    if (field === 'detail') blocks.push({ type: 'video', url: 'https://example.test/demo.mp4', caption: '课程片段' })
    const saved = update(record.id, { detailBlocks: blocks })
    assert.equal(saved[field], '前选中后')
    assert.match(saved.detailBlocks[0].html, /前<strong>选中<\/strong>后/)
    assert.doesNotMatch(saved.detailBlocks[0].html, /script|discard/)
    assert.deepEqual(saved.detailBlocks[1], media)
    expected.push([collection, saved.id, saved.detailBlocks])
  }
  const reloaded = (await import('../src/store.js?all-editors-roundtrip')).init()
  for (const [collection, id, saved] of expected) {
    assert.deepEqual(reloaded[collection].find(entry => entry.id === id).detailBlocks, saved)
  }
})
