<script setup>
import { computed } from "vue";
import { IconPlus } from "@arco-design/web-vue/es/icon";
import { fmtMoney } from "../utils/presentation.js";

const props = defineProps({
  products: { type: Array, default: () => [] },
  publisherOptions: { type: Array, default: () => [] },
  publisherName: { type: Function, required: true },
  categoryName: { type: Function, required: true },
  regionNames: { type: Function, required: true },
});

const publisherId = defineModel("publisherId", {
  type: [String, Number],
  default: "platform",
});
const emit = defineEmits(["edit", "remove"]);

const columns = [
  { title: "ID", dataIndex: "id", width: 80 },
  { title: "标题", dataIndex: "title", ellipsis: true, tooltip: true },
  { title: "发布归属", slotName: "publisher", width: 150 },
  { title: "分类", slotName: "category", width: 110 },
  { title: "适用地区", slotName: "regions", width: 180 },
  { title: "会员价", slotName: "price", align: "right", width: 110 },
  { title: "销量", dataIndex: "soldCount", align: "right", width: 90 },
  { title: "库存", dataIndex: "stock", align: "right", width: 90 },
  { title: "状态", slotName: "status", width: 90 },
  { title: "操作", slotName: "actions", width: 140 },
];

const visibleProducts = computed(() =>
  publisherId.value === "platform"
    ? props.products.filter(
        (item) => item.publisherType === "platform" || !item.managerId,
      )
    : props.products.filter(
        (item) => String(item.managerId) === String(publisherId.value),
      ),
);
</script>

<template>
  <section>
    <a-card
      title="第一步：选择发布归属"
      :bordered="false"
      class="merchant-scope-card"
    >
      <a-select
        v-model="publisherId"
        :options="publisherOptions"
        allow-search
        placeholder="请选择平台或商家"
        class="publisher-select"
      />
      <span class="muted">
        当前正在管理：{{
          publisherId === "platform"
            ? "岁悦里平台"
            : publisherName({ managerId: publisherId })
        }}
      </span>
    </a-card>
    <a-card :bordered="false">
      <a-table
        :columns="columns"
        :data="visibleProducts"
        :pagination="false"
        row-key="id"
        size="middle"
      >
        <template #category="{ record }"
          ><a-tag color="arcoblue">{{
            categoryName(record.category)
          }}</a-tag></template
        >
        <template #publisher="{ record }">
          <a-tag
            :color="
              record.publisherType === 'platform' || !record.managerId
                ? 'purple'
                : 'green'
            "
          >
            {{ publisherName(record) }}
          </a-tag>
        </template>
        <template #regions="{ record }">{{ regionNames(record) }}</template>
        <template #price="{ record }"
          >¥{{ fmtMoney(record.memberPrice) }}</template
        >
        <template #status="{ record }">
          <a-tag :color="record.status !== 0 ? 'green' : 'gray'">
            {{ record.status !== 0 ? "上架" : "下架" }}
          </a-tag>
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
      @click="emit('edit', null)"
    >
      <template #icon><IconPlus /></template>
      新建商品
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
.publisher-select {
  width: 420px;
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
