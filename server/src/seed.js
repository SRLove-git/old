const pad = (n) => String(n).padStart(2, '0')
const week = ['日', '一', '二', '三', '四', '五', '六']

function fmtDate(d) {
  return {
    date: `${d.getMonth() + 1}月${d.getDate()}日`,
    full: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    weekday: `周${week[d.getDay()]}`,
    day: d.getDate()
  }
}

function makeSchedules(offsetDays, slots, quota, time) {
  const out = []
  for (let i = 1; i <= slots; i++) {
    const d = new Date()
    d.setDate(d.getDate() + offsetDays + i)
    const sold = [3, 8, 15, 0, 5, 11, 19, 2][(offsetDays + i) % 8]
    out.push({
      id: `sch-${offsetDays}-${i}`,
      ...fmtDate(d),
      time,
      totalQuota: quota,
      soldQuota: sold,
      remaining: Math.max(0, quota - sold)
    })
  }
  return out
}

const categories = {
  1: { name: '同城活动', short: '同城', emoji: '🥾', color: '#2f7d5c', type: 'activity' },
  2: { name: '研学旅行', short: '研学', emoji: '🚌', color: '#c96b2a', type: 'activity' },
  3: { name: '岁悦学堂', short: '学堂', emoji: '📚', color: '#3b6fa0', type: 'activity' },
  4: { name: '商家福利', short: '福利', emoji: '🎁', color: '#b04a6b', type: 'activity' },
  5: { name: '商品文创', short: '文创', emoji: '🛍️', color: '#7a5cae', type: 'product' }
}

const activities = [
  { id: 1, category: 1, city: '北京', title: '秋日徒步 · 香山赏红叶（15人成团）', cover: '🍁', coverTone: 'linear-gradient(135deg,#c96b2a,#f1b35a)', price: 99, memberPrice: 79, originalPrice: 128, minGroup: 15, maxGroup: 40, soldCount: 32, highlight: '轻松徒步，专业领队带路', points: ['适合零基础', '含往返大巴和领队服务'], time: '07:30 集合 · 约16:00返程', address: '香山公园东门集合', hasSku: false, schedules: makeSchedules(0, 6, 20, '08:30-16:00'), refundRule: { type: 'day', fullDays: 2, partialDays: 1, partialRate: 0.5 }, managerCommissionRate: 12, limitPerUser: 4, participantFields: { idCard: false, discount: false }, detail: '秋天到了，和同龄人一起去香山看红叶。' },
  { id: 2, category: 1, city: '北京', title: '每周掼蛋交友局（多场地可选）', cover: '🃏', coverTone: 'linear-gradient(135deg,#2f7d5c,#7cc79a)', price: 49, memberPrice: 39, originalPrice: 69, minGroup: 8, maxGroup: 24, soldCount: 18, highlight: '新手也能来，现场教规则', points: ['每桌配熟手', '茶水零食已备好'], time: '14:00-17:00', address: '多个场地可选', skuLabel: '场地', hasSku: true, skus: [
    { id: 'gd-tianhe', name: '天河场 · 每周六下午', district: '天河', address: '广州市天河区体育东路 116 号 · 幸福里棋牌室 2 楼', price: 49, memberPrice: 39, hot: true },
    { id: 'gd-panyu', name: '番禺场 · 每周日下午', district: '番禺', address: '广州市番禺区市桥光明北路 45 号 · 乐龄活动中心 1 楼', price: 49, memberPrice: 39, hot: false },
    { id: 'gd-nansha', name: '南沙场 · 每周五下午', district: '南沙', address: '广州市南沙区凤凰大道 88 号 · 社区文化站 3 楼', price: 49, memberPrice: 39, hot: false }
  ], schedules: makeSchedules(1, 5, 24, '14:00-17:00'), refundRule: { type: 'day', fullDays: 1, partialDays: 0, partialRate: 0 }, managerCommissionRate: null, limitPerUser: 4, participantFields: { idCard: false, discount: false }, detail: '不会打没关系，来了就会。广州天河 / 番禺 / 南沙三个场地任选其一，报名时选择就近场地即可。' },
  { id: 3, category: 2, city: '大理', title: '云南大理 · 苍山洱海5日研学之旅（20人成团）', cover: '🏔️', coverTone: 'linear-gradient(135deg,#2b6f9c,#8fc6e7)', price: 2980, memberPrice: 2780, originalPrice: 3280, minGroup: 20, maxGroup: 36, soldCount: 23, highlight: '慢慢游不赶景点', points: ['全程领队+地接导游', '含4晚住宿和特色餐'], time: '5天4晚 · 每周一发团', address: '大理古城集合', skuLabel: '房型', hasSku: true, skus: [{ id: 'sku1', name: '标间', price: 2980, memberPrice: 2780, hot: false, address: '大理古城南门游客中心集合' }, { id: 'sku2', name: '单间', price: 3630, memberPrice: 3380, hot: true, address: '大理古城南门游客中心集合' }], schedules: makeSchedules(2, 4, 36, '第1天 08:00集合'), refundRule: { type: 'ladder', ladder: [{ days: 15, rate: 1 }, { days: 7, rate: 0.7 }, { days: 3, rate: 0.4 }, { days: 0, rate: 0 }] }, managerCommissionRate: 10, limitPerUser: 4, participantFields: { idCard: true, discount: true }, detail: '洱海骑行、白族扎染、古城漫步。' },
  { id: 4, category: 2, city: '敦煌', title: '敦煌丝路 · 文化研学7日深度游', cover: '🏜️', coverTone: 'linear-gradient(135deg,#b04a2f,#e4b877)', price: 5980, memberPrice: 5580, originalPrice: 6480, minGroup: 16, maxGroup: 30, soldCount: 14, highlight: '专业文化讲师随团讲解', points: ['莫高窟、鸣沙山都含门票', '含全程住宿餐饮'], time: '7天6晚 · 每月月中发团', address: '敦煌机场接站', hasSku: false, schedules: makeSchedules(3, 3, 30, '第1天 全天接站'), refundRule: { type: 'ladder', ladder: [{ days: 15, rate: 1 }, { days: 7, rate: 0.7 }, { days: 3, rate: 0.4 }, { days: 0, rate: 0 }] }, managerCommissionRate: null, limitPerUser: 4, participantFields: { idCard: true, discount: true }, detail: '跟着讲师看敦煌壁画，听丝路故事。' },
  { id: 5, category: 3, city: '线上', title: '手机摄影入门 · 系列课（6节）', cover: '📷', coverTone: 'linear-gradient(135deg,#3b6fa0,#7fb3d5)', price: 199, memberPrice: 159, originalPrice: 259, minGroup: 0, maxGroup: 60, soldCount: 41, highlight: '老师手把手教，交作业有点评', points: ['每周1节共6节', '可回放1年'], time: '每周三 14:00-15:30', address: '线上直播', hasSku: false, schedules: makeSchedules(0, 5, 60, '14:00-15:30'), refundRule: { type: 'day', fullDays: 2, partialDays: 0, partialRate: 0 }, managerCommissionRate: null, limitPerUser: 4, participantFields: { idCard: false, discount: false }, detail: '从拿稳手机到拍出好看的照片。' },
  { id: 6, category: 3, city: '北京', title: '声乐合唱 · 快乐课堂（10节）', cover: '🎤', coverTone: 'linear-gradient(135deg,#b04a6b,#e29abb)', price: 99, memberPrice: 79, originalPrice: 129, minGroup: 10, maxGroup: 30, soldCount: 17, highlight: '专业声乐老师，零基础也能唱', points: ['小班教学', '结课合唱展示'], time: '每周五 14:00-15:30', address: '东城区老年活动中心', hasSku: false, schedules: makeSchedules(1, 4, 30, '14:00-15:30'), refundRule: { type: 'day', fullDays: 2, partialDays: 0, partialRate: 0 }, managerCommissionRate: null, limitPerUser: 4, participantFields: { idCard: false, discount: false }, detail: '一起唱歌，心情好。' },
  { id: 7, category: 4, city: '北京', title: '肩颈理疗 · 到店体验套餐', cover: '💆', coverTone: 'linear-gradient(135deg,#2f7d5c,#7cc79a)', price: 128, memberPrice: 98, originalPrice: 168, minGroup: 0, maxGroup: 200, soldCount: 76, highlight: '专业理疗师，按需到店核销', points: ['到店出示核销码', '提前1天电话预约'], time: '到店核销 · 3个月内有效', address: '合作门店', hasSku: false, schedules: makeSchedules(0, 3, 200, '到店时间请提前预约'), refundRule: { type: 'always' }, managerCommissionRate: null, limitPerUser: 1, participantFields: { idCard: false, discount: false }, detail: '45分钟肩颈舒缓。' }
].map((a) => ({
  ...a,
  city: ({ 1: '南沙', 2: '天河、番禺', 3: '多地区', 4: '多地区', 5: '线上', 6: '黄埔、天河', 7: '番禺、顺德' })[a.id] || a.city,
  regionIds: ({
    1: ['nansha'],
    2: ['tianhe', 'panyu', 'nansha'],
    3: ['nansha', 'huangpu', 'tianhe', 'panyu', 'shunde'],
    4: ['nansha', 'huangpu', 'tianhe', 'panyu', 'shunde'],
    5: [],
    6: ['huangpu', 'tianhe'],
    7: ['panyu', 'shunde']
  })[a.id] || [],
  managerId: a.id <= 4 ? 1001 : 1002,
  detailBlocks: [
    { type: 'text', text: a.detail },
    { type: 'image', emoji: a.cover, tone: a.coverTone, caption: '活动实景' },
    { type: 'image', emoji: '🏞️', tone: a.coverTone, caption: '行程/环境展示' },
    { type: 'video', emoji: '🎬', tone: a.coverTone, caption: '活动视频', url: '' }
  ],
  images: [
    { id: `img-${a.id}-1`, tone: a.coverTone, emoji: a.cover, label: '实景展示' },
    { id: `img-${a.id}-2`, tone: a.coverTone, emoji: '🏞️', label: '行程/环境' },
    { id: `img-${a.id}-3`, tone: a.coverTone, emoji: '🏨', label: '住宿/服务' }
  ],
  buyers: [
    { avatar: '👵', name: '张**', time: '2小时前' },
    { avatar: '👴', name: '李**', time: '5小时前' },
    { avatar: '👩', name: '王**', time: '1天前' }
  ]
}))

const products = [
  {
    id: 8,
    managerId: 1002,
    regionIds: ['nansha', 'huangpu', 'tianhe', 'panyu', 'shunde'],
    city: '多地区',
    category: 5,
    title: '岁悦里定制保温杯 · 便携款',
    cover: '🥤',
    coverTone: 'linear-gradient(135deg,#7a5cae,#b39ddb)',
    price: 69,
    memberPrice: 59,
    originalPrice: 89,
    soldCount: 128,
    highlight: '大容量，单手开盖',
    points: ['500ml容量', '316不锈钢内胆', '全国包邮'],
    sellType: 'sku',
    hasSku: true,
    skuLabel: '规格',
    skus: [
      { id: 'sku-white', name: '经典白 500ml', price: 69, memberPrice: 59, hot: false },
      { id: 'sku-blue', name: '星空蓝 500ml', price: 69, memberPrice: 59, hot: true },
      { id: 'sku-pink', name: '樱花粉 500ml', price: 69, memberPrice: 59, hot: false }
    ],
    stock: 500,
    limitPerUser: 5,
    refundRule: { type: 'always' },
    status: 1,
    detail: '出门带上热水，保温约12小时。'
  }
]

const managers = [
  { id: 1001, name: '李秀兰', shopName: '秀兰乐活活动社', shopIntro: '专注同城兴趣活动与品质研学旅行，用心陪伴每一次出发。', phone: '138****2035', inviteCode: 'SYL001', commissionRate: 8, status: 1, totalPerformance: 18640, totalCommission: 12840.6, totalCustomers: 86, customers: 86, monthPerformance: 18640, monthCommission: 1491.2, pending: 648, available: 1260.5, total: 12840.6 }
  ,
  { id: 1002, name: '王建国', shopName: '建国品质生活馆', shopIntro: '精选实用课程、健康服务与生活好物，让日常更轻松。', phone: '139****7782', inviteCode: 'SYL002', commissionRate: 8, status: 1, totalPerformance: 9260, totalCommission: 7220.4, totalCustomers: 42, customers: 42, monthPerformance: 9260, monthCommission: 740.8, pending: 322, available: 588, total: 7220.4 }
]

const customers = [
  { id: 'u1', name: '张桂芳', phone: '138****6688', member: true, balance: 0, points: 120, memberLevel: 4, memberSince: '2026年9月', memberExpireAt: '长期有效', managerId: null, isManager: false },
  { id: 'u2', name: '刘淑华', phone: '136****2031', member: true, balance: 0, points: 60, memberLevel: 2, memberSince: '2026年9月', memberExpireAt: '长期有效', managerId: 1001, isManager: false },
  { id: 'u3', name: '李建国', phone: '135****8820', member: true, balance: 0, points: 40, memberLevel: 2, memberSince: '2026年9月', memberExpireAt: '长期有效', managerId: 1001, isManager: false }
]

const coupons = [
  { id: 1, type: 1, title: '10元无门槛券', desc: '全场通用', value: 10, minAmount: 0, expireAt: '2026-12-31', used: false },
  { id: 2, type: 2, title: '100元满减券', desc: '满2000元可用', value: 100, minAmount: 2000, expireAt: '2026-12-31', used: false },
  { id: 3, type: 3, title: '研学旅行50元券', desc: '仅限研学旅行使用', value: 50, minAmount: 500, scopeCategory: 2, expireAt: '2026-12-31', used: false },
  { id: 4, type: 4, title: '保温杯专属20元券', desc: '仅限指定商品使用', value: 20, minAmount: 0, scopeProductId: 8, expireAt: '2026-12-31', used: false }
]

const participants = [
  { id: 1, name: '张桂芳', idCard: '1101**********4821', phone: '138****6688' },
  { id: 2, name: '李明', idCard: '', phone: '136****2210' },
  { id: 3, name: '王秀英', idCard: '1101**********9302', phone: '135****3401' }
]

const addresses = [
  { id: 'addr1', userId: 'u1', name: '张桂芳', phone: '138****6688', province: '北京市', city: '北京市', district: '朝阳区', detail: '幸福里小区1号楼1单元101', isDefault: true }
]

const cards = [
  {
    id: 'card1',
    userId: 'u1',
    title: '声乐合唱10次培训卡',
    courseName: '声乐合唱基础班',
    teacher: '陈老师',
    validUntil: '2026-12-31',
    remain: 7,
    total: 10,
    attendanceRecords: [
      { id: 'att1', date: '2026-08-29', time: '14:00-15:30', lesson: '第1课 · 呼吸与发声', teacher: '陈老师', location: '东城区老年活动中心', status: 'checked', checkedAt: '2026-08-29 13:52' },
      { id: 'att2', date: '2026-09-05', time: '14:00-15:30', lesson: '第2课 · 音准练习', teacher: '陈老师', location: '东城区老年活动中心', status: 'checked', checkedAt: '2026-09-05 13:56' },
      { id: 'att3', date: '2026-09-12', time: '14:00-15:30', lesson: '第3课 · 节奏训练', teacher: '陈老师', location: '东城区老年活动中心', status: 'checked', checkedAt: '2026-09-12 13:49' },
      { id: 'att4', date: '2026-09-16', time: '14:00-15:30', lesson: '第4课 · 合唱配合', teacher: '陈老师', location: '东城区老年活动中心', status: 'absent', checkedAt: '' },
      { id: 'att5', date: '2026-09-26', time: '14:00-15:30', lesson: '第5课 · 分声部练习', teacher: '陈老师', location: '东城区老年活动中心', status: 'upcoming', checkedAt: '' }
    ]
  }
]

const reviews = [
  { id: 'rv1', activityId: 1, orderId: null, name: '刘阿姨', rating: 5, content: '领队很耐心，走得慢，适合我们这些不常运动的人。', time: '2天前' },
  { id: 'rv2', activityId: 1, orderId: null, name: '王叔叔', rating: 5, content: '认识了几个新朋友，下次还来。', time: '5天前' }
]

const orders = [
  {
    id: 'SYL20260908001', userId: 'u1', activityId: 1, title: '秋日徒步 · 香山赏红叶（15人成团）', category: 1, cover: '🍁', coverTone: 'linear-gradient(135deg,#c96b2a,#f1b35a)',
    skuName: '', schedule: activities[0].schedules[0], participants: '张桂芳、李明', count: 2, memberPrice: 79, payAmount: 148, discount: 10,
    status: '待发货', coupon: '10元无门槛券', couponId: 1, code: '8236 1940', managerId: 1001, commissionRate: 12, commissionAmount: 17.76, address: null, createdAt: '2026-09-08 10:26', payDeadline: null
  }
]

const commissions = [
  { id: 'CM20260828001', managerId: 1001, orderId: 'SYL20260828012', customerId: 'u2', customerName: '刘淑华', productName: '云南大理研学之旅', payAmount: 2780, commissionRate: 8, commissionAmount: 222.4, status: '可结算', createTime: '2026-08-28 14:20' },
  { id: 'CM20260812001', managerId: 1001, orderId: 'SYL20260812033', customerId: 'u1', customerName: '张桂芳', productName: '秋日徒步', payAmount: 158, commissionRate: 8, commissionAmount: 12.64, status: '待结算', createTime: '2026-09-08 10:26' }
]

const withdraws = []
const managerApplications = [
  { id: 'APP1', name: '赵淑敏', phone: '137****1122', scale: '5个群，约800人', fields: ['徒步', '合唱'], intro: '退休教师，喜欢组织活动', status: '待审核', submittedAt: '2026-09-10 09:00' }
]
const bindings = [
  { id: 'B1', customerId: 'u2', customerName: '刘淑华', managerId: 1001, bindSource: 1, bindTime: '2026-08-18 10:00', status: 1 },
  { id: 'B2', customerId: 'u3', customerName: '李建国', managerId: 1001, bindSource: 2, bindTime: '2026-08-22 15:30', status: 1 }
]

const lives = [
  {
    id: 'live1',
    title: '手机摄影入门：从会拍到拍得好',
    cover: '📷',
    coverTone: 'linear-gradient(135deg,#3b6fa0,#7fb3d5)',
    hostName: '陈老师',
    hostAvatar: '🧑‍🏫',
    managerId: null,
    status: 'live',
    startAt: '2026-09-19 19:30',
    endAt: '2026-09-19 20:30',
    streamUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    replayUrl: '',
    description: '零基础手机摄影入门，直播手把手教学，可实时提问互动。',
    memberPrice: 99,
    originalPrice: 159,
    lessonCount: 12,
    duration: '约240分钟',
    category: '手机摄影',
    coverImage: '/assets/event-academy.jpg',
    activityId: 5,
    viewers: 128,
    createdAt: '2026-09-19 10:00'
  },
  {
    id: 'live2',
    title: '四季养生：吃得明白，睡得安稳',
    cover: '🍵',
    coverTone: 'linear-gradient(135deg,#2f7d5c,#7cc79a)',
    hostName: '李秀兰',
    hostAvatar: '👵',
    managerId: null,
    status: 'ended',
    startAt: '2026-09-20 15:00',
    endAt: '2026-09-20 16:00',
    streamUrl: '',
    replayUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    description: '用通俗易懂的方法分享四季饮食、睡眠和日常活动知识。',
    memberPrice: 69,
    originalPrice: 99,
    lessonCount: 8,
    duration: '约160分钟',
    category: '健康生活',
    coverImage: '/assets/event-benefit.jpg',
    activityId: null,
    viewers: 0,
    createdAt: '2026-09-19 09:00'
  },
  {
    id: 'live3',
    title: '山水人文课：跟着老师读懂大理',
    cover: '🏔️',
    coverTone: 'linear-gradient(135deg,#2b6f9c,#8fc6e7)',
    hostName: '王建国',
    hostAvatar: '👴',
    managerId: null,
    status: 'ended',
    startAt: '2026-09-18 19:00',
    endAt: '2026-09-18 20:00',
    streamUrl: '',
    replayUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    description: '从山水地理到白族文化，在出发前先读懂大理的故事。',
    memberPrice: 129,
    originalPrice: 199,
    lessonCount: 10,
    duration: '约210分钟',
    category: '文化旅行',
    coverImage: '/assets/event-travel.jpg',
    activityId: 3,
    viewers: 86,
    createdAt: '2026-09-18 15:00'
  },
  {
    id: 'live4',
    title: '智能手机轻松用：常用功能一步一步学',
    cover: '📱',
    coverTone: 'linear-gradient(135deg,#617a74,#a8b9a7)',
    hostName: '周老师',
    hostAvatar: '🧑‍🏫',
    managerId: null,
    status: 'ended',
    startAt: '2026-09-10 14:00',
    endAt: '2026-09-10 15:30',
    streamUrl: '',
    replayUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    description: '从扫码、拍照到微信常用功能，放慢速度逐步讲清楚。',
    memberPrice: 79,
    originalPrice: 129,
    lessonCount: 9,
    duration: '约180分钟',
    category: '智能生活',
    coverImage: '/assets/home-hero.jpg',
    activityId: null,
    viewers: 236,
    createdAt: '2026-09-10 16:00'
  }
]

const banners = [
  { id: 1, title: '香山赏红叶 · 本周出发', sub: '15人成团 · 会员价¥79起', tone: 'linear-gradient(135deg,#c96b2a,#f1b35a)', emoji: '🍁', cat: 1 },
  { id: 2, title: '大理5日研学 · 慢慢游', sub: '全程领队 · 会员价¥2780起', tone: 'linear-gradient(135deg,#2b6f9c,#8fc6e7)', emoji: '🏔️', cat: 2 },
  { id: 3, title: '免费入会领2张券', sub: '会员价更划算，本单最高省¥100', tone: 'linear-gradient(135deg,#c25e3d,#e19a6d)', emoji: '🎁', cat: 0 }
]

const contentPosts = [
  {
    id: 'news-1',
    type: 'news',
    title: '便民服务信息：长者公共文化活动参与指引',
    summary: '汇总公共文化场馆、社区活动和便民服务的参与方式，具体安排以政府部门最新公告为准。',
    source: '政府公开信息（示例）',
    publishedAt: '2026-09-18',
    coverImage: '/assets/event-local.jpg',
    originalUrl: '',
    content: '本栏目用于转载和解读政府部门公开发布的便民资讯。正式发布时请填写准确来源、发布日期及原文链接，并以原文内容为准。',
    regionIds: ['nansha', 'huangpu', 'tianhe', 'panyu', 'shunde'],
    featured: true,
    status: 1
  },
  {
    id: 'news-2',
    type: 'news',
    title: '社区养老与文体服务信息集中发布',
    summary: '及时了解各区适老服务、文化活动和办事提醒。',
    source: '政府公开信息（示例）',
    publishedAt: '2026-09-16',
    coverImage: '/assets/event-benefit.jpg',
    originalUrl: '',
    content: '平台将持续整理公开渠道发布的信息，方便会员查看。涉及申报、补贴和办事条件时，请以政府官网及主管部门解释为准。',
    regionIds: ['nansha', 'huangpu', 'tianhe', 'panyu', 'shunde'],
    featured: true,
    status: 1
  },
  {
    id: 'video-1',
    type: 'video',
    title: '看懂适老化便民服务，一次讲清办理要点',
    summary: '用几分钟了解常见便民服务的查询与办理方式。',
    source: '岁悦里视频号',
    publishedAt: '2026-09-17',
    coverImage: '/assets/home-hero.jpg',
    videoUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    content: '视频内容仅作办事指引，具体要求请以主管部门最新公告为准。',
    regionIds: [],
    featured: true,
    status: 1
  }
]

const config = {
  regions: [
    { id: 'nansha', name: '南沙', enabled: true, sort: 10 },
    { id: 'huangpu', name: '黄埔', enabled: true, sort: 20 },
    { id: 'tianhe', name: '天河', enabled: true, sort: 30 },
    { id: 'panyu', name: '番禺', enabled: true, sort: 40 },
    { id: 'shunde', name: '顺德', enabled: true, sort: 50 }
  ],
  globalCommissionRate: 8,
  minWithdraw: 100,
  withdrawMonthlyLimit: 1,
  withdrawTaxRate: 20,
  managerApplyFee: 199,
  brand: {
    slogan: '和同龄人一起，玩得开心又省心'
  },
  assistant: {
    name: '小助理',
    wechat: 'suiyueli6070',
    phone: '400-800-6070',
    avatar: '🧑‍💼',
    intro: '报名咨询、活动群、售后都可以找我'
  },
  filing: {
    companyName: '北京岁悦里科技有限公司',
    icp: '京ICP备2025001234号-1',
    police: ''
  }
}

export const seed = {
  categories,
  banners,
  contentPosts,
  activities,
  products,
  managers,
  managerApplications,
  customers,
  coupons,
  participants,
  addresses,
  cards,
  reviews,
  orders,
  commissions,
  withdraws,
  bindings,
  lives,
  logs: [],
  config
}
