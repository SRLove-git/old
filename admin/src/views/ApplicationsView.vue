<script setup>
import { fmtMoney, statusChip } from "../utils/presentation.js";

defineProps({ applications: { type: Array, default: () => [] } });
const emit = defineEmits(["review"]);

const columns = [
  { title: "姓名", dataIndex: "name", width: 120 },
  { title: "电话", dataIndex: "phone", width: 140 },
  { title: "微信群", dataIndex: "groupCount", width: 90 },
  { title: "社群人数", dataIndex: "memberCount", width: 100 },
  {
    title: "擅长",
    slotName: "fields",
    ellipsis: true,
    tooltip: true,
    width: 170,
  },
  {
    title: "个人简介",
    dataIndex: "intro",
    ellipsis: true,
    tooltip: true,
    width: 180,
  },
  { title: "收费情况", slotName: "paid", width: 170 },
  { title: "支付凭证", slotName: "payment", width: 240 },
  { title: "状态", slotName: "status", width: 100 },
  { title: "提交时间", dataIndex: "submittedAt", width: 160 },
  { title: "操作", slotName: "actions", width: 120, fixed: "right" },
];
</script>

<template>
  <section>
    <a-card :bordered="false">
      <a-table
        :columns="columns"
        :data="applications"
        :pagination="false"
        :scroll="{ x: 1600 }"
        row-key="id"
        size="middle"
      >
        <template #fields="{ record }">{{
          (record.fields || []).join("、")
        }}</template>
        <template #paid="{ record }">
          <div>
            <span class="muted">应收</span> ¥{{
              fmtMoney(record.feeAmount ?? record.paidAmount)
            }}
          </div>
          <div v-if="record.paidAmount > 0">
            <strong>到账 ¥{{ fmtMoney(record.paidAmount) }}</strong>
            <div class="muted">{{ record.paymentStatus || "待核对" }}</div>
          </div>
          <div v-else class="muted">{{ record.paymentStatus || "未收费" }}</div>
        </template>
        <template #payment="{ record }">
          <div v-if="record.paymentOrderNo">
            <div>{{ record.paymentMethod || "—" }}</div>
            <div class="muted">{{ record.paymentOrderNo }}</div>
            <div class="muted">{{ record.paidAt || "—" }}</div>
          </div>
          <span v-else class="muted">暂无支付凭证</span>
        </template>
        <template #status="{ record }"
          ><a-tag :color="statusChip(record.status)">{{
            record.status
          }}</a-tag></template
        >
        <template #actions="{ record }">
          <a-button type="text" size="small" @click="emit('review', record)">
            {{ record.status === "待审核" ? "查看/审核" : "查看详情" }}
          </a-button>
        </template>
      </a-table>
    </a-card>
  </section>
</template>

<style scoped>
.muted {
  color: var(--color-text-3);
  font-size: 13px;
}
</style>
