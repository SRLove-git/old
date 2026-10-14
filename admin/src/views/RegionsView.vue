<script setup>
import { IconPlus } from "@arco-design/web-vue/es/icon";
import { regionArea } from "../utils/regions.js";
defineProps({ regions: { type: Array, default: () => [] } });
const emit = defineEmits(["edit", "toggle"]);
const columns = [
  { title: "省", slotName: "province", width: 150 },
  { title: "市", slotName: "city", width: 150 },
  { title: "区/县", slotName: "district", width: 150 },
  { title: "行政区划代码", slotName: "code", width: 140 },
  { title: "排序", dataIndex: "sort", width: 100 },
  { title: "前台状态", slotName: "status", width: 120 },
  { title: "操作", slotName: "actions", width: 180 },
];
</script>
<template>
  <section>
    <a-alert type="info" class="toolbar"
      >停用地区后，前台不再显示该地区筛选，新发布内容也不能选择；历史活动、商品和订单关联会保留。</a-alert
    >
    <a-card :bordered="false"
      ><a-table
        :columns="columns"
        :data="regions"
        :pagination="false"
        row-key="id"
      >
        <template #province="{ record }">{{
          regionArea(record).province || "待完善"
        }}</template
        ><template #city="{ record }">{{
          regionArea(record).city || "待完善"
        }}</template
        ><template #district="{ record }">{{
          regionArea(record).district || record.name
        }}</template
        ><template #code="{ record }">{{
          record.code || regionArea(record).districtCode || "—"
        }}</template>
        <template #status="{ record }"
          ><a-tag :color="record.enabled !== false ? 'green' : 'gray'">{{
            record.enabled !== false ? "已启用" : "已停用"
          }}</a-tag></template
        >
        <template #actions="{ record }"
          ><a-space :size="0"
            ><a-button type="text" size="small" @click="emit('edit', record)"
              >编辑</a-button
            ><a-button
              type="text"
              size="small"
              @click="emit('toggle', record)"
              >{{ record.enabled !== false ? "停用" : "启用" }}</a-button
            ></a-space
          ></template
        >
      </a-table></a-card
    >
    <a-button
      type="primary"
      shape="round"
      class="fab"
      @click="emit('edit', null)"
      ><template #icon><IconPlus /></template>新增地区</a-button
    >
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
