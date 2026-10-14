<script setup>
import { IconPlus } from "@arco-design/web-vue/es/icon";

defineProps({
  products: { type: Array, default: () => [] },
  orders: { type: Array, default: () => [] },
  previewUrl: { type: Function, required: true },
});

const emit = defineEmits(["edit", "remove", "ship", "complete"]);

const productColumns = [
  { title: "商品", slotName: "product" },
  { title: "兑换积分", dataIndex: "pointsCost", align: "right", width: 110 },
  { title: "库存", dataIndex: "stock", align: "right", width: 90 },
  { title: "已兑换", dataIndex: "soldCount", align: "right", width: 90 },
  { title: "每人限兑", dataIndex: "limitPerUser", align: "right", width: 100 },
  { title: "状态", slotName: "status", width: 90 },
  { title: "操作", slotName: "actions", width: 140 },
];

const orderColumns = [
  { title: "兑换单号", dataIndex: "id", width: 170 },
  { title: "会员", dataIndex: "customerName", width: 110 },
  { title: "商品", dataIndex: "productTitle" },
  { title: "数量", dataIndex: "count", align: "right", width: 70 },
  { title: "使用积分", dataIndex: "pointsUsed", align: "right", width: 100 },
  { title: "收货信息", slotName: "address", width: 260 },
  { title: "物流信息", slotName: "logistics", width: 170 },
  { title: "状态", dataIndex: "status", width: 90 },
  { title: "兑换时间", dataIndex: "createdAt", width: 160 },
  { title: "操作", slotName: "actions", width: 220, fixed: "right" },
];
</script>

<template>
  <section>
    <a-alert type="info" class="toolbar">
      积分商品与普通现金商品相互独立。会员兑换时系统会实时校验并扣减积分和库存。
    </a-alert>
    <a-card title="积分商品" :bordered="false">
      <a-table
        :columns="productColumns"
        :data="products"
        :pagination="false"
        row-key="id"
        size="middle"
      >
        <template #product="{ record }">
          <a-space>
            <a-avatar shape="square" :size="48">
              <img
                v-if="record.coverImage"
                :src="previewUrl(record.coverImage)"
              />
            </a-avatar>
            <div>
              <div>{{ record.title }}</div>
              <div class="muted">{{ record.description }}</div>
            </div>
          </a-space>
        </template>
        <template #status="{ record }">
          <a-tag :color="record.status === 1 ? 'green' : 'gray'">
            {{ record.status === 1 ? "上架" : "下架" }}
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
    <a-card title="兑换记录" :bordered="false" class="orders-card">
      <a-table
        :columns="orderColumns"
        :data="orders"
        :pagination="{ pageSize: 10 }"
        row-key="id"
        :scroll="{ x: 1300 }"
        size="middle"
      >
        <template #address="{ record }">
          <span v-if="record.address">
            {{ record.address.name }} {{ record.address.phone }}<br />
            {{ record.address.province }}{{ record.address.city
            }}{{ record.address.district }}
            {{ record.address.detail }}
          </span>
        </template>
        <template #logistics="{ record }">
          <div v-if="record.carrier || record.trackingNo">
            <div>{{ record.carrier }}</div>
            <div class="muted">{{ record.trackingNo || "—" }}</div>
          </div>
          <span v-else class="muted">未发货</span>
        </template>
        <template #actions="{ record }">
          <a-space :size="0">
            <a-button
              v-if="record.status === '待发货'"
              type="primary"
              size="small"
              @click="emit('ship', record, false)"
              >发货</a-button
            >
            <a-button
              v-if="record.status === '已发货'"
              type="text"
              size="small"
              @click="emit('ship', record, true)"
              >改物流</a-button
            >
            <a-button
              v-if="record.status === '已发货'"
              type="text"
              size="small"
              @click="emit('complete', record)"
              >确认完成</a-button
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
      新建积分商品
    </a-button>
  </section>
</template>

<style scoped>
.toolbar {
  margin-bottom: 16px;
}

.orders-card {
  margin-top: 18px;
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
