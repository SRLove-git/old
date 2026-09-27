const store = require('../../utils/store.js')
const regionPicker = require('../../utils/region-picker.js')

Page({
  data: {
    addresses: [],
    editingId: null,
    form: { name: '', phone: '', regionText: '', regionId: '', detail: '' },
    regionOptions: [],
    regionPickerColumns: [[], [], []],
    regionPickerIndexes: [0, 0, 0]
  },

  async onShow() {
    await store.ready()
    try { await store.refreshRegions() } catch (e) {}
    const regionOptions = store.getRegions()
    const picker = regionPicker.buildRegionPicker(regionOptions)
    this.setData({ regionOptions, regionPickerColumns: picker.columns, regionPickerIndexes: picker.indexes })
    this.loadList()
  },

  loadList() {
    this.setData({ addresses: store.get().addresses || [] })
  },

  openAdd() {
    const picker = regionPicker.buildRegionPicker(this.data.regionOptions)
    this.setData({
      editingId: 'new',
      form: { name: '', phone: '', regionText: '', regionId: '', detail: '' },
      regionPickerColumns: picker.columns,
      regionPickerIndexes: picker.indexes
    })
  },

  openEdit(e) {
    const id = e.currentTarget.dataset.id
    const addr = this.data.addresses.find((a) => String(a.id) === String(id))
    if (!addr) return
    const picker = regionPicker.buildRegionPicker(this.data.regionOptions, addr)
    this.setData({
      editingId: id,
      regionPickerColumns: picker.columns,
      regionPickerIndexes: picker.indexes,
      form: {
        name: addr.name || '',
        phone: addr.phone || '',
        regionText: regionPicker.regionText(addr),
        regionId: picker.selected ? String(picker.selected.id) : '',
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

  onRegionColumnChange(e) {
    const picker = regionPicker.changeRegionPicker(this.data.regionOptions, {
      columns: this.data.regionPickerColumns,
      indexes: this.data.regionPickerIndexes
    }, Number(e.detail.column), Number(e.detail.value))
    this.setData({ regionPickerColumns: picker.columns, regionPickerIndexes: picker.indexes })
  },

  onRegionChange(e) {
    const indexes = e.detail.value.map(Number)
    const region = regionPicker.selectedRegion({ columns: this.data.regionPickerColumns }, indexes)
    this.setData({
      regionPickerIndexes: indexes,
      'form.regionText': regionPicker.regionText(region),
      'form.regionId': region ? String(region.id) : ''
    })
  },

  async save() {
    const { form, editingId } = this.data
    if (!form.name || !form.phone || !form.regionId || !form.detail) {
      wx.showToast({ title: '请填写完整收货信息', icon: 'none' })
      return
    }
    const region = this.data.regionOptions.find((item) => String(item.id) === String(form.regionId))
    if (!region || region.enabled === false) {
      wx.showToast({ title: '请选择后台已启用地区', icon: 'none' })
      return
    }
    if (!/^1\d{10}$/.test(form.phone)) {
      wx.showToast({ title: '请填写正确的11位手机号', icon: 'none' })
      return
    }
    const payload = {
      name: form.name,
      phone: form.phone,
      province: region.province,
      city: region.city,
      district: region.district,
      regionId: region.id,
      regionCode: region.districtCode || region.code || '',
      detail: form.detail
    }
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
