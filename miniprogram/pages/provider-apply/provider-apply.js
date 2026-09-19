const STORAGE_KEY = 'suiyueli_provider_applications_v1'

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
    submitting: false
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

  submit() {
    if (this.data.submitting || !this.validate()) {
      if (Object.keys(this.data.errors).length) wx.showToast({ title: '请补全必填信息', icon: 'none' })
      return
    }
    this.setData({ submitting: true })
    const records = wx.getStorageSync(STORAGE_KEY)
    const applications = Array.isArray(records) ? records : []
    applications.unshift({
      id: `PROVIDER${Date.now()}`,
      ...this.data.form,
      status: '待审核',
      submittedAt: new Date().toLocaleString('zh-CN', { hour12: false })
    })
    wx.setStorageSync(STORAGE_KEY, applications)
    wx.showModal({
      title: '提交成功',
      content: '服务商申请已提交，我们会尽快与您联系。',
      showCancel: false,
      confirmText: '好的',
      success: () => wx.navigateBack()
    })
    this.setData({ submitting: false })
  }
})
