const store = require('../../utils/store.js')

const DEFAULT_CARRIERS = [
  { code: 'SF', name: '顺丰速运' }, { code: 'JD', name: '京东物流' },
  { code: 'ZTO', name: '中通快递' }, { code: 'YTO', name: '圆通速递' },
  { code: 'YD', name: '韵达快递' }, { code: 'STO', name: '申通快递' },
  { code: 'JTSD', name: '极兔速递' }, { code: 'EMS', name: '邮政EMS' },
  { code: 'DBL', name: '德邦快递' }
]
const AUTO_CARRIER = { code: '', name: '自动识别快递公司' }
const OTHER_CARRIER = { code: '__OTHER__', name: '其他快递（查询指引）' }
const PHONE_GUIDANCE = '请补填收件人或寄件人手机号后4位，再点击查询物流。'
const JD_GUIDANCE = '请向发件商家索取10位青龙商家编码；没有编码时，可复制单号到京东物流官方渠道查询。'
const isOrderNumber = (value) => /^(?:SYL|JF\d)/i.test(value)

function errorGuidance(error) {
  if (error.statusCode === 400) return '请按提示核对快递公司、单号及验证信息，补填正确资料后重试。'
  if (error.statusCode === 503) return '请联系客服核实物流查询服务权限或剩余额度；也可复制单号到承运商官方渠道查询。'
  if (error.statusCode === 429) return '请等待片刻再重试，或复制单号到承运商官方渠道查询。'
  if ([502, 504].includes(error.statusCode)) return '物流查询服务暂时响应异常，请稍后重试；也可复制单号到承运商官方渠道查询。'
  return '请检查网络并重试；也可复制快递单号到承运商官方渠道查询。'
}

Page({
  data: {
    query: '',
    loading: false,
    searched: false,
    order: null,
    logistics: null,
    events: [],
    errorText: '',
    brandName: '',
    carriers: [AUTO_CARRIER, ...DEFAULT_CARRIERS, OTHER_CARRIER],
    carrierOptions: [AUTO_CARRIER, ...DEFAULT_CARRIERS, OTHER_CARRIER],
    carrierSearch: '',
    carrierIndex: 0,
    carrierCode: '',
    carrierName: AUTO_CARRIER.name,
    phoneLast4: '',
    jdCustomerCode: '',
    requiredField: '',
    resultState: '',
    resultTitle: '',
    guidance: '',
    copyNumber: ''
  },

  async onLoad(options = {}) {
    await store.ready()
    await Promise.all([store.refreshConfig().catch(() => {}), this.loadCarriers()])
    if (this.unloaded) return
    this.setData({ brandName: store.getBrand().chineseName })
    const query = this.normalizeQuery(options.query || '')
    if (query) {
      this.setData({ query })
      this.queryLogistics()
    }
  },

  async onShow() {
    try {
      await store.refreshConfig()
      if (this.unloaded) return
      this.setData({ brandName: store.getBrand().chineseName })
    } catch (e) {}
  },

  normalizeQuery(value) {
    return String(value || '').replace(/\s+/g, '').trim()
  },

  async loadCarriers() {
    let items = DEFAULT_CARRIERS
    try {
      const result = await store.getLogisticsCarriers()
      const unique = new Map()
      ;(Array.isArray(result) ? result : []).forEach((item) => {
        if (item && /^[A-Za-z0-9_-]{1,64}$/.test(item.code) && typeof item.name === 'string' && item.name.trim() && item.code !== OTHER_CARRIER.code) {
          unique.set(item.code, { code: item.code, name: item.name.trim() })
        }
      })
      if (unique.size) items = [...unique.values()]
    } catch (error) {}
    if (this.unloaded) return
    const current = this.data.carriers.find((item) => item.code === this.data.carrierCode)
    if (current && current.code && current.code !== OTHER_CARRIER.code && !items.some((item) => item.code === current.code)) items = [...items, current]
    const carriers = [AUTO_CARRIER, ...items, OTHER_CARRIER]
    this.setData({ carriers, carrierName: (carriers.find((item) => item.code === this.data.carrierCode) || AUTO_CARRIER).name })
    this.filterCarriers()
  },

  onCarrierSearch(e) {
    this.setData({ carrierSearch: String(e.detail.value || '').trim() })
    this.filterCarriers()
  },

  filterCarriers() {
    const query = this.data.carrierSearch.toLowerCase()
    const carrierOptions = this.data.carriers.filter((item) => !query || !item.code || item.code === this.data.carrierCode || item.code === OTHER_CARRIER.code || item.name.toLowerCase().includes(query))
    const carrierIndex = Math.max(0, carrierOptions.findIndex((item) => item.code === this.data.carrierCode))
    this.setData({ carrierOptions, carrierIndex })
  },

  updateQuery(value) {
    const changed = this.normalizeQuery(value) !== this.normalizeQuery(this.data.query)
    this.invalidateQuery()
    const changes = { query: value }
    if (changed) {
      changes.phoneLast4 = ''
      changes.jdCustomerCode = ''
      if (!this.carrierManuallySelected) {
        Object.assign(changes, { carrierCode: '', carrierIndex: 0, carrierName: AUTO_CARRIER.name })
        this.directQueryRequested = false
      }
    }
    this.setData(changes)
  },

  onInput(e) {
    this.updateQuery(e.detail.value)
  },

  clearQuery() {
    this.updateQuery('')
    this.setData({ phoneLast4: '', jdCustomerCode: '' })
  },

  onCarrierChange(e) {
    const index = Number(e.detail.value)
    const carrier = this.data.carrierOptions[index]
    if (!Number.isInteger(index) || !carrier) return
    this.invalidateQuery()
    this.carrierManuallySelected = Boolean(carrier.code)
    this.directQueryRequested = Boolean(carrier.code)
    this.setData({ carrierIndex: index, carrierCode: carrier.code, carrierName: carrier.name, phoneLast4: '', jdCustomerCode: '' })
  },

  onPhoneInput(e) {
    this.invalidateQuery()
    this.directQueryRequested = true
    this.setData({ phoneLast4: String(e.detail.value || '').replace(/\D/g, '') })
  },

  onJdCodeInput(e) {
    this.invalidateQuery()
    this.directQueryRequested = true
    this.setData({ jdCustomerCode: String(e.detail.value || '').trim() })
  },

  invalidateQuery() {
    this.queryVersion = (this.queryVersion || 0) + 1
    this.setData({ loading: false, searched: false, order: null, logistics: null, events: [], errorText: '', resultState: '', resultTitle: '', guidance: '', copyNumber: '', requiredField: '' })
  },

  onUnload() {
    this.queryVersion = (this.queryVersion || 0) + 1
    this.unloaded = true
    this.data.phoneLast4 = ''
    this.data.jdCustomerCode = ''
  },

  pasteQuery() {
    wx.getClipboardData({
      success: (result) => {
        if (this.unloaded) return
        const query = this.normalizeQuery(result.data)
        if (!query) {
          wx.showToast({ title: '剪贴板中没有订单号', icon: 'none' })
          return
        }
        this.updateQuery(query)
      },
      fail: () => wx.showToast({ title: '读取剪贴板失败，请手动输入', icon: 'none' })
    })
  },

  showDirectResult(result, trackingNo, ownOrder = null) {
    if (!result || typeof result !== 'object') throw new Error('物流服务未返回结果，请稍后重试')
    const rawEvents = Array.isArray(result.events) ? result.events : []
    const status = result.queryStatus || (rawEvents.length ? 'ok' : 'no_tracking')
    const state = status === 'ok' && !rawEvents.length ? 'no_tracking' : status
    const verification = state === 'verification_required'
    const requiredField = ['phoneLast4', 'jdCustomerCode'].includes(result.requiredField) ? result.requiredField : ''
    const code = requiredField === 'phoneLast4' ? 'SF' : requiredField === 'jdCustomerCode' ? 'JD' : result.carrierCode
    if (verification && ['SF', 'JD'].includes(code)) {
      let carriers = this.data.carriers
      if (!carriers.some((item) => item.code === code)) carriers = [...carriers.slice(0, -1), DEFAULT_CARRIERS.find((item) => item.code === code), OTHER_CARRIER]
      const carrierIndex = carriers.findIndex((item) => item.code === code)
      this.directQueryRequested = true
      const sensitive = code !== this.data.carrierCode ? { phoneLast4: '', jdCustomerCode: '' } : {}
      if (code !== this.data.carrierCode) this.carrierManuallySelected = false
      this.setData({ ...sensitive, carriers, carrierOptions: carriers, carrierSearch: '', carrierIndex, carrierCode: code, carrierName: carriers[carrierIndex].name })
    }
    const events = state === 'ok' ? rawEvents : []
    const guidance = result.guidance || (verification ? (code === 'SF' ? PHONE_GUIDANCE : JD_GUIDANCE) : '请核对单号和快递公司；刚发货的包裹可稍后重试，也可复制单号到承运商官方渠道查询。')
    this.setData({
      searched: true,
      order: ownOrder ? { ...ownOrder, carrier: result.carrier || ownOrder.carrier } : { id: '', title: '快递物流', trackingNo, carrier: result.carrier || '自动识别', external: true },
      logistics: { ...result, latestDescription: events.length ? result.latestDescription : '', lastSyncedAt: result.queriedAt || '' },
      events, resultState: state, requiredField,
      resultTitle: verification ? '需要补充查询资料' : state === 'ok' ? '已获取物流动态' : '暂未查到物流轨迹',
      errorText: state === 'ok' ? '' : (result.reason || (verification ? '承运商需要验证信息后才能查询。' : '当前还没有可展示的物流轨迹。')),
      guidance: state === 'ok' ? '' : guidance,
      copyNumber: trackingNo
    })
  },

  retryQuery() {
    return this.queryLogistics()
  },

  copyTrackingNumber() {
    const number = this.data.copyNumber || this.normalizeQuery(this.data.query)
    if (!number || isOrderNumber(number) || !/^[A-Za-z0-9-]{6,32}$/.test(number)) {
      wx.showToast({ title: '请先查询获取快递单号', icon: 'none' })
      return
    }
    wx.setClipboardData({ data: number, success: () => {
      if (!this.unloaded) wx.showToast({ title: '单号已复制，请到承运商官方渠道查询', icon: 'none' })
    } })
  },

  async queryLogistics() {
    if (this.data.loading || this.unloaded) return
    const query = this.normalizeQuery(this.data.query)
    if (!query) {
      wx.showToast({ title: '请输入订单号', icon: 'none' })
      return
    }

    const version = this.queryVersion = (this.queryVersion || 0) + 1
    const isCurrent = () => !this.unloaded && version === this.queryVersion
    const { carrierCode, phoneLast4, jdCustomerCode } = this.data
    const directRequested = this.directQueryRequested || Boolean(carrierCode || phoneLast4 || jdCustomerCode)
    this.setData({ query, loading: true, searched: false, order: null, logistics: null, events: [], errorText: '', resultState: '', resultTitle: '', guidance: '', copyNumber: '' })
    try {
      await store.requireLogin()
      if (!isCurrent()) return
      // 后台发货会修改运单号和订单状态，不能用首次进入小程序时的订单缓存。
      const orders = await store.refreshOrders()
      if (!isCurrent()) return
      const key = query.toUpperCase()
      const order = (orders || []).find((item) => {
        return String(item.id || '').toUpperCase() === key || String(item.trackingNo || '').toUpperCase() === key
      })

      if (!order && isOrderNumber(query)) {
        this.setData({ searched: true, resultState: 'not_found', resultTitle: '未找到本账号的订单', errorText: '请确认订单号和当前登录账号。', guidance: '可从“我的订单”进入订单详情，或向商家索取快递单号后查询。' })
        return
      }

      if (order && !order.trackingNo && (!order.logisticsShipmentId || directRequested)) {
        this.setData({
          searched: true,
          order,
          errorText: order.status === '待发货' ? '订单正在等待商家发货，发货后即可查询物流' : '该订单暂无物流信息',
          resultState: 'awaiting_shipment', resultTitle: '订单尚无快递单号', guidance: '请查看订单详情，或联系发件商家确认发货情况。'
        })
        return
      }

      if (!order || directRequested) {
        const trackingNo = order ? order.trackingNo : query
        if (carrierCode === OTHER_CARRIER.code) {
          this.setData({ searched: true, order: order || null, resultState: 'other_carrier', resultTitle: '请通过承运商官方渠道查询', copyNumber: trackingNo, errorText: '列表中未找到这家快递公司。', guidance: '复制快递单号，在承运商官方渠道查询，或联系发件商家协助核实。' })
          return
        }
        if (carrierCode === 'SF' && !/^\d{4}$/.test(phoneLast4)) {
          this.showDirectResult({ queryStatus: 'verification_required', requiredField: 'phoneLast4', carrierCode: 'SF', carrier: '顺丰速运', guidance: PHONE_GUIDANCE }, trackingNo, order)
          return
        }
        if (carrierCode === 'JD' && !/^[A-Za-z0-9]{10}$/.test(jdCustomerCode)) {
          this.showDirectResult({ queryStatus: 'verification_required', requiredField: 'jdCustomerCode', carrierCode: 'JD', carrier: '京东物流', reason: '请填写发件商家提供的10位字母或数字青龙商家编码。', guidance: JD_GUIDANCE }, trackingNo, order)
          return
        }
        this.setData({ copyNumber: trackingNo })
        const logistics = await store.queryLogistics(trackingNo, {
          carrierCode,
          phoneLast4: carrierCode === 'SF' ? phoneLast4 : '',
          jdCustomerCode: carrierCode === 'JD' ? jdCustomerCode : ''
        })
        if (!isCurrent()) return
        this.showDirectResult(logistics, trackingNo, order)
        return
      }

      this.setData({ copyNumber: order.trackingNo || '' })

      let logistics = await store.getOrderLogistics(order.id)
      if (!isCurrent()) return
      let refreshError = null
      const lastUpdate = Math.max(...['lastSyncedAt', 'lastQueryAt'].map((key) => {
        const time = Date.parse(String(logistics && logistics[key] || '').replace(' ', 'T'))
        return Number.isFinite(time) ? time : 0
      }))
      // 最近查询/推送的轨迹可直接使用；旧轨迹由服务端向快递鸟刷新。
      if (!lastUpdate || Date.now() - lastUpdate >= 30000) {
        try {
          logistics = await store.refreshOrderLogistics(order.id) || logistics
        } catch (error) {
          if (error.code === 'AUTH_REQUIRED' || [401, 403].includes(error.statusCode)) throw error
          refreshError = error
          // 另一端可能刚刷新过；限流时只重读缓存，不连续调用快递查询接口。
          if (error.statusCode === 429) {
            logistics = await store.getOrderLogistics(order.id).catch(() => null) || logistics
          }
        }
      }
      if (!isCurrent()) return
      if (logistics && logistics.queryStatus === 'verification_required' && !refreshError) {
        this.showDirectResult(logistics, order.trackingNo || '', order)
        return
      }
      const events = [...((logistics && logistics.events) || [])].reverse()
      const errorText = refreshError
        ? (events.length ? (refreshError.statusCode === 429 ? '刷新较频繁，已显示最近一次物流，请稍后再试' : '暂时无法更新物流，已显示最近一次记录') : (refreshError.message || '物流信息正在同步，请稍后再试'))
        : (logistics ? logistics.subscriptionError || '' : '物流信息正在同步，请稍后再试')
      this.setData({
        searched: true,
        order,
        logistics,
        events,
        errorText,
        resultState: refreshError ? 'error' : events.length ? 'ok' : 'no_tracking',
        resultTitle: refreshError ? '物流更新暂未成功' : events.length ? '已获取物流动态' : '暂未查到物流轨迹',
        guidance: refreshError ? errorGuidance(refreshError) : errorText || !events.length ? '可稍后重试，或选择快递公司并补充查询资料；也可复制单号到承运商官方渠道查询。' : ''
      })
    } catch (error) {
      if (!isCurrent() || (error && error.code === 'AUTH_REQUIRED')) return
      this.setData({ searched: true, resultState: 'error', resultTitle: error.statusCode === 429 ? '查询较频繁，请稍后重试' : '查询暂未成功', errorText: error.message || '查询失败，请稍后重试', guidance: errorGuidance(error) })
    } finally {
      if (isCurrent()) this.setData({ loading: false })
    }
  },

  goOrderDetail() {
    if (!this.data.order || !this.data.order.id || this.data.order.external) return
    wx.navigateTo({ url: `/pages/order-detail/order-detail?id=${this.data.order.id}` })
  }
})
