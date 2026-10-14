<script setup>
import { IconPlus } from "@arco-design/web-vue/es/icon";

defineProps({
  adminAccounts: { type: Array, default: () => [] },
  merchantAccounts: { type: Array, default: () => [] },
  permissionName: { type: Function, required: true },
});

const emit = defineEmits([
  "create-admin",
  "edit-admin",
  "reset-admin",
  "edit-merchant",
  "reset-merchant",
]);

const adminColumns = [
  { title: "登录账号", dataIndex: "username", width: 150 },
  { title: "员工姓名", dataIndex: "name", width: 130 },
  { title: "角色", slotName: "role", width: 120 },
  { title: "权限", slotName: "permissions", ellipsis: true, tooltip: true },
  { title: "最近登录", dataIndex: "lastLoginAt", width: 170 },
  { title: "状态", slotName: "status", width: 90 },
  { title: "操作", slotName: "actions", width: 180, fixed: "right" },
];

const merchantColumns = [
  { title: "商户账号", dataIndex: "username", width: 150 },
  { title: "商家", dataIndex: "shopName", width: 180 },
  { title: "联系人", dataIndex: "contactName", width: 120 },
  { title: "手机号", dataIndex: "phone", width: 130 },
  { title: "发布权限", slotName: "permissions", ellipsis: true, tooltip: true },
  { title: "开通时间", dataIndex: "createdAt", width: 170 },
  { title: "状态", slotName: "status", width: 90 },
  { title: "操作", slotName: "actions", width: 180, fixed: "right" },
];
</script>

<template>
  <section>
    <a-alert type="info" class="permission-alert">
      超级管理员拥有全部权限；员工账号按分配的权限显示菜单，后端接口也会进行同样的权限校验。
    </a-alert>
    <a-tabs default-active-key="admin">
      <a-tab-pane key="admin" title="后台员工账号">
        <div class="toolbar">
          <a-button type="primary" @click="emit('create-admin')">
            <template #icon><IconPlus /></template>
            新增员工账号
          </a-button>
        </div>
        <a-card :bordered="false">
          <a-table
            :columns="adminColumns"
            :data="adminAccounts"
            :pagination="false"
            row-key="id"
            :scroll="{ x: 1050 }"
          >
            <template #role="{ record }">
              <a-tag
                :color="record.role === 'super_admin' ? 'red' : 'arcoblue'"
              >
                {{ record.role === "super_admin" ? "超级管理员" : "员工账号" }}
              </a-tag>
            </template>
            <template #permissions="{ record }">{{
              permissionName(record.permissions)
            }}</template>
            <template #status="{ record }">
              <a-tag :color="record.status === 1 ? 'green' : 'gray'">
                {{ record.status === 1 ? "启用" : "停用" }}
              </a-tag>
            </template>
            <template #actions="{ record }">
              <a-space :size="0">
                <a-button
                  type="text"
                  size="small"
                  @click="emit('edit-admin', record)"
                  >编辑权限</a-button
                >
                <a-button
                  type="text"
                  size="small"
                  @click="emit('reset-admin', record)"
                  >重置密码</a-button
                >
              </a-space>
            </template>
          </a-table>
        </a-card>
      </a-tab-pane>
      <a-tab-pane key="merchant" title="商户发布权限">
        <a-card :bordered="false">
          <a-table
            :columns="merchantColumns"
            :data="merchantAccounts"
            :pagination="false"
            row-key="id"
            :scroll="{ x: 1050 }"
          >
            <template #permissions="{ record }">
              {{ permissionName(record.permissions, "merchant") }}
            </template>
            <template #status="{ record }">
              <a-tag :color="record.status === 1 ? 'green' : 'gray'">
                {{ record.status === 1 ? "启用" : "停用" }}
              </a-tag>
            </template>
            <template #actions="{ record }">
              <a-space :size="0">
                <a-button
                  type="text"
                  size="small"
                  @click="emit('edit-merchant', record)"
                >
                  发布权限
                </a-button>
                <a-button
                  type="text"
                  size="small"
                  @click="emit('reset-merchant', record)"
                >
                  重置密码
                </a-button>
              </a-space>
            </template>
          </a-table>
        </a-card>
      </a-tab-pane>
    </a-tabs>
  </section>
</template>

<style scoped>
.permission-alert {
  margin-bottom: 16px;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 16px;
}
</style>
