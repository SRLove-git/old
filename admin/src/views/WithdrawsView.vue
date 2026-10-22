<script setup>
import {
  fmtMoney,
  statusChip,
  transferStateText,
} from "../utils/presentation.js";

defineProps({
  exportRows: { type: Array, default: () => [] },
  managers: { type: Array, default: () => [] },
  statusOptions: { type: Array, default: () => [] },
  withdraws: { type: Array, default: () => [] },
});
const emit = defineEmits(["detail", "export"]);
const keyword = defineModel("keyword", { type: String, default: "" });
const status = defineModel("status", { type: String, default: "" });
const dateRange = defineModel("dateRange", { type: Array, default: () => [] });

const columns = [
  {
    title: "提现单",
    dataIndex: "id",
    width: 140,
    ellipsis: true,
    tooltip: true,
  },
  { title: "主理人", slotName: "manager", width: 110 },
  { title: "金额", slotName: "amount", align: "right", width: 100 },
  { title: "税费", slotName: "tax", align: "right", width: 90 },
  { title: "实际到账", slotName: "actual", align: "right", width: 105 },
  {
    title: "锁定佣金",
    dataIndex: "commissionCount",
    align: "right",
    width: 95,
  },
  { title: "退款扣减", slotName: "clawback", align: "right", width: 95 },
  { title: "状态", slotName: "status", width: 90 },
  { title: "微信转账", slotName: "transfer", width: 120 },
  { title: "申请时间", dataIndex: "applyTime", width: 140 },
  { title: "支付渠道", dataIndex: "payChannel", width: 115 },
  {
    title: "打款流水号",
    dataIndex: "payOrderNo",
    width: 150,
    ellipsis: true,
    tooltip: true,
  },
  { title: "操作", slotName: "actions", width: 150, fixed: "right" },
];
</script>

<template>
  <section>
    <div class="toolbar">
      <a-space wrap>
        <a-input-search
          v-model="keyword"
          placeholder="搜索提现单/主理人/手机号/流水号/微信转账单号"
          allow-clear
          style="width: 340px"
        />
        <a-select
          v-model="status"
          :options="statusOptions"
          style="width: 140px"
        />
        <a-range-picker
          v-model="dateRange"
          value-format="YYYY-MM-DD"
          style="width: 250px"
        />
        <a-button @click="emit('export', exportRows)">导出财务 CSV</a-button>
      </a-space>
    </div>
    <a-card :bordered="false">
      <a-table
        :columns="columns"
        :data="withdraws"
        :pagination="false"
        row-key="id"
        :scroll="{ x: 1580 }"
        size="middle"
      >
        <template #manager="{ record }">{{
          managers.find((item) => String(item.id) === String(record.managerId))
            ?.name || record.managerId
        }}</template>
        <template #amount="{ record }"
          ><a-link class="num" @click="emit('detail', record)"
            >¥{{ fmtMoney(record.amount) }}</a-link
          ></template
        >
        <template #tax="{ record }"
          ><span class="num">¥{{ fmtMoney(record.tax ?? 0) }}</span></template
        >
        <template #actual="{ record }"
          ><span class="num"
            >¥{{ fmtMoney(record.actualAmount ?? record.amount) }}</span
          ></template
        >
        <template #clawback="{ record }">{{
          record.clawbackAmount ? `-¥${record.clawbackAmount}` : "—"
        }}</template>
        <template #status="{ record }"
          ><a-tag :color="statusChip(record.status)">{{
            record.status
          }}</a-tag></template
        >
        <template #transfer="{ record }">
          <a-tag
            v-if="record.transferState"
            :color="
              record.transferState === 'FAIL'
                ? 'red'
                : record.transferState === 'SUCCESS'
                  ? 'green'
                  : 'arcoblue'
            "
            >{{ transferStateText(record.transferState) }}</a-tag
          >
          <span v-else>—</span>
        </template>
        <template #actions="{ record }"
          ><a-button type="text" size="small" @click="emit('detail', record)">{{
            record.status === "待审核" ? "审核/打款" : "查看明细"
          }}</a-button></template
        >
      </a-table>
    </a-card>
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
