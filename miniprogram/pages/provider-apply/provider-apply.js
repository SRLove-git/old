const store = require('../../utils/store.js')
const { api } = require('../../utils/request.js')

Page({
  data: {
    typeOptions: [
      { value: 'personal', label: '个人', tip: '个人服务者' },
      { value: 'company', label: '公司', tip: '企业或机构' }
    ],
    form: {
      type: '',
      name: '',
      phone: '',
      address: '',
      products: ''
    },
    errors: {},
    submitting: false,
    application: null
  },

  async onShow() {
    this.pageVisible = true
    try {
      await store.ready()
      await this.refreshApplication()
      if (this.pageVisible) this.startStatusPolling()
    } catch (e) {
      // 网络异常时仍展示缓存中的申请记录。
      if (this.pageVisible) this.setData({ application: store.get().providerApplication || null })
    }
  },

  onHide() {
    this.pageVisible = false
    this.stopStatusPolling()
  },

  onUnload() {
    this.pageVisible = false
    this.stopStatusPolling()
  },

  async refreshApplication() {
    await store.refreshUserProfile()
    const application = store.get().providerApplication || null
    if (this.pageVisible) this.setData({ application })
    return application
  },

  startStatusPolling() {
    this.stopStatusPolling()
    if (!this.data.application || this.data.application.status !== '待审核') return
    this.statusTimer = setInterval(async () => {
      try {
        const application = await this.refreshApplication()
        if (!application || application.status !== '待审核') this.stopStatusPolling()
      } catch (e) {
        // 静默等待下一次同步，避免临时断网反复打扰用户。
      }
    }, 5000)
  },

  stopStatusPolling() {
    if (this.statusTimer) clearInterval(this.statusTimer)
    this.statusTimer = null
  },

  selectType(e) {
    this.setData({ 'form.type': e.currentTarget.dataset.value, 'errors.type': '' })
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`form.${field}`]: e.detail.value, [`errors.${field}`]: '' })
  },

  validate() {
    const form = this.data.form
    const errors = {}
    if (!form.type) errors.type = '请选择个人或公司'
    if (!form.name.trim()) errors.name = '请填写名称或联系人'
    if (!/^1\d{10}$/.test(form.phone)) errors.phone = '请输入正确的11位手机号'
    if (!form.address.trim()) errors.address = '请填写联系地址'
    if (!form.products.trim()) errors.products = '请填写主营产品或服务'
    this.setData({ errors })
    return Object.keys(errors).length === 0
  },

  async submit() {
    if (this.data.submitting || !this.validate()) {
      if (Object.keys(this.data.errors).length) wx.showToast({ title: '请补全必填信息', icon: 'none' })
      return
    }
    this.setData({ submitting: true })
    try {
      const form = this.data.form
      const record = await api.post('/provider-applications', {
        userId: 'u1',
        name: form.name.trim(),
        phone: form.phone,
        type: form.type,
        intro: form.products.trim(),
        address: form.address.trim()
      })
      store.get().providerApplication = record
      this.setData({ application: record, submitting: false })
      this.startStatusPolling()
    } catch (e) {
      this.setData({ submitting: false })
      wx.showToast({ title: e.message || '提交失败', icon: 'none' })
    }
  },

  reapply() {
    this.setData({ application: null })
  }
})
