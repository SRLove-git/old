export const fmtMoney = (value) => Number(value || 0).toFixed(2);
export function orderAddressText(record) {
  const address = record && record.address;
  if (!address) return "";
  return [address.province, address.city, address.district, address.detail]
    .filter(Boolean)
    .join("");
}
export const isPaidPrice = (value) =>
  Number.isFinite(Number(value)) && Number(value) >= 0.01;
export function fuzzyMatch(text, keyword) {
  const terms = String(keyword || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const haystack = String(text || "").toLowerCase();
  return terms.every((term) => haystack.includes(term));
}
export const notificationColor = (type) =>
  ({
    manager: "arcoblue",
    provider: "purple",
    unbind: "orange",
    refund: "red",
    withdraw: "green",
  })[type] || "gray";
export const notificationLabel = (type) =>
  ({
    manager: "主理人",
    provider: "服务商",
    unbind: "解绑",
    refund: "退款",
    withdraw: "提现",
  })[type] || "待办";
export function orderChip(status) {
  if (["已完成", "已核销", "已签到"].includes(status)) return "green";
  if (status === "退款中") return "red";
  return ["已退款", "已取消"].includes(status) ? "gray" : "orange";
}
export const managerChip = (status) =>
  status === 1 ? "green" : status === 2 ? "orange" : "gray";
export const bindingChip = (status) => (status === 1 ? "green" : "gray");
export function statusChip(status) {
  if (
    [
      "待审核",
      "待付款",
      "待签到",
      "待核销",
      "待使用",
      "待发货",
      "待收货",
      "待评价",
    ].includes(status)
  )
    return "orange";
  if (["已通过", "已结算", "可结算", "已到账", "正常"].includes(status))
    return "green";
  if (["已拒绝", "已驳回", "已扣回"].includes(status)) return "red";
  return ["提现中", "待结算"].includes(status) ? "arcoblue" : "gray";
}
export const typeTagColor = (type) =>
  type === "news" ? "arcoblue" : type === "video" ? "purple" : "green";
