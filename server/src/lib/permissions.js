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
  const path = String(req.originalUrl || req.path || '').split('?')[0].toLowerCase().replace(/\/+$/, '')
  const under = prefix => path === prefix || path.startsWith(prefix + '/')
  if ((path === '/api/admin/me' && ['GET', 'HEAD'].includes(req.method)) ||
      (path === '/api/admin/password' && req.method === 'PUT')) return 'admin.self'
  if (under('/api/admin/accounts') || under('/api/admin/merchant-accounts') || path === '/api/admin/permission-options') return 'accounts.manage'
  if (under('/api/stats') || under('/api/admin/notifications')) return 'dashboard.view'
  if (under('/api/activities')) return 'activities.manage'
  if (under('/api/products') || under('/api/point-products') || under('/api/point-orders')) return 'products.manage'
  if (under('/api/lives')) return 'courses.manage'
  if (path === '/api/uploads/video' && ['activities', 'products'].includes(req.query?.scope)) return `${req.query.scope}.manage`
  if (path === '/api/uploads/image') {
    const scope = req.query?.scope
    if (['activities', 'products', 'courses'].includes(scope)) return `${scope}.manage`
  }
  if (under('/api/categories') || under('/api/regions') || under('/api/content-posts') || under('/api/banners') || under('/api/config') || under('/api/uploads')) return 'content.manage'
  if (under('/api/orders') || under('/api/cards') || under('/api/participants') || under('/api/logistics')) return 'orders.manage'
  if (under('/api/customers') || under('/api/users') || under('/api/addresses') || under('/api/members') || under('/api/bindings') || under('/api/unbind-applications')) return 'customers.manage'
  if (under('/api/coupons') || under('/api/reviews')) return 'marketing.manage'
  if (under('/api/manager-applications') || under('/api/provider-applications') || under('/api/managers')) return 'merchants.manage'
  if (under('/api/commissions') || under('/api/commission-settlements') || under('/api/withdraws') || path === '/api/transfers/config') return 'finance.manage'
  if (under('/api/logs')) return 'logs.view'
  return null
}
