const store = require('../../utils/store.js')

Page({
  data: {
    participants: [],
    editingId: null,
    form: {
      name: '',
      phone: '',
      idCard: ''
    }
  },

  async onShow() {
    await store.ready()
    this.setData({ participants: store.get().participants })
  },

  openAdd() {
    this.setData({ editingId: 'new', form: { name: '', phone: '', idCard: '' } })
  },

  openEdit(e) {
    const id = e.currentTarget.dataset.id
    const p = this.data.participants.find((x) => String(x.id) === String(id))
    this.setData({ editingId: id, form: { name: p.name, phone: p.phone, idCard: p.idCard || '' } })
  },

  closeModal() {
    this.setData({ editingId: null })
  },

  noop() {},

  onInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`form.${field}`]: e.detail.value })
  },

  async save() {
    const { form, editingId } = this.data
    if (!form.name) {
      wx.showToast({ title: '请填写姓名', icon: 'none' })
      return
    }
    if (!/^1\d{10}$/.test(form.phone)) {
      wx.showToast({ title: '请填写正确的11位手机号', icon: 'none' })
      return
    }
    await store.saveParticipant(form, editingId)
    this.setData({ participants: store.get().participants, editingId: null })
    wx.showToast({ title: '已保存', icon: 'none' })
  },

  remove(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除报名人',
      content: '确定删除这位常用报名人吗？',
      confirmColor: '#f53f3f',
      success: (res) => {
        if (res.confirm) {
          store.deleteParticipant(id).then(() => {
            this.setData({ participants: store.get().participants })
          })
        }
      }
    })
  }
})
