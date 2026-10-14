<script setup>
import { fmtMoney, orderChip } from "../utils/presentation.js";

defineProps({
  order: { type: Object, default: null },
  searching: { type: Boolean, default: false },
  customerOptions: { type: Array, default: () => [] },
  cards: { type: Array, default: () => [] },
  cardLoading: { type: Boolean, default: false },
});

const code = defineModel("code", { type: String, default: "" });
const customerId = defineModel("customerId", { type: String, default: "" });
const emit = defineEmits(["search", "confirm", "load-customer", "makeup"]);

const cardColumns = [
  { title: "课程/计次卡", dataIndex: "title", ellipsis: true, tooltip: true },
  { title: "剩余/总次数", slotName: "remain", width: 140, align: "right" },
  { title: "有效期", dataIndex: "validUntil", width: 130 },
  { title: "操作", slotName: "actions", width: 120 },
];
</script>

<template>
  <section>
    <a-card :bordered="false">
      <div class="toolbar">
        <a-input-search
          v-model="code"
          placeholder="输入或扫描签到/核销码"
          search-button
          allow-clear
          class="code-input"
          :loading="searching"
          @search="emit('search')"
        >
          <template #button-default>查询</template>
        </a-input-search>
      </div>
      <a-empty v-if="!order" description="输入凭证码查询活动报名信息" />
      <template v-else>
        <a-descriptions :column="2" bordered title="订单信息">
          <a-descriptions-item label="订单号">{{
            order.id
          }}</a-descriptions-item>
          <a-descriptions-item label="标题">{{
            order.title
          }}</a-descriptions-item>
          <a-descriptions-item label="客户">{{
            order.participants
          }}</a-descriptions-item>
          <a-descriptions-item label="人数">{{
            order.count
          }}</a-descriptions-item>
          <a-descriptions-item label="实付"
            >¥{{ fmtMoney(order.payAmount) }}</a-descriptions-item
          >
          <a-descriptions-item label="状态"
            ><a-tag :color="orderChip(order.status)">{{
              order.status
            }}</a-tag></a-descriptions-item
          >
          <a-descriptions-item label="签到/核销码">{{
            order.code
          }}</a-descriptions-item>
          <a-descriptions-item label="场次时间">{{
            order.schedule
              ? `${order.schedule.date || ""} ${order.schedule.time || ""}`.trim() ||
                "—"
              : "—"
          }}</a-descriptions-item>
        </a-descriptions>
        <div class="actions-row">
          <a-button
            type="primary"
            :disabled="
              !['待签到', '待核销', '待使用', '待发货', '待收货'].includes(
                order.status,
              ) || order.serviceMode === 'delivery'
            "
            @click="emit('confirm')"
          >
            {{ order.serviceMode === "checkin" ? "确认签到" : "确认核销" }}
          </a-button>
        </div>
      </template>
    </a-card>
    <a-card :bordered="false" title="课程补签与核销" class="cards-card">
      <div class="toolbar">
        <a-select
          v-model="customerId"
          :options="customerOptions"
          placeholder="选择会员"
          allow-search
          allow-clear
          class="customer-select"
          @change="emit('load-customer')"
        />
      </div>
      <a-spin :loading="cardLoading" class="full-width">
        <a-empty v-if="!customerId" description="选择会员后查看其计次卡" />
        <a-empty
          v-else-if="cards.length === 0"
          description="该会员暂无计次卡"
        />
        <a-table
          v-else
          :columns="cardColumns"
          :data="cards"
          :pagination="false"
          row-key="id"
        >
          <template #remain="{ record }"
            >{{ record.remain }} / {{ record.total }}</template
          >
          <template #actions="{ record }"
            ><a-button
              size="small"
              type="primary"
              @click="emit('makeup', record)"
              >补签</a-button
            ></template
          >
        </a-table>
      </a-spin>
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
.code-input {
  width: 320px;
}
.customer-select {
  width: 340px;
}
.actions-row {
  margin-top: 16px;
}
.cards-card {
  margin-top: 16px;
}
.full-width {
  width: 100%;
}
</style>
