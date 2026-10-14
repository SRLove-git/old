<script setup>
import { IconPlus } from "@arco-design/web-vue/es/icon";

defineProps({ posts: { type: Array, default: () => [] } });
const emit = defineEmits(["edit", "remove"]);

const columns = [
  { title: "类型", slotName: "type", width: 100 },
  { title: "标题", dataIndex: "title", ellipsis: true, tooltip: true },
  { title: "来源", dataIndex: "source", width: 180 },
  { title: "发布日期", dataIndex: "publishedAt", width: 120 },
  { title: "状态", slotName: "status", width: 90 },
  { title: "操作", slotName: "actions", width: 140 },
];
</script>

<template>
  <section>
    <a-alert type="info" class="toolbar"
      >转载政府信息时请填写准确来源与原文链接，正文不要改动政策口径。</a-alert
    >
    <a-card :bordered="false">
      <a-table
        :columns="columns"
        :data="posts"
        :pagination="false"
        row-key="id"
      >
        <template #type="{ record }">
          <a-tag :color="record.type === 'video' ? 'purple' : 'arcoblue'">
            {{ record.type === "video" ? "视频" : "政策资讯" }}
          </a-tag>
        </template>
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
      新增资讯/视频
    </a-button>
  </section>
</template>

<style scoped>
.toolbar {
  margin-bottom: 16px;
}

.fab {
  position: fixed;
  right: 32px;
  bottom: 32px;
  z-index: 20;
  box-shadow: 0 6px 20px rgba(29, 27, 22, 0.16);
}
</style>
