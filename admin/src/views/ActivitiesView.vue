<script setup>
import { computed } from "vue";
import { isPlatformPublisher, isOrphanedMerchantPublisher, matchesPublisher } from "../utils/catalog-publisher.js";
import { IconPlus } from "@arco-design/web-vue/es/icon";
import { fmtMoney, fuzzyMatch } from "../utils/presentation.js";

const props = defineProps({
  activities: { type: Array, default: () => [] },
  categories: { type: Array, default: () => [] },
  publisherOptions: { type: Array, default: () => [] },
  publisherOptionsLoading: { type: Boolean, default: false },
  publisherOptionsError: { type: String, default: "" },
  publisherName: { type: Function, required: true },
  categoryName: { type: Function, required: true },
  regionNames: { type: Function, required: true },
});

const keyword = defineModel("keyword", { type: String, default: "" });
const publisherId = defineModel("publisherId", {
  type: [String, Number],
  default: "platform",
});
const category = defineModel("category", {
  type: [String, Number],
  default: "all",
});
const emit = defineEmits(["edit", "remove", "retry-publishers"]);
const selectedPublisher = computed(() =>
  props.publisherOptions.find(
    (option) => String(option.value) === String(publisherId.value),
  ),
);

const columns = [
  { title: "ID", dataIndex: "id", width: 80 },
  { title: "标题", dataIndex: "title", ellipsis: true, tooltip: true },
  { title: "发布归属", slotName: "publisher", width: 150 },
  { title: "分类", slotName: "category", width: 110 },
  { title: "适用地区", slotName: "regions", width: 180 },
  { title: "会员价", slotName: "price", align: "right", width: 110 },
  { title: "已报名", dataIndex: "soldCount", align: "right", width: 90 },
  { title: "状态", slotName: "status", width: 90 },
  { title: "操作", slotName: "actions", width: 140 },
];

const categoryOptions = computed(() => [
  { label: "全部分类", value: "all" },
  ...props.categories
    .filter((item) => item.type !== "product")
    .map((item) => ({ label: item.name, value: item.id })),
]);

const filteredActivities = computed(() => {
  const search = keyword.value.trim();
  return props.activities.filter((activity) => {
    const matchesCategory =
      category.value === "all" ||
      String(activity.category) === String(category.value);
    const text = [
      activity.title,
      activity.city,
      props.regionNames(activity),
      activity.address,
      activity.highlight,
      activity.detail,
      (activity.points || []).join(" "),
    ]
      .filter(Boolean)
      .join(" ");
    return matchesPublisher(activity, publisherId.value) && matchesCategory && fuzzyMatch(text, search);
  });
});
</script>

<template>
  <section>
    <a-card
      title="选择发布归属"
      :bordered="false"
      class="merchant-scope-card"
    >
      <a-select
        v-model="publisherId"
        :options="publisherOptions"
        :loading="publisherOptionsLoading"
        allow-search
        placeholder="请选择平台或商家"
        class="publisher-select"
      />
      <span class="muted">
        当前正在管理：{{
          publisherId === "platform"
            ? "平台自营"
            : publisherId === "orphaned"
              ? "归属异常（待修复）"
            : publisherName({ managerId: publisherId })
        }}
      </span>
      <a-button
        v-if="publisherOptionsError"
        type="text"
        size="small"
        status="warning"
        @click="emit('retry-publishers')"
      >{{ publisherOptionsError }} 点击重试</a-button>
    </a-card>
    <a-alert type="info" class="toolbar"
      >个人中心“商家福利”展示这里分类为“商家福利”的已上架内容。</a-alert
    >
    <div class="toolbar">
      <a-select
        v-model="category"
        :options="categoryOptions"
        class="category-select"
      />
      <a-input-search
        v-model="keyword"
        placeholder="搜索标题/城市"
        allow-clear
        class="search-input"
      />
      <a-button
        type="primary"
        class="list-create-action"
        shape="round"
        :disabled="selectedPublisher?.historical"
        @click="emit('edit', null)"
      >
        <template #icon><IconPlus /></template>
        {{ selectedPublisher?.historical ? "该归属不可新建" : publisherId === "platform" ? "新建平台活动" : "为该商家新建活动" }}
      </a-button>
    </div>
    <a-card :bordered="false">
      <a-table
        :columns="columns"
        :data="filteredActivities"
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
              isPlatformPublisher(record)
                ? 'purple'
                : isOrphanedMerchantPublisher(record)
                  ? 'orange'
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
          <a-tag
            :color="
              record.status === 0 ? 'gray' : record.expired ? 'orange' : 'green'
            "
          >
            {{
              record.status === 0 ? "下架" : record.expired ? "已过期" : "上架"
            }}
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
  </section>
</template>

<style scoped>
.merchant-scope-card,
.toolbar {
  margin-bottom: 16px;
}

.merchant-scope-card :deep(.arco-card-body) {
  display: flex;
  align-items: center;
  gap: 16px;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.publisher-select {
  width: 420px;
}
.list-create-action {
  margin-left: auto;
}
.category-select {
  width: 180px;
}
.search-input {
  width: 280px;
}
.muted {
  color: var(--color-text-3);
  font-size: 13px;
}
</style>
