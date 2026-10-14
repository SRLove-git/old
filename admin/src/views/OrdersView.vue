<script setup>
import {
  fmtMoney,
  orderAddressText,
  orderChip,
} from "../utils/presentation.js";
defineProps({
  exportRows: { type: Array, default: () => [] },
  orders: { type: Array, default: () => [] },
  pendingCheckin: Number,
  pendingShip: Number,
  statusOptions: { type: Array, default: () => [] },
});
const emit = defineEmits([
  "approve-refund",
  "cancel",
  "complete",
  "export",
  "refund",
  "reject-refund",
  "ship",
  "advance",
]);
const keyword = defineModel("keyword", { type: String, default: "" });
const status = defineModel("status", { type: String, default: "" });
const columns = [
  {
    title: "订单号",
    dataIndex: "id",
    width: 150,
    ellipsis: true,
    tooltip: true,
  },
  { title: "客户", dataIndex: "participants", width: 110 },
  { title: "标题", dataIndex: "title", ellipsis: true, tooltip: true },
  { title: "收货地址", slotName: "address", width: 230 },
  { title: "物流", slotName: "logistics", width: 170 },
  { title: "实付", slotName: "payAmount", align: "right", width: 110 },
  { title: "状态", slotName: "status", width: 100 },
  { title: "退款/售后", slotName: "refund", width: 190 },
  { title: "主理人", slotName: "manager", width: 120 },
  { title: "操作", slotName: "actions", width: 360 },
];
</script>
<template>
  <section>
    <div class="toolbar">
      <a-space wrap
        ><a-input-search
          v-model="keyword"
          placeholder="搜索订单/标题/客户"
          allow-clear
          style="width: 260px"
        /><a-select
          v-model="status"
          :options="statusOptions"
          style="width: 140px"
        /><a-tag color="orange">待签到/核销 {{ pendingCheckin }}</a-tag
        ><a-tag color="arcoblue">待发货 {{ pendingShip }}</a-tag
        ><a-button @click="emit('export', exportRows)"
          >导出 CSV（含收货地址与物流）</a-button
        ></a-space
      >
    </div>
    <a-card :bordered="false"
      ><a-table
        :columns="columns"
        :data="orders"
        :pagination="false"
        row-key="id"
        :scroll="{ x: 1500 }"
        size="middle"
      >
        <template #payAmount="{ record }"
          ><span class="num">¥{{ fmtMoney(record.payAmount) }}</span></template
        >
        <template #address="{ record }"
          ><div v-if="record.address">
            <div>{{ record.address.name }} {{ record.address.phone }}</div>
            <div class="muted">{{ orderAddressText(record) }}</div>
          </div>
          <span v-else class="muted">—</span></template
        >
        <template #logistics="{ record }"
          ><span
            v-if="record.serviceMode && record.serviceMode !== 'delivery'"
            class="muted"
            >无需物流</span
          >
          <div v-else-if="record.trackingNo || record.carrier">
            <div>{{ record.carrier }}</div>
            <div class="muted">{{ record.trackingNo || "—" }}</div>
          </div>
          <span v-else class="muted">未发货</span></template
        >
        <template #status="{ record }"
          ><a-tag :color="orderChip(record.status)">{{
            record.status
          }}</a-tag></template
        >
        <template #refund="{ record }"
          ><div v-if="record.status === '退款中' || record.refundReason">
            <div>{{ record.refundReason || "—" }}</div>
            <div class="muted">
              ¥{{ fmtMoney(record.refundAmount || 0)
              }}<template v-if="record.status === '退款中'">
                · 申请于 {{ record.refundApplyTime || "—" }}</template
              ><template v-else-if="record.refundTime">
                · {{ record.refundTime }}</template
              >
            </div>
            <div v-if="record.refundRejected" class="muted red">
              已拒绝：{{ record.refundRejected }}
            </div>
          </div>
          <span v-else class="muted">—</span></template
        >
        <template #manager="{ record }">{{
          record.managerId || "散客"
        }}</template>
        <template #actions="{ record }"
          ><a-space :size="0" wrap
            ><span v-if="record.status === '待付款'" class="muted"
              >等待用户微信支付</span
            ><a-button
              v-if="record.status === '待付款'"
              size="small"
              @click="emit('cancel', record.id)"
              >取消</a-button
            ><a-button
              v-if="record.status === '待发货'"
              type="primary"
              size="small"
              @click="emit('ship', record, false)"
              >发货</a-button
            ><a-button
              v-if="
                record.status === '待收货' &&
                (record.carrier || record.trackingNo)
              "
              size="small"
              @click="emit('ship', record, true)"
              >改物流</a-button
            ><a-button
              v-if="['待签到', '待核销'].includes(record.status)"
              type="primary"
              size="small"
              @click="emit('complete', record)"
              >{{
                record.status === "待签到" ? "确认签到" : "确认核销"
              }}</a-button
            ><a-button
              v-if="record.status === '待使用'"
              size="small"
              @click="emit('advance', record.id)"
              >确认使用</a-button
            ><a-button
              v-if="record.status === '退款中'"
              type="primary"
              status="danger"
              size="small"
              @click="emit('approve-refund', record.id)"
              >同意退款</a-button
            ><a-button
              v-if="record.status === '退款中'"
              size="small"
              @click="emit('reject-refund', record)"
              >拒绝退款</a-button
            ><a-button
              v-if="record.status === '待收货'"
              size="small"
              @click="emit('advance', record.id)"
              >确认收货</a-button
            ><a-button
              v-if="
                ['待发货', '待收货', '待签到', '待核销', '待使用'].includes(
                  record.status,
                )
              "
              type="primary"
              status="danger"
              size="small"
              @click="emit('refund', record.id)"
              >退款</a-button
            ></a-space
          ></template
        >
      </a-table></a-card
    >
  </section>
</template>
<style scoped>
.toolbar {
  margin-bottom: 16px;
}
.muted {
  color: var(--color-text-3);
  font-size: 13px;
}
.red {
  color: rgb(var(--danger-6));
}
.num {
  font-variant-numeric: tabular-nums;
}
</style>
