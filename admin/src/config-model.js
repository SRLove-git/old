export const BRAND_COPY_FIELDS = [
  'loginTitle', 'homeHeroKicker', 'homeHighlightBrand', 'socialFollowTip',
  'officialAccountName', 'videoChannelName', 'detailGalleryBrand',
  'courseTeacherDescription', 'merchantBenefitsSubtitle', 'defaultShopIntro',
  'profileEditDescription', 'shareManagerTitle', 'shareActivityTitle'
]

export function replaceText(value, from, to) {
  if (!from || typeof value !== 'string') return value
  return value.split(from).join(to)
}

export function copyForEditor(copy, brandName) {
  const next = { ...(copy || {}) }
  BRAND_COPY_FIELDS.forEach((field) => { next[field] = replaceText(next[field], '{brand}', brandName || '') })
  return next
}

export function copyForStorage(copy, currentBrand, previousBrand) {
  const next = { ...(copy || {}) }
  const names = [...new Set([currentBrand, previousBrand].map((item) => String(item || '').trim()).filter(Boolean))]
    .sort((left, right) => right.length - left.length)
  BRAND_COPY_FIELDS.forEach((field) => names.forEach((name) => { next[field] = replaceText(next[field], name, '{brand}') }))
  return next
}

export const wechatNoteForEditor = (note, wechat) => replaceText(note, '{wechat}', wechat || '')

export function wechatNoteForStorage(note, currentWechat, previousWechat) {
  let next = note
  const accounts = [...new Set([currentWechat, previousWechat].map((item) => String(item || '').trim()).filter(Boolean))]
    .sort((left, right) => right.length - left.length)
  accounts.forEach((wechat) => { next = replaceText(next, wechat, '{wechat}') })
  return next
}

export function createDefaultConfig() {
  return {
    couponRefundReturn: 'auto',
    refundNeedAudit: true,
    balanceRechargeAmounts: [50, 100, 200, 500],
    homeDisplay: { newsLimit: 3, videoLimit: 3 },
    brand: { chineseName: '岁悦里', englishName: 'SUI YUE LI', slogan: '和同龄人一起，玩得开心又省心' },
    copy: {
      loginTitle: '欢迎来到{brand}', loginDescription: '登录后可查看活动、线上课堂及会员专属服务',
      homeWelcomeTitle: '发现美好生活', homeWelcomeSubtitle: '活动、旅行与课程，都在这里', homeHeroKicker: '{brand} · 乐活俱乐部', homeCategoryCountText: '5 类精选',
      homeMemberTitle: '立即入会，享会员特权', homeMemberSubtitle: '免费加入 · 本单最高省 ¥100', homeHighlightBrand: '{brand}', homeHighlightTitle: '探索无限世界 · 共创有趣人生', homeHighlightSubtitle: '每一次出发，都有熟悉的人和贴心的陪伴',
      memberBenefitsSummary: '会员价 · 专属优惠 · 活动优先报名', managerReviewPendingText: '申请已提交，预计1-2个工作日审核', socialFollowTip: '长按二维码，关注「{brand}」公众号和视频号', officialAccountName: '{brand}公众号', videoChannelName: '{brand}视频号',
      detailGalleryBrand: '{brand}俱乐部', detailMemberOffer: '入会得优惠券，本单再减', courseTeacherDescription: '{brand}特邀讲师 · 适老化教学', merchantBenefitsSubtitle: '为{brand}会员精选本地商家优惠与专属体验', defaultShopIntro: '用心挑选适合{brand}会员的产品与服务。', profileEditDescription: '一个亲切的名称，方便在{brand}识别您',
      memberCardSubtitle: '俱乐部 · 尊享会员卡', memberCardTitle: '尊享会员', memberBenefitLines: '💰|会员价：活动更便宜，长期更省钱\n🎟️|入会即送优惠券，下单可抵扣\n👩‍💼|专属主理人一对一贴心服务\n⭐|热门活动优先报名名额\n🎁|积分可兑换好礼', memberJoinText: '还不是会员？免费入会，享专属好礼', memberJoinSuccessText: '入会成功，已发放{count}张券', shareManagerTitle: '和同龄人一起玩，{brand}精选活动', shareActivityTitle: '{brand}线下活动'
    },
    assistant: { name: '小助理', wechat: 'suiyueli6070', phone: '400-800-6070', avatar: '🧑‍💼', intro: '' },
    homeAssistant: { title: '小助理服务', qrImage: '', tip: '长按二维码，添加小助理微信', wechatNote: '微信号：{wechat}（长按识别或保存二维码）' },
    socialQrs: { officialAccount: '', videoChannel: '' },
    filing: { companyName: '', icp: '', police: '' }
  }
}
