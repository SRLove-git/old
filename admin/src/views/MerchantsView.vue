<script setup>
import { computed } from "vue";
import { fuzzyMatch } from "../utils/presentation.js";

const props = defineProps({
  accounts: { type: Array, default: () => [] },
  permissionName: { type: Function, required: true },
});

const keyword = defineModel("keyword", { type: String, default: "" });
const status = defineModel("status", { type: String, default: "all" });
const emit = defineEmits(["edit", "reset-password"]);

const columns = [
  { title: "商户账号", dataIndex: "username", width: 150 },
  { title: "商家", dataIndex: "shopName", width: 180 },
  { title: "联系人", dataIndex: "contactName", width: 120 },
  { title: "手机号", dataIndex: "phone", width: 130 },
  { title: "发布权限", slotName: "permissions", ellipsis: true, tooltip: true },
  { title: "开通时间", dataIndex: "createdAt", width: 170 },
  { title: "状态", slotName: "status", width: 90 },
  { title: "操作", slotName: "actions", width: 180, fixed: "right" },
];

const enabledCount = computed(
  () => props.accounts.filter((account) => Number(account.status) === 1).length,
);
const disabledCount = computed(
  () => props.accounts.length - enabledCount.value,
);
const filteredAccounts = computed(() => {
  const search = keyword.value.trim();
  return props.accounts.filter((account) => {
    const matchesStatus =
      status.value === "all" || String(account.status) === status.value;
    const text = [
      account.username,
      account.shopName,
      account.contactName,
      account.phone,
      account.merchantId,
    ]
      .filter(Boolean)
      .join(" ");
    return matchesStatus && fuzzyMatch(text, search);
  });
});
</script>

<template>
  <section>
    <a-row :gutter="[16, 16]">
      <a-col :xs="24" :sm="8">
        <a-card :bordered="false"
          ><a-statistic title="商户账号总数" :value="accounts.length"
        /></a-card>
      </a-col>
      <a-col :xs="24" :sm="8">
        <a-card :bordered="false"
          ><a-statistic title="正常启用" :value="enabledCount"
        /></a-card>
      </a-col>
      <a-col :xs="24" :sm="8">
        <a-card :bordered="false"
          ><a-statistic title="已停用" :value="disabledCount"
        /></a-card>
      </a-col>
    </a-row>
    <div class="toolbar spaced-toolbar">
      <a-space wrap>
        <a-input-search
          v-model="keyword"
          placeholder="搜索商户账号、商家、联系人或手机号"
          allow-clear
          class="search-input"
        />
        <a-select
          v-model="status"
          :options="[
            { label: '全部状态', value: 'all' },
            { label: '启用', value: '1' },
            { label: '停用', value: '0' },
          ]"
          class="status-select"
        />
      </a-space>
    </div>
    <a-card :bordered="false">
      <a-table
        :columns="columns"
        :data="filteredAccounts"
        :pagination="{ pageSize: 20, showTotal: true }"
        row-key="id"
        :scroll="{ x: 1200 }"
        size="middle"
      >
        <template #permissions="{ record }">{{
          permissionName(record.permissions, "merchant")
        }}</template>
        <template #status="{ record }">
          <a-tag :color="record.status === 1 ? 'green' : 'gray'">
            {{ record.status === 1 ? "启用" : "停用" }}
          </a-tag>
        </template>
        <template #actions="{ record }">
          <a-space :size="0">
            <a-button type="text" size="small" @click="emit('edit', record)"
              >账号/权限</a-button
            >
            <a-button
              type="text"
              size="small"
              @click="emit('reset-password', record)"
              >重置密码</a-button
            >
          </a-space>
        </template>
      </a-table>
    </a-card>
  </section>
</template>

<style scoped>
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 16px;
}

.spaced-toolbar {
  margin-top: 16px;
}

.search-input {
  width: 320px;
}

.status-select {
  width: 140px;
}
</style>
