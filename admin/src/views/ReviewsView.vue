<script setup>
defineProps({
  activities: { type: Array, default: () => [] },
  reviews: { type: Array, default: () => [] },
});
const emit = defineEmits(["reply", "toggle", "remove"]);
const columns = [
  { title: "ID", dataIndex: "id", width: 150, ellipsis: true, tooltip: true },
  { title: "活动", slotName: "activity", ellipsis: true, tooltip: true },
  { title: "用户", dataIndex: "name", width: 110 },
  { title: "评分", slotName: "rating", width: 80 },
  { title: "内容", dataIndex: "content", ellipsis: true, tooltip: true },
  {
    title: "官方回复",
    slotName: "reply",
    ellipsis: true,
    tooltip: true,
    width: 220,
  },
  { title: "展示状态", slotName: "visibility", width: 100 },
  { title: "时间", dataIndex: "time", width: 160 },
  { title: "操作", slotName: "actions", width: 250, fixed: "right" },
];
</script>
<template>
  <section>
    <a-card :bordered="false"
      ><a-table
        :columns="columns"
        :data="reviews"
        :pagination="false"
        row-key="id"
        size="middle"
        :scroll="{ x: 1250 }"
      >
        <template #activity="{ record }">{{
          activities.find(
            (item) => String(item.id) === String(record.activityId),
          )?.title || record.activityId
        }}</template
        ><template #rating="{ record }">{{ record.rating }}星</template
        ><template #reply="{ record }"
          ><span v-if="record.reply">{{ record.reply }}</span
          ><span v-else class="muted">未回复</span></template
        ><template #visibility="{ record }"
          ><a-tag :color="record.hidden ? 'gray' : 'green'">{{
            record.hidden ? "已屏蔽" : "展示中"
          }}</a-tag></template
        >
        <template #actions="{ record }"
          ><a-space :size="0"
            ><a-button
              type="text"
              size="small"
              @click="emit('reply', record)"
              >{{ record.reply ? "修改回复" : "回复" }}</a-button
            ><a-button
              type="text"
              size="small"
              :status="record.hidden ? 'success' : 'warning'"
              @click="emit('toggle', record)"
              >{{ record.hidden ? "恢复" : "屏蔽" }}</a-button
            ><a-button
              type="text"
              status="danger"
              size="small"
              @click="emit('remove', record.id)"
              >删除</a-button
            ></a-space
          ></template
        >
      </a-table></a-card
    >
  </section>
</template>
<style scoped>
.muted {
  color: var(--color-text-3);
  font-size: 13px;
}
</style>
