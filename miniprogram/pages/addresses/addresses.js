const store = require('../../utils/store.js')

Page({
  data: {
    addresses: [],
    editingId: null,
    form: { name: '', phone: '', region: '', detail: '' },
    regionOptions: [],
    regionIndex: -1
  },

  async onShow() {
    await store.ready()
    try { await store.refreshRegions() } catch (e) {}
    this.setData({ regionOptions: store.getRegions() })
    this.loadList()
  },

  loadList() {
    this.setData({ addresses: store.get().addresses || [] })
  },

  openAdd() {
    this.setData({ editingId: 'new', form: { name: '', phone: '', region: '', detail: '' }, regionIndex: -1 })
  },

  openEdit(e) {
    const id = e.currentTarget.dataset.id
    const addr = this.data.addresses.find((a) => String(a.id) === String(id))
    if (!addr) return
    const region = `${addr.province || ''}${addr.city || ''}${addr.district || ''}`
    const regionIndex = this.data.regionOptions.findIndex((item) => item.name === region)
    this.setData({
      editingId: id,
      regionIndex,
      form: {
        name: addr.name || '',
        phone: addr.phone || '',
        region,
        detail: addr.detail || ''
      }
    })
  },

  closeForm() {
    this.setData({ editingId: null })
  },

  noop() {},

  onInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`form.${field}`]: e.detail.value })
  },

  onRegionChange(e) {
    const regionIndex = Number(e.detail.value)
    const region = this.data.regionOptions[regionIndex]
    this.setData({ regionIndex, 'form.region': region ? region.name : '' })
  },

  async save() {
    const { form, editingId } = this.data
    if (!form.name || !form.phone || !form.region || !form.detail) {
      wx.showToast({ title: '请填写完整收货信息', icon: 'none' })
      return
    }
    if (!this.data.regionOptions.some((item) => item.name === form.region)) {
      wx.showToast({ title: '请选择后台已启用地区', icon: 'none' })
      return
    }
    if (!/^1\d{10}$/.test(form.phone)) {
      wx.showToast({ title: '请填写正确的11位手机号', icon: 'none' })
      return
    }
    const payload = { name: form.name, phone: form.phone, province: '', city: '', district: form.region || '', detail: form.detail }
    try {
      if (editingId && editingId !== 'new') {
        await store.updateAddress(editingId, payload)
      } else {
        await store.saveAddress(payload)
      }
      await store.refresh()
      this.setData({ editingId: null })
      this.loadList()
      wx.showToast({ title: '已保存', icon: 'none' })
    } catch (e) {
      wx.showToast({ title: e.message || '保存失败', icon: 'none' })
    }
  },

  setDefault(e) {
    const id = e.currentTarget.dataset.id
    store.updateAddress(id, { isDefault: true }).then(async () => {
      await store.refresh()
      this.loadList()
      wx.showToast({ title: '已设为默认地址', icon: 'none' })
    }).catch((err) => {
      wx.showToast({ title: err.message || '设置失败', icon: 'none' })
    })
  },

  remove(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除收货地址',
      content: '确定删除这个收货地址吗？',
      confirmColor: '#f53f3f',
      success: (res) => {
        if (!res.confirm) return
        store.deleteAddress(id).then(async () => {
          await store.refresh()
          this.loadList()
          wx.showToast({ title: '已删除', icon: 'none' })
        }).catch((err) => {
          wx.showToast({ title: err.message || '删除失败', icon: 'none' })
        })
      }
    })
  }
})
