<script setup>
import { IconPlus } from "@arco-design/web-vue/es/icon";
import { CATEGORY_TYPES } from "../options.js";
import { typeTagColor } from "../utils/presentation.js";

defineProps({ categories: { type: Array, default: () => [] } });
const emit = defineEmits(["edit", "remove"]);

const columns = [
  { title: "ID", dataIndex: "id", width: 80 },
  { title: "图标", slotName: "emoji", width: 70 },
  { title: "名称", dataIndex: "name", width: 140 },
  { title: "简称", dataIndex: "short", width: 100 },
  { title: "类型", slotName: "type", width: 90 },
  { title: "首页显示", slotName: "homeDisplayLimit", width: 100 },
  { title: "主题色", slotName: "color", width: 140 },
  { title: "操作", slotName: "actions", width: 140 },
];
</script>

<template>
  <section>
    <div class="list-create-toolbar">
      <a-button type="primary" shape="round" @click="emit('edit', null)">
        <template #icon><IconPlus /></template>
        新建分类
      </a-button>
    </div>
    <a-card :bordered="false">
      <a-table
        :columns="columns"
        :data="categories"
        :pagination="false"
        row-key="id"
        size="middle"
      >
        <template #emoji="{ record }">{{ record.emoji }}</template>
        <template #type="{ record }"
          ><a-tag :color="typeTagColor(record.type)">{{
            CATEGORY_TYPES[record.type] || "活动"
          }}</a-tag></template
        >
        <template #homeDisplayLimit="{ record }"
          >{{ record.homeDisplayLimit ?? 6 }} 个</template
        >
        <template #color="{ record }"
          ><span class="color-dot" :style="{ background: record.color }" />{{
            record.color
          }}</template
        >
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
.color-dot {
  display: inline-block;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  margin-right: 8px;
  vertical-align: -2px;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
}
</style>
