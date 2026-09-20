const store = require('../../utils/store.js')

Page({
  data: {
    form: {
      name: '',
      phone: '',
      groupCount: '',
      memberCount: '',
      fields: [],
      intro: ''
    },
    agree: false,
    fee: 0,
    payOpen: false,
    errors: {},
    statusView: '',
    fieldOptions: [
      { name: '徒步', selected: false },
      { name: '掼蛋', selected: false },
      { name: 'K歌', selected: false },
      { name: '研学旅行', selected: false },
      { name: '摄影', selected: false },
      { name: '合唱', selected: false }
    ]
  },

  async onLoad() {
    await store.ready()
    const state = store.get()
    const config = state.config || {}
    const statusView = state.isManager
      ? '您已经是主理人，可在个人中心进入主理人工作台'
      : (state.application && state.application.status === '待审核' ? '申请已提交，预计1-2个工作日审核' : '')
    this.setData({
      fee: Number(config.managerApplyFee ?? 0),
      statusView,
      'form.name': state.user.name || '',
      'form.phone': state.user.phone || ''
    })
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`form.${field}`]: e.detail.value })
  },

  toggleField(e) {
    const field = e.currentTarget.dataset.field
    const fieldOptions = this.data.fieldOptions.map((item) =>
      item.name === field ? { ...item, selected: !item.selected } : item
    )
    const fields = this.data.form.fields.slice()
    const index = fields.indexOf(field)
    if (index >= 0) {
      fields.splice(index, 1)
    } else {
      fields.push(field)
    }
    this.setData({ 'form.fields': fields, fieldOptions })
  },

  toggleAgree() {
    this.setData({ agree: !this.data.agree })
  },

  async submit() {
    const { form, agree } = this.data
    const errors = {}
    const groupCount = Number(form.groupCount)
    const memberCount = Number(form.memberCount)
    if (!form.groupCount || !Number.isInteger(groupCount) || groupCount < 1 || groupCount > 50) errors.groupCount = '请填写1-50的微信群数量'
    if (!form.memberCount || !Number.isInteger(memberCount) || memberCount < 1 || memberCount > 5000) errors.memberCount = '请填写1-5000的社群总人数'
    if (!agree) errors.agree = '请先阅读并同意协议'
    this.setData({ errors })
    if (Object.keys(errors).length) {
      wx.showToast({ title: '请补全必填信息', icon: 'none' })
      return
    }
    if (this.data.fee > 0) {
      this.setData({ payOpen: true })
    } else {
      await this.doSubmit()
    }
  },

  closePay() {
    this.setData({ payOpen: false })
  },

  noop() {},

  async confirmPay() {
    this.setData({ payOpen: false })
    await this.doSubmit()
  },

  async doSubmit() {
    const { form } = this.data
    const groupCount = Number(form.groupCount)
    const memberCount = Number(form.memberCount)
    await store.submitManagerApply({
      userId: 'u1',
      name: form.name,
      phone: form.phone,
      groupCount,
      memberCount,
      scale: `${groupCount}个群，约${memberCount}人`,
      fields: form.fields,
      intro: form.intro,
      paid: true
    })
    wx.showToast({ title: '申请已提交，请等待审核', icon: 'none' })
    setTimeout(() => {
      wx.navigateBack()
    }, 800)
  }
})
