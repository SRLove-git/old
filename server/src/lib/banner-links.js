import { seed } from '../seed.js'
import { publicationGroups, publicationView } from './wechat-publication-state.js'

const activityPage = '/pages/detail/detail'
const coursePage = '/pages/live-room/live-room'
const contentPage = '/pages/content-detail/content-detail'
const detailPages = new Set([activityPage, coursePage, contentPage])
export const BANNER_LINK_VERSION = 1

export function bannerTargets(database) {
  const targets = new Map()
  function add(items, type, page, visible) {
    for (const item of items || []) {
      if (item.id == null || !item.title || !visible(item)) continue
      const linkUrl = `${page}?id=${encodeURIComponent(item.id)}`
      // 活动和商品共用详情页；重复 ID 无法唯一定位。
      const target = { type, id: item.id, title: item.title, linkUrl }
      if (type === 'content' && item.aliasIds?.length) target.aliasIds = item.aliasIds
      targets.set(linkUrl, targets.has(linkUrl) ? null : target)
    }
  }
  const published = (item) => Number(item.status ?? 1) === 1
  add(database.activities, 'activity', activityPage, published)
  add(database.products, 'product', activityPage, published)
  add(database.lives, 'course', coursePage, item => item.status !== 'disabled' && String(item.status) !== '0')
  const revoked = new Set(database.wechatWithdrawnPublications)
  const posts = publicationGroups(database.contentPosts || []).map(group => publicationView(group, revoked, false))
  add(posts, 'content', contentPage, item => Number(item.status) === 1)
  return new Map([...targets].filter(([, target]) => target))
}

// 对带额外查询参数的详情链接，仅用页面和 id 核实目标，保留原链接供导航使用。
export function availableBannerLink(link, targets) {
  const page = link.split(/[?#]/, 1)[0]
  if (!detailPages.has(page)) return true
  const query = link.split('#', 1)[0].slice(page.length + 1)
  const id = new URLSearchParams(query).get('id')
  if (!id) return false
  if (targets.has(`${page}?id=${encodeURIComponent(id)}`)) return true
  return page === contentPage && [...targets.values()].some(target => target.aliasIds?.includes(id))
}

function legacyLink(banner) {
  const category = Number(banner.cat || 0)
  return category > 0 ? `/pages/list/list?category=${category}` : '/pages/profile/profile'
}

export function storedBannerLink(banner) {
  return Object.hasOwn(banner, 'linkUrl') ? String(banner.linkUrl ?? '').trim() : legacyLink(banner)
}

export function normalizeBanners(database) {
  if (!Array.isArray(database.banners)) database.banners = structuredClone(seed.banners)
  const old = database.banners.filter(banner => Number(banner.linkResolutionVersion || 0) < BANNER_LINK_VERSION)
  if (!old.length) return
  const targets = bannerTargets(database)
  const seedTargets = bannerTargets(seed)
  for (const banner of old) {
    const link = storedBannerLink(banner)
    // 只识别原来的列表默认值，保留管理员设置的外链、额外参数和显式空链接。
    if (/^\/pages\/list\/list(?:\?(?:category|cat)=\d+)?$/.test(link)) {
      const original = seed.banners.find(row => String(row.id) === String(banner.id))
      const seededTarget = original && seedTargets.get(original.linkUrl)
      const currentTarget = original && targets.get(original.linkUrl)
      if (link === legacyLink(banner) && seededTarget && currentTarget?.title === seededTarget.title &&
          original.title === banner.title && Number(original.cat) === Number(banner.cat)) {
        banner.linkUrl = original.linkUrl
      } else {
        const title = String(banner.title || '').trim()
        const matches = [...targets.values()].filter(target => String(target.title).trim() === title)
        if (title && matches.length === 1) banner.linkUrl = matches[0].linkUrl
      }
    }
    // 后续更名或上下架，都不能让同一广告重新绑定到另一条记录。
    banner.linkResolutionVersion = BANNER_LINK_VERSION
  }
}
