const store = require('../../utils/store.js')

Page({
  data: {
    form: {
      name: '',
      phone: '',
      scale: '',
      fields: [],
      intro: ''
    },
    agree: false,
    errors: {},
    fieldOptions: [
      { name: '徒步', selected: false },
      { name: '掼蛋', selected: false },
      { name: 'K歌', selected: false },
      { name: '研学旅行', selected: false },
      { name: '摄影', selected: false },
      { name: '合唱', selected: false }
    ]
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
    if (!form.name) errors.name = '请填写姓名'
    if (!form.phone) errors.phone = '请填写手机号'
    if (!form.scale) errors.scale = '请填写社群规模'
    if (!agree) errors.agree = '请先阅读并同意协议'
    this.setData({ errors })
    if (Object.keys(errors).length) {
      wx.showToast({ title: '请补全必填信息', icon: 'none' })
      return
    }
    await store.submitManagerApply(form)
    wx.showToast({ title: '申请已提交，请等待审核', icon: 'none' })
    setTimeout(() => {
      wx.navigateBack()
    }, 800)
  }
})
