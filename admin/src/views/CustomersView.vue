<script setup>
import { fmtMoney } from "../utils/presentation.js";

defineProps({
  customers: { type: Array, default: () => [] },
  managers: { type: Array, default: () => [] },
  loading: Boolean,
});
const emit = defineEmits(["detail", "edit", "rebind", "unbind"]);
const keyword = defineModel("keyword", { type: String, default: "" });

const columns = [
  {
    title: "会员码",
    dataIndex: "memberId",
    width: 155,
    ellipsis: true,
    tooltip: true,
  },
  { title: "姓名", dataIndex: "name", width: 100 },
  { title: "电话", dataIndex: "phone", width: 125 },
  { title: "身份证号码", slotName: "idCard", width: 175 },
  { title: "生日", dataIndex: "birthday", width: 110 },
  { title: "会员类型", dataIndex: "memberType", width: 105 },
  { title: "入会时间", dataIndex: "memberSince", width: 110 },
  { title: "有效期", dataIndex: "memberExpireAt", width: 115 },
  {
    title: "消费次数",
    dataIndex: "consumptionCount",
    align: "right",
    width: 95,
  },
  {
    title: "累计消费",
    slotName: "consumptionAmount",
    align: "right",
    width: 115,
  },
  { title: "余额", slotName: "balance", align: "right", width: 110 },
  { title: "积分", dataIndex: "points", align: "right", width: 90 },
  { title: "归属主理人", slotName: "manager", width: 140 },
  { title: "操作", slotName: "actions", width: 245, fixed: "right" },
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
    <div class="toolbar">
      <a-input-search
        v-model="keyword"
        placeholder="搜索姓名/电话/身份证/会员码"
        allow-clear
        style="width: 340px"
      />
    </div>
    <a-card :bordered="false">
      <a-table
        :columns="columns"
        :data="customers"
        :pagination="false"
        row-key="id"
        size="middle"
        :scroll="{ x: 1800 }"
      >
        <template #idCard="{ record }">{{
          maskIdCard(record.idCard)
        }}</template>
        <template #consumptionAmount="{ record }"
          ><span class="num"
            >¥{{ fmtMoney(record.consumptionAmount) }}</span
          ></template
        >
        <template #balance="{ record }"
          ><span class="num">¥{{ fmtMoney(record.balance) }}</span></template
        >
        <template #manager="{ record }">{{
          managers.find((item) => String(item.id) === String(record.managerId))
            ?.name || "散客"
        }}</template>
        <template #actions="{ record }">
          <a-space :size="0">
            <a-button
              type="text"
              size="small"
              :loading="loading"
              @click="emit('detail', record)"
              >详情</a-button
            >
            <a-button type="text" size="small" @click="emit('edit', record)"
              >编辑</a-button
            >
            <a-button type="text" size="small" @click="emit('rebind', record)"
              >改归属</a-button
            >
            <a-button
              type="text"
              status="danger"
              size="small"
              @click="emit('unbind', record.id)"
              >解绑</a-button
            >
          </a-space>
        </template>
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
