<script setup>
import { IconPlus } from "@arco-design/web-vue/es/icon";

defineProps({
  banners: { type: Array, default: () => [] },
  previewUrl: { type: Function, required: true },
});

const emit = defineEmits(["edit", "remove"]);

const columns = [
  { title: "ID", dataIndex: "id", width: 80 },
  { title: "媒体", slotName: "media", width: 130 },
  { title: "标题", dataIndex: "title", ellipsis: true, tooltip: true },
  { title: "副标题", dataIndex: "sub", ellipsis: true, tooltip: true },
  {
    title: "跳转链接",
    dataIndex: "linkUrl",
    width: 220,
    ellipsis: true,
    tooltip: true,
  },
  { title: "排序", dataIndex: "sort", width: 80 },
  { title: "状态", slotName: "status", width: 90 },
  { title: "操作", slotName: "actions", width: 140 },
];
</script>

<template>
  <section>
    <a-card :bordered="false">
      <a-table
        :columns="columns"
        :data="banners"
        :pagination="false"
        row-key="id"
        size="middle"
      >
        <template #media="{ record }">
          <video
            v-if="record.mediaType === 'video' && record.mediaUrl"
            class="media"
            :src="previewUrl(record.mediaUrl)"
            muted
          />
          <img
            v-else-if="record.mediaUrl"
            class="media"
            :src="previewUrl(record.mediaUrl)"
            alt="Banner"
          />
          <span v-else>{{ record.emoji || "—" }} 旧版背景</span>
        </template>
        <template #status="{ record }">
          <a-tag :color="record.status === 0 ? 'gray' : 'green'">
            {{ record.status === 0 ? "已下架" : "已发布" }}
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
      发布 Banner
    </a-button>
  </section>
</template>

<style scoped>
.media {
  display: block;
  width: 104px;
  height: 58px;
  border-radius: 6px;
  background: var(--color-fill-2);
  object-fit: cover;
}

.fab {
  position: fixed;
  right: 32px;
  bottom: 32px;
  z-index: 20;
  box-shadow: 0 6px 20px rgba(29, 27, 22, 0.16);
}
</style>
