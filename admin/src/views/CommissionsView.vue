<script setup>
import { fmtMoney, statusChip } from "../utils/presentation.js";

defineProps({
  commissions: { type: Array, default: () => [] },
  managerOptions: { type: Array, default: () => [] },
  managers: { type: Array, default: () => [] },
  settlementColumns: { type: Array, default: () => [] },
  settlements: { type: Array, default: () => [] },
});
const emit = defineEmits([
  "adjust",
  "export",
  "settle-all",
  "settle-manager",
  "settle-one",
]);
const keyword = defineModel("keyword", { type: String, default: "" });
const managerId = defineModel("managerId", { default: "" });
const columns = [
  {
    title: "佣金单",
    dataIndex: "id",
    width: 150,
    ellipsis: true,
    tooltip: true,
  },
  { title: "主理人", slotName: "manager", width: 110 },
  { title: "客户", dataIndex: "customerName", width: 120 },
  { title: "商品", dataIndex: "productName", ellipsis: true, tooltip: true },
  { title: "原价", slotName: "originalAmount", align: "right", width: 100 },
  { title: "优惠价", slotName: "discountedAmount", align: "right", width: 100 },
  {
    title: "实际支付",
    slotName: "actualPaidAmount",
    align: "right",
    width: 105,
  },
  { title: "比例", slotName: "rate", align: "right", width: 80 },
  { title: "金额", slotName: "amount", align: "right", width: 110 },
  { title: "状态", slotName: "status", width: 110 },
  { title: "创建时间", dataIndex: "createTime", width: 160 },
  { title: "结算时间", dataIndex: "settleTime", width: 160 },
  { title: "操作", slotName: "actions", width: 160 },
];
</script>

<template>
  <section>
    <div class="toolbar">
      <a-space wrap
        ><a-input-search
          v-model="keyword"
          placeholder="搜索主理人/订单/客户/商品"
          allow-clear
          style="width: 280px"
        /><a-select
          v-model="managerId"
          :options="managerOptions"
          placeholder="全部主理人"
          allow-search
          allow-clear
          style="width: 180px"
        /><a-button type="primary" @click="emit('settle-manager')"
          >按主理人结算</a-button
        ><a-button @click="emit('settle-all')">全库一键转可结算</a-button
        ><a-button @click="emit('export', commissions)"
          >导出佣金 CSV</a-button
        ></a-space
      >
    </div>
    <a-card :bordered="false"
      ><a-table
        :columns="columns"
        :data="commissions"
        :pagination="false"
        row-key="id"
        :scroll="{ x: 1700 }"
        size="middle"
      >
        <template #manager="{ record }">{{
          managers.find((item) => String(item.id) === String(record.managerId))
            ?.name || record.managerId
        }}</template
        ><template #originalAmount="{ record }"
          ><span class="num"
            >¥{{ fmtMoney(record.originalAmount) }}</span
          ></template
        ><template #discountedAmount="{ record }"
          ><span class="num"
            >¥{{ fmtMoney(record.discountedAmount) }}</span
          ></template
        ><template #actualPaidAmount="{ record }"
          ><strong class="num"
            >¥{{
              fmtMoney(record.actualPaidAmount ?? record.payAmount)
            }}</strong
          ></template
        ><template #rate="{ record }">{{ record.commissionRate }}%</template
        ><template #amount="{ record }"
          ><span class="num"
            >¥{{ fmtMoney(record.commissionAmount) }}</span
          ></template
        ><template #status="{ record }"
          ><a-tag :color="statusChip(record.status)">{{
            record.status
          }}</a-tag></template
        ><template #actions="{ record }"
          ><a-space :size="0"
            ><a-button
              v-if="record.status === '待结算'"
              type="text"
              size="small"
              @click="emit('settle-one', record)"
              >结算</a-button
            ><a-button type="text" size="small" @click="emit('adjust', record)"
              >调整</a-button
            ></a-space
          ></template
        >
      </a-table></a-card
    >
    <a-card
      title="结算流水（按结算单留痕）"
      :bordered="false"
      style="margin-top: 16px"
      ><a-table
        :columns="settlementColumns"
        :data="settlements"
        :pagination="false"
        row-key="id"
        size="small"
        ><template #amount="{ record }"
          ><span class="num">¥{{ fmtMoney(record.amount) }}</span></template
        ></a-table
      ></a-card
    >
  </section>
</template>
<style scoped>
.toolbar {
  margin-bottom: 16px;
}
.num {
  font-variant-numeric: tabular-nums;
}
</style>
