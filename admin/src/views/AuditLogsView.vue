<script setup>
defineProps({ logs: { type: Array, default: () => [] } });

const columns = [
  { title: "时间", dataIndex: "time", width: 180 },
  { title: "操作账号", slotName: "operator", width: 160 },
  { title: "操作", slotName: "action", width: 140 },
  { title: "详情", dataIndex: "detail" },
];
</script>

<template>
  <section>
    <a-card :bordered="false">
      <a-table
        :columns="columns"
        :data="logs"
        :pagination="false"
        row-key="id"
        size="middle"
      >
        <template #operator="{ record }">
          {{ record.operatorName || record.operatorAccount || "历史记录" }}
          <span v-if="record.operatorAccount" class="muted"
            >（{{ record.operatorAccount }}）</span
          >
        </template>
        <template #action="{ record }"
          ><a-tag color="arcoblue">{{ record.action }}</a-tag></template
        >
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
