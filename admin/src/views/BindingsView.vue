<script setup>
import { BIND_SOURCES } from "../options.js";
import { bindingChip, fmtMoney, statusChip } from "../utils/presentation.js";

defineProps({
  applications: { type: Array, default: () => [] },
  bindings: { type: Array, default: () => [] },
  loading: Boolean,
  managers: { type: Array, default: () => [] },
});
const emit = defineEmits(["approve", "detail", "rebind", "reject", "unbind"]);
const applicationColumns = [
  {
    title: "申请ID",
    dataIndex: "id",
    width: 130,
    ellipsis: true,
    tooltip: true,
  },
  { title: "客户", dataIndex: "customerName", width: 120 },
  { title: "原主理人", dataIndex: "managerName", width: 120 },
  { title: "申请理由", dataIndex: "reason", ellipsis: true, tooltip: true },
  { title: "状态", slotName: "status", width: 100 },
  { title: "申请时间", dataIndex: "submittedAt", width: 160 },
  { title: "操作", slotName: "actions", width: 160 },
];
const bindingColumns = [
  {
    title: "会员码",
    dataIndex: "memberId",
    width: 155,
    ellipsis: true,
    tooltip: true,
  },
  { title: "客户", dataIndex: "customerName", width: 110 },
  { title: "电话", dataIndex: "phone", width: 125 },
  { title: "身份证号码", slotName: "idCard", width: 175 },
  { title: "生日", dataIndex: "birthday", width: 110 },
  { title: "会员类型", dataIndex: "memberType", width: 105 },
  { title: "入会时间", dataIndex: "memberSince", width: 110 },
  { title: "有效期", dataIndex: "memberExpireAt", width: 115 },
  {
    title: "累计消费次数",
    dataIndex: "consumptionCount",
    align: "right",
    width: 120,
  },
  {
    title: "累计消费金额",
    slotName: "consumptionAmount",
    align: "right",
    width: 130,
  },
  {
    title: "该归属消费次数",
    dataIndex: "attributionConsumptionCount",
    align: "right",
    width: 120,
  },
  {
    title: "该归属消费金额",
    slotName: "attributionConsumptionAmount",
    align: "right",
    width: 130,
  },
  { title: "该记录归属主理人", slotName: "manager", width: 150 },
  { title: "绑定来源", slotName: "source", width: 110 },
  { title: "绑定时间", dataIndex: "bindTime", width: 160 },
  { title: "结束时间", dataIndex: "unbindTime", width: 160 },
  { title: "状态", slotName: "status", width: 100 },
  { title: "操作", slotName: "actions", width: 210, fixed: "right" },
];
function maskIdCard(value) {
  const text = String(value || "");
  return text.length >= 8
    ? `${text.slice(0, 4)}**********${text.slice(-4)}`
    : text || "—";
}
</script>

<template>
  <section>
    <a-card title="解绑申请" :bordered="false" class="unbind-card">
      <a-table
        :columns="applicationColumns"
        :data="applications"
        :pagination="false"
        row-key="id"
        size="middle"
      >
        <template #status="{ record }"
          ><a-tag :color="statusChip(record.status)">{{
            record.status
          }}</a-tag></template
        >
        <template #actions="{ record }"
          ><template v-if="record.status === '待审核'"
            ><a-space :size="0"
              ><a-button
                type="primary"
                size="small"
                @click="emit('approve', record.id)"
                >通过</a-button
              ><a-button size="small" @click="emit('reject', record.id)"
                >拒绝</a-button
              ></a-space
            ></template
          ><span v-else class="muted">{{
            record.rejectReason || "已通过"
          }}</span></template
        >
      </a-table>
    </a-card>
    <a-card :bordered="false">
      <a-table
        :columns="bindingColumns"
        :data="bindings"
        :pagination="false"
        row-key="id"
        size="middle"
        :scroll="{ x: 2600 }"
      >
        <template #idCard="{ record }">{{
          maskIdCard(record.idCard)
        }}</template>
        <template #consumptionAmount="{ record }"
          ><span class="num"
            >¥{{ fmtMoney(record.consumptionAmount) }}</span
          ></template
        >
        <template #attributionConsumptionAmount="{ record }"
          ><span class="num"
            >¥{{ fmtMoney(record.attributionConsumptionAmount) }}</span
          ></template
        >
        <template #manager="{ record }">{{
          managers.find((item) => String(item.id) === String(record.managerId))
            ?.name || "散客"
        }}</template>
        <template #source="{ record }">{{
          BIND_SOURCES[record.bindSource]
        }}</template>
        <template #status="{ record }"
          ><a-tag :color="bindingChip(record.status)">{{
            record.status === 1
              ? "有效"
              : record.status === 2
                ? "已解除"
                : "已变更"
          }}</a-tag></template
        >
        <template #actions="{ record }"
          ><a-space :size="0"
            ><a-button
              type="text"
              size="small"
              :loading="loading"
              @click="emit('detail', { id: record.customerId }, record)"
              >订单/签到详情</a-button
            ><a-button
              v-if="record.isCurrent"
              type="text"
              size="small"
              @click="
                emit('rebind', {
                  id: record.customerId,
                  name: record.customerName,
                  currentManagerId: record.currentManagerId,
                })
              "
              >改归属</a-button
            ><a-button
              v-if="record.isCurrent"
              type="text"
              status="danger"
              size="small"
              @click="emit('unbind', record.customerId)"
              >解绑</a-button
            ></a-space
          ></template
        >
      </a-table>
    </a-card>
  </section>
</template>

<style scoped>
.unbind-card {
  margin-bottom: 16px;
}
.muted {
  color: var(--color-text-3);
  font-size: 13px;
}
.num {
  font-variant-numeric: tabular-nums;
}
</style>
