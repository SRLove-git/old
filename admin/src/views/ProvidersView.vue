<script setup>
import { statusChip } from "../utils/presentation.js";

defineProps({ applications: { type: Array, default: () => [] } });
const emit = defineEmits(["review"]);

const columns = [
  { title: "ID", dataIndex: "id", width: 80 },
  { title: "姓名", dataIndex: "name", width: 120 },
  { title: "手机号", dataIndex: "phone", width: 140 },
  { title: "主体类型", slotName: "type", width: 100 },
  { title: "简介", dataIndex: "intro", ellipsis: true, tooltip: true },
  {
    title: "联系地址",
    dataIndex: "address",
    ellipsis: true,
    tooltip: true,
    width: 180,
  },
  { title: "状态", slotName: "status", width: 100 },
  { title: "开户状态", slotName: "account", width: 150 },
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
        row-key="id"
        size="middle"
      >
        <template #type="{ record }">{{
          record.type === "company" ? "公司/机构" : "个人"
        }}</template>
        <template #status="{ record }"
          ><a-tag :color="statusChip(record.status)">{{
            record.status
          }}</a-tag></template
        >
        <template #account="{ record }">
          <a-tag v-if="record.merchantAccountId || record.loginUsername" color="green">
            {{ record.loginUsername || "已开户" }}
          </a-tag>
          <a-tag v-else-if="record.status === '已通过'" color="orange">待开户</a-tag>
          <span v-else class="muted">—</span>
        </template>
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
}
</style>
