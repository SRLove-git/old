export const CATEGORY_TYPES = { activity: '活动', product: '商品', news: '资讯', video: '视频' }
export const COUPON_TYPES = { 1: '无门槛', 2: '满减', 3: '品类券', 4: '指定商品券' }
export const BIND_SOURCES = { 1: '扫码', 2: '链接', 3: '邀请码', 4: '手动变更' }
export const ORDER_STATUSES = ['全部', '待付款', '待签到', '待核销', '待使用', '待发货', '待收货', '待评价', '已完成', '退款中', '已退款', '已取消']
export const CONTENT_TYPE_OPTIONS = [{ label: '活动', value: 'activity' }, { label: '商品', value: 'product' }, { label: '资讯', value: 'news' }, { label: '视频', value: 'video' }]
export const POST_TYPE_OPTIONS = [{ label: '政策资讯', value: 'news' }, { label: '视频', value: 'video' }]
export const PROVIDER_TYPE_OPTIONS = [{ label: '个人服务者', value: 'personal' }, { label: '公司/机构', value: 'company' }]
export const PUBLISH_OPTIONS = [{ label: '上架', value: 1 }, { label: '下架', value: 0 }]
export const MANAGER_PAYMENT_STATUS_OPTIONS = ['待核对', '已到账', '未收费', '免收费', '待退款', '已退款'].map((value) => ({ label: value === '待核对' ? '待财务核对' : value, value }))
export const MANAGER_FINANCE_STATUS_OPTIONS = ['全部佣金明细', '待结算', '可结算', '提现中', '已结算', '已扣回'].map((label) => ({ label, value: label === '全部佣金明细' ? '' : label }))
export const WITHDRAW_STATUS_OPTIONS = ['全部状态', '待审核', '已到账', '已拒绝', '已撤销'].map((label) => ({ label, value: label === '全部状态' ? '' : label }))
export const WITHDRAW_PAY_CHANNEL_OPTIONS = ['微信零钱', '银行转账', '支付宝', '其他'].map((value) => ({ label: value, value }))
export const SELL_TYPE_OPTIONS = [{ label: '预约日期（选日期/场次）', value: 'date' }, { label: 'SKU 选择（选规格/房型）', value: 'sku' }]
export const SERVICE_MODE_OPTIONS = [{ label: '线下服务 · 凭订单签到核销', value: 'checkin' }, { label: '到店服务 · 凭核销码核销', value: 'verify_code' }, { label: '线上服务 · 无需现场核销', value: 'online' }, { label: '实物配送 · 填写物流信息', value: 'delivery' }]
export const REFUND_RULE_TYPE_OPTIONS = [{ label: '随时可退（全额退款）', value: 'always' }, { label: '按活动开始前天数退款', value: 'day' }, { label: '阶梯退款', value: 'ladder' }, { label: '不支持退款', value: 'never' }]
