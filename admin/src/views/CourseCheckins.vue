<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";
import { api } from "../api.js";

const items = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const loading = ref(false);
const error = ref("");
let request = 0;
let timer;

async function load(target = page.value) {
  const id = ++request;
  loading.value = true;
  try {
    const result = await api.get("/cards/checkins?page=" + target);
    if (id !== request) return;
    items.value = result.items;
    total.value = result.total;
    page.value = result.page;
    pageSize.value = result.pageSize;
    error.value = "";
  } catch (e) {
    if (id === request) error.value = e.message;
  } finally {
    if (id === request) loading.value = false;
  }
}

function refreshVisible() {
  if (!document.hidden && !loading.value) load();
}
onMounted(() => {
  load();
  timer = window.setInterval(refreshVisible, 15000);
  document.addEventListener("visibilitychange", refreshVisible);
});
onBeforeUnmount(() => {
  request++;
  window.clearInterval(timer);
  document.removeEventListener("visibilitychange", refreshVisible);
});
</script>

<template>
  <a-card title="已签到记录">
    <template #extra>
      <a-button size="small" :loading="loading" @click="load()">刷新记录</a-button>
    </template>
    <a-alert v-if="error" type="error">{{ error }}</a-alert>
    <a-table
      row-key="key"
      :data="items"
      :loading="loading && !items.length"
      :scroll="{ x: 980 }"
      :pagination="{ current: page, pageSize, total, showTotal: true }"
      @page-change="load"
    >
      <template #columns>
        <a-table-column title="签到时间" :width="160"><template #cell="{ record }">{{ record.checkedAt || record.date }}</template></a-table-column>
        <a-table-column title="签到人" data-index="memberName" :width="100" />
        <a-table-column title="课程" data-index="courseName" />
        <a-table-column title="课次" data-index="lesson" />
        <a-table-column title="上课日期" data-index="date" :width="110" />
        <a-table-column title="签到地址" data-index="location" />
        <a-table-column title="方式" :width="100"><template #cell="{ record }">{{ record.checkinType === 'self' ? '本人签到' : record.checkinType === 'makeup' ? '后台补签' : '历史签到' }}</template></a-table-column>
        <a-table-column title="当前余次" data-index="remain" :width="90" />
      </template>
    </a-table>
  </a-card>
</template>
