<script setup>
import { computed } from "vue";
import { IconPlus } from "@arco-design/web-vue/es/icon";
import { fmtMoney } from "../utils/presentation.js";

const props = defineProps({
  lives: { type: Array, default: () => [] },
  merchant: { type: Object, default: null },
  merchantOptions: { type: Array, default: () => [] },
});

const merchantId = defineModel("merchantId", { type: String, default: "" });
const emit = defineEmits(["edit", "remove"]);

const columns = [
  { title: "课程名称", dataIndex: "title", ellipsis: true, tooltip: true },
  { title: "讲师", dataIndex: "hostName", width: 120 },
  { title: "分类", dataIndex: "category", width: 120 },
  { title: "会员价", slotName: "price", width: 100, align: "right" },
  { title: "课时", dataIndex: "lessonCount", width: 80, align: "right" },
  { title: "状态", slotName: "status", width: 100 },
  { title: "操作", slotName: "actions", width: 140 },
];

const merchantLives = computed(() =>
  merchantId.value
    ? props.lives.filter(
        (item) => String(item.managerId) === String(merchantId.value),
      )
    : [],
);

function statusMeta(status) {
  if (status === "live") return { label: "直播中", color: "red" };
  if (status === "ended") return { label: "已结束", color: "gray" };
  return { label: "未开课", color: "arcoblue" };
}
</script>

<template>
  <section>
    <a-card
      title="第一步：选择商家"
      :bordered="false"
      class="merchant-scope-card"
    >
      <a-select
        v-model="merchantId"
        :options="merchantOptions"
        allow-search
        allow-clear
        placeholder="请选择要管理的商家"
        class="merchant-select"
      />
      <span v-if="merchant" class="muted"
        >当前正在管理：{{ merchant.shopName || merchant.name }}</span
      >
    </a-card>
    <a-alert type="info" class="toolbar"
      >选择商家后，可维护该商家的直播课、视频课和配套学堂内容。</a-alert
    >
    <a-card :bordered="false">
      <a-table
        :columns="columns"
        :data="merchantLives"
        :pagination="false"
        row-key="id"
        size="middle"
      >
        <template #price="{ record }"
          ><span>¥{{ fmtMoney(record.memberPrice) }}</span></template
        >
        <template #status="{ record }">
          <a-tag :color="statusMeta(record.status).color">{{
            statusMeta(record.status).label
          }}</a-tag>
        </template>
        <template #actions="{ record }">
          <a-space :size="0">
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
      :disabled="!merchantId"
      @click="emit('edit', null)"
    >
      <template #icon><IconPlus /></template>
      新建课程
    </a-button>
  </section>
</template>

<style scoped>
.merchant-scope-card {
  margin-bottom: 16px;
}

.merchant-scope-card :deep(.arco-card-body) {
  display: flex;
  align-items: center;
  gap: 16px;
}

.merchant-select {
  width: 420px;
}

.toolbar {
  margin-bottom: 16px;
}

.muted {
  color: var(--color-text-3);
  font-size: 13px;
}

.fab {
  position: fixed;
  right: 32px;
  bottom: 32px;
  z-index: 20;
  box-shadow: 0 6px 20px rgba(29, 27, 22, 0.16);
}
</style>
