<script setup>
import { IconPlus } from "@arco-design/web-vue/es/icon";
import { fmtMoney, managerChip } from "../utils/presentation.js";

defineProps({ managers: { type: Array, default: () => [] } });
const emit = defineEmits(["create", "finance", "status"]);
const columns = [
  { title: "ID", dataIndex: "id", width: 70 },
  { title: "姓名", dataIndex: "name", width: 100 },
  { title: "手机号", dataIndex: "phone", width: 130 },
  { title: "邀请码", dataIndex: "inviteCode", width: 100 },
  { title: "累计业绩", slotName: "performance", align: "right", width: 115 },
  { title: "累计佣金", slotName: "commission", align: "right", width: 115 },
  { title: "可结算", slotName: "available", align: "right", width: 100 },
  { title: "待结算", slotName: "pending", align: "right", width: 100 },
  { title: "提现中", slotName: "withdrawing", align: "right", width: 100 },
  { title: "已打款", slotName: "settled", align: "right", width: 100 },
  { title: "状态", slotName: "status", width: 80 },
  { title: "操作", slotName: "actions", width: 190, fixed: "right" },
];
</script>

<template>
  <section>
    <a-card :bordered="false"
      ><a-table
        :columns="columns"
        :data="managers"
        :pagination="false"
        row-key="id"
        size="middle"
      >
        <template #performance="{ record }"
          ><a-button type="text" size="small" @click="emit('finance', record)"
            >¥{{ fmtMoney(record.totalPerformance) }}</a-button
          ></template
        >
        <template #commission="{ record }"
          ><a-button type="text" size="small" @click="emit('finance', record)"
            >¥{{ fmtMoney(record.totalCommission) }}</a-button
          ></template
        >
        <template #available="{ record }"
          ><a-button
            type="text"
            size="small"
            @click="emit('finance', record, '可结算')"
            >¥{{ fmtMoney(record.available) }}</a-button
          ></template
        >
        <template #pending="{ record }"
          ><a-button
            type="text"
            size="small"
            @click="emit('finance', record, '待结算')"
            >¥{{ fmtMoney(record.pending) }}</a-button
          ></template
        >
        <template #withdrawing="{ record }"
          ><a-button
            type="text"
            size="small"
            @click="emit('finance', record, '提现中')"
            >¥{{ fmtMoney(record.withdrawing) }}</a-button
          ></template
        >
        <template #settled="{ record }"
          ><a-button
            type="text"
            size="small"
            @click="emit('finance', record, '已结算')"
            >¥{{ fmtMoney(record.settled) }}</a-button
          ></template
        >
        <template #status="{ record }"
          ><a-tag :color="managerChip(record.status)">{{
            record.status === 1
              ? "正常"
              : record.status === 2
                ? "已冻结"
                : "已清退"
          }}</a-tag></template
        >
        <template #actions="{ record }"
          ><a-space :size="0"
            ><a-button type="text" size="small" @click="emit('finance', record)"
              >金额明细</a-button
            ><a-button
              v-if="record.status !== 2"
              type="text"
              size="small"
              @click="emit('status', record.id, 2)"
              >冻结</a-button
            ><a-button
              v-if="record.status === 2"
              type="text"
              size="small"
              @click="emit('status', record.id, 1)"
              >解冻</a-button
            ><a-button
              type="text"
              status="danger"
              size="small"
              @click="emit('status', record.id, 3)"
              >清退</a-button
            ></a-space
          ></template
        >
      </a-table></a-card
    >
    <a-button type="primary" shape="round" class="fab" @click="emit('create')"
      ><template #icon><IconPlus /></template>新增主理人</a-button
    >
  </section>
</template>

<style scoped>
.fab {
  position: fixed;
  right: 32px;
  bottom: 32px;
  z-index: 20;
  box-shadow: 0 6px 20px rgba(29, 27, 22, 0.16);
}
</style>
