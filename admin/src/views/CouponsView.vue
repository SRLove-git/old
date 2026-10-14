<script setup>
import { IconPlus } from "@arco-design/web-vue/es/icon";
import { fmtMoney } from "../utils/presentation.js";

defineProps({
  coupons: { type: Array, default: () => [] },
  couponTypes: { type: Object, required: true },
  publisherName: { type: Function, required: true },
});

const emit = defineEmits(["records", "edit", "remove"]);

const columns = [
  { title: "ID", dataIndex: "id", width: 150, ellipsis: true, tooltip: true },
  { title: "标题", dataIndex: "title", ellipsis: true, tooltip: true },
  { title: "发布归属", slotName: "publisher", width: 170 },
  { title: "类型", slotName: "type", width: 110 },
  { title: "面额", slotName: "value", align: "right", width: 90 },
  { title: "门槛", slotName: "min", width: 90 },
  { title: "有效期", dataIndex: "expireAt", width: 120 },
  { title: "发布状态", slotName: "publishStatus", width: 100 },
  { title: "发放数量", dataIndex: "issuedCount", align: "right", width: 95 },
  { title: "已使用", dataIndex: "usedCount", align: "right", width: 85 },
  { title: "操作", slotName: "actions", width: 210 },
];
</script>

<template>
  <section>
    <a-card :bordered="false">
      <a-table
        :columns="columns"
        :data="coupons"
        :pagination="false"
        row-key="id"
        size="middle"
      >
        <template #publisher="{ record }">
          <a-tag
            :color="record.publisherType === 'merchant' ? 'orange' : 'arcoblue'"
          >
            {{ record.publisherName || publisherName(record) }}
          </a-tag>
        </template>
        <template #type="{ record }">{{ couponTypes[record.type] }}</template>
        <template #value="{ record }">¥{{ fmtMoney(record.value) }}</template>
        <template #min="{ record }">满 {{ record.minAmount }}</template>
        <template #publishStatus="{ record }">
          <a-tag :color="record.status === 0 ? 'gray' : 'green'">
            {{ record.status === 0 ? "已下架" : "已发布" }}
          </a-tag>
        </template>
        <template #actions="{ record }">
          <a-space :size="0">
            <a-button type="text" size="small" @click="emit('records', record)"
              >领取记录</a-button
            >
            <a-button type="text" size="small" @click="emit('edit', record)"
              >编辑</a-button
            >
            <a-button
              type="text"
              status="danger"
              size="small"
              @click="emit('remove', record.id)"
              >删除</a-button
            >
          </a-space>
        </template>
      </a-table>
    </a-card>
    <a-button
      type="primary"
      shape="round"
      class="fab"
      @click="emit('edit', null)"
    >
      <template #icon><IconPlus /></template>
      发布优惠券
    </a-button>
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
