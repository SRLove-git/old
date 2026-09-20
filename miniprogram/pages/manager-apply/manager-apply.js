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
    nameEditable: false,
    phoneEditable: false,
    nameHint: '',
    phoneHint: '',
    accountName: '',
    accountPhone: '',
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
      ...this.profileFields(state.user || {})
    })
  },

  // 账号已有姓名/有效手机号时锁定输入框（身份核对用），缺失或格式不对时允许本人补填
  profileFields(user) {
    const accountName = String(user.name || '').trim()
    const accountPhone = store.normalizePhone(user.phone)
    const phoneValid = /^1\d{10}$/.test(accountPhone)
    const nameEditable = !accountName
    const phoneEditable = !phoneValid
    return {
      'form.name': accountName,
      'form.phone': accountPhone,
      nameEditable,
      phoneEditable,
      accountName,
      accountPhone: phoneValid ? accountPhone : '',
      nameHint: nameEditable ? '账号未填写姓名，请填写真实姓名用于审核' : '与账号信息一致，如需修改请联系客服',
      phoneHint: phoneValid
        ? `与账号信息一致（${store.maskPhone(accountPhone)}）`
        : (accountPhone ? '账号手机号不完整，请填写完整的11位手机号' : '账号未绑定手机号，请填写常用手机号')
    }
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
    const name = String(form.name || '').trim()
    const phone = store.normalizePhone(form.phone)
    if (!name) errors.name = '请填写真实姓名'
    if (!/^1\d{10}$/.test(phone)) {
      errors.phone = '请填写11位手机号，例如 13812346688'
    } else if (!this.data.phoneEditable && this.data.accountPhone && phone !== this.data.accountPhone) {
      errors.phone = '手机号需与账号信息一致'
    }
    const groupCount = Number(form.groupCount)
    const memberCount = Number(form.memberCount)
    if (!form.groupCount || !Number.isInteger(groupCount) || groupCount < 1 || groupCount > 50) errors.groupCount = '请填写1-50的微信群数量'
    if (!form.memberCount || !Number.isInteger(memberCount) || memberCount < 1 || memberCount > 5000) errors.memberCount = '请填写1-5000的社群总人数'
    if (!agree) errors.agree = '请先阅读并同意协议'
    this.setData({ errors })
    if (Object.keys(errors).length) {
      wx.showToast({ title: errors.name || errors.phone || '请补全必填信息', icon: 'none' })
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
    try {
      await store.submitManagerApply({
        // 用当前登录会员的 id 申请，审核通过后工作台才会绑定到本人
        userId: store.getCurrentUserId(),
        name: String(form.name || '').trim(),
        phone: store.normalizePhone(form.phone),
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
    } catch (e) {
      // 服务端校验信息直接展示，避免只看到「提交失败」
      this.setData({ payOpen: false, 'errors.phone': /手机号/.test(e.message || '') ? e.message : '', 'errors.name': /姓名/.test(e.message || '') ? e.message : '' })
      wx.showToast({ title: e.message || '提交失败，请稍后重试', icon: 'none' })
    }
  }
})
