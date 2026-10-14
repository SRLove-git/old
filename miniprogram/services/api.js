// 原始 API 调用封装：只负责请求与返回数据，不读写缓存，便于替换与测试。
const { api, publicApi, getCurrentUserId: authUserId } = require('../utils/request.js')

function fetchHome() {
  return publicApi.get('/home')
}

function fetchReviews() {
  return publicApi.get('/reviews')
}

function fetchManagers() {
  return publicApi.get('/managers')
}

function fetchLives(userId) {
  return userId ? api.get(`/lives?userId=${userId}`) : publicApi.get('/lives')
}

function fetchUserProfile(userId) {
  return api.get(`/users/${userId}`)
}

function fetchOrders() {
  return api.get('/orders')
}

function fetchParticipants() {
  return api.get('/participants')
}

function fetchRegions() {
  return publicApi.get('/regions?enabled=1')
}

function fetchConfig() {
  return publicApi.get('/config')
}

function fetchPointProducts() {
  return publicApi.get('/point-products')
}

function fetchPointOrders() {
  return api.get('/point-orders')
}

function redeemPointProduct(productId, addressId, count = 1) {
  return api.post('/point-orders', { productId, addressId, count })
}

function joinMember(userId) {
  return api.post('/members/join', { userId })
}

function updateUserName(name) {
  return api.put(`/users/${authUserId()}`, { name })
}

function bindByCode(code) {
  return api.post(`/customers/${authUserId()}/bind`, { code, source: 3 })
}

function bindByManagerId(managerId, source) {
  return api.post(`/customers/${authUserId()}/bind`, { managerId, source })
}

function unbindManager() {
  return api.post(`/customers/${authUserId()}/unbind`, { reason: '客户主动解除' })
}

function createOrder(payload) {
  return api.post('/orders', { ...payload, userId: authUserId() })
}

function payOrder(id) {
  return api.post(`/orders/${id}/pay`)
}

function refreshOrderPayment(id) {
  return api.post(`/orders/${id}/payment-status/refresh`)
}

function getOrder(id) {
  return api.get(`/orders/${id}`)
}

function cancelOrder(id) {
  return api.post(`/orders/${id}/cancel`)
}

function refundOrder(id, reason) {
  return api.post(`/orders/${id}/refund`, { reason })
}

function advanceOrder(id) {
  return api.post(`/orders/${id}/advance`)
}

function getOrderLogistics(id) {
  return api.get(`/orders/${id}/logistics`)
}

function refreshOrderLogistics(id) {
  return api.post(`/orders/${id}/logistics/refresh`)
}

function submitReview(orderId, review) {
  return api.post(`/orders/${orderId}/review`, review)
}

function saveParticipant(participant, editingId) {
  if (editingId && editingId !== 'new') return api.put(`/participants/${editingId}`, participant)
  return api.post('/participants', participant)
}

function deleteParticipant(id) {
  return api.del(`/participants/${id}`)
}

function saveAddress(address) {
  return api.post('/addresses', { ...address, userId: authUserId() })
}

function updateAddress(id, form) {
  return api.put(`/addresses/${id}`, form)
}

function deleteAddress(id) {
  return api.del(`/addresses/${id}`)
}

function unbindApply(reason) {
  return api.post(`/customers/${authUserId()}/unbind-apply`, { reason })
}

function purchaseLive(liveId, useBalance = false) {
  return api.post(`/lives/${liveId}/purchase`, { userId: authUserId(), useBalance })
}

function submitManagerApply(form) {
  return api.post('/manager-applications', form)
}

function loadManagerDashboard(managerId) {
  return api.get(`/managers/${managerId}/dashboard?userId=${authUserId()}`)
}

function applyWithdraw(managerId, amount) {
  return api.post('/withdraws', { managerId, amount })
}

function getBalanceTransactions() {
  return api.get('/balance/transactions')
}

function createBalanceRecharge(amount) {
  return api.post('/balance/recharges', { amount })
}

function payBalanceRecharge(id) {
  return api.post(`/balance/recharges/${id}/pay`)
}

function refreshBalanceRecharge(id) {
  return api.post(`/balance/recharges/${id}/payment-status/refresh`)
}

function payManagerApplication(id) {
  return api.post(`/manager-applications/${id}/pay`)
}

function refreshManagerApplicationPayment(id) {
  return api.post(`/manager-applications/${id}/payment-status/refresh`)
}

function getManagerApplication(id) {
  return api.get(`/manager-applications/${id}`)
}

module.exports = {
  fetchHome,
  fetchReviews,
  fetchManagers,
  fetchLives,
  fetchUserProfile,
  fetchOrders,
  fetchParticipants,
  fetchRegions,
  fetchConfig,
  fetchPointProducts,
  fetchPointOrders,
  redeemPointProduct,
  joinMember,
  updateUserName,
  bindByCode,
  bindByManagerId,
  unbindManager,
  createOrder,
  payOrder,
  refreshOrderPayment,
  getOrder,
  cancelOrder,
  refundOrder,
  advanceOrder,
  getOrderLogistics,
  refreshOrderLogistics,
  submitReview,
  saveParticipant,
  deleteParticipant,
  saveAddress,
  updateAddress,
  deleteAddress,
  unbindApply,
  purchaseLive,
  submitManagerApply,
  loadManagerDashboard,
  applyWithdraw,
  getBalanceTransactions,
  createBalanceRecharge,
  payBalanceRecharge,
  refreshBalanceRecharge,
  payManagerApplication,
  refreshManagerApplicationPayment,
  getManagerApplication
}
