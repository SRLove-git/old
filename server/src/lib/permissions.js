export const ADMIN_PERMISSION_GROUPS = [
  { key: 'dashboard.view', name: '数据看板', description: '查看经营数据和待办通知' },
  { key: 'activities.manage', name: '活动发布管理', description: '新增、编辑和删除平台或商家活动' },
  { key: 'products.manage', name: '商品发布管理', description: '新增、编辑和删除平台或商家商品' },
  { key: 'courses.manage', name: '课程发布管理', description: '新增、编辑和删除课程' },
  { key: 'content.manage', name: '内容与页面配置', description: '管理分类、地区、资讯、Banner和页面配置' },
  { key: 'orders.manage', name: '订单与核销', description: '管理订单、退款、发货、签到和核销' },
  { key: 'customers.manage', name: '用户与归属', description: '管理会员资料、主理人归属和解绑' },
  { key: 'marketing.manage', name: '营销与评价', description: '管理优惠券和评价' },
  { key: 'merchants.manage', name: '商家与主理人', description: '审核服务商、主理人及维护主理人资料' },
  { key: 'finance.manage', name: '佣金与提现', description: '管理佣金结算、调整和提现审核' },
  { key: 'accounts.manage', name: '账号与权限', description: '新增员工账号、重置密码和分配权限' },
  { key: 'logs.view', name: '操作日志', description: '查看所有后台账号的操作记录' }
]

export const MERCHANT_PERMISSION_GROUPS = [
  { key: 'merchant.activities', name: '发布活动' },
  { key: 'merchant.products', name: '发布商品' },
  { key: 'merchant.courses', name: '发布课程' }
]

export function permissionForRequest(req) {
  const path = String(req.originalUrl || req.path || '').split('?')[0]
  if (path === '/api/admin/me' || path === '/api/admin/password') return null
  if (path.startsWith('/api/admin/accounts') || path.startsWith('/api/admin/merchant-accounts') || path === '/api/admin/permission-options') return 'accounts.manage'
  if (path.startsWith('/api/stats') || path.startsWith('/api/admin/notifications')) return 'dashboard.view'
  if (path.startsWith('/api/activities')) return 'activities.manage'
  if (path.startsWith('/api/products') || path.startsWith('/api/point-products') || path.startsWith('/api/point-orders')) return 'products.manage'
  if (path.startsWith('/api/lives')) return 'courses.manage'
  if (path.startsWith('/api/categories') || path.startsWith('/api/regions') || path.startsWith('/api/content-posts') || path.startsWith('/api/banners') || path.startsWith('/api/config') || path.startsWith('/api/uploads')) return 'content.manage'
  if (path.startsWith('/api/orders') || path.startsWith('/api/cards') || path.startsWith('/api/participants')) return 'orders.manage'
  if (path.startsWith('/api/customers') || path.startsWith('/api/users') || path.startsWith('/api/addresses') || path.startsWith('/api/members') || path.startsWith('/api/bindings') || path.startsWith('/api/unbind-applications')) return 'customers.manage'
  if (path.startsWith('/api/coupons') || path.startsWith('/api/reviews')) return 'marketing.manage'
  if (path.startsWith('/api/manager-applications') || path.startsWith('/api/provider-applications') || path.startsWith('/api/managers')) return 'merchants.manage'
  if (path.startsWith('/api/commissions') || path.startsWith('/api/commission-settlements') || path.startsWith('/api/withdraws')) return 'finance.manage'
  if (path.startsWith('/api/logs')) return 'logs.view'
  return null
}
