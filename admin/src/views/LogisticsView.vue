<script setup>
import { computed } from "vue";

const props = defineProps({
  config: { type: Object, required: true },
  exceptions: { type: Array, default: () => [] },
  loading: Boolean,
  queryForm: { type: Object, required: true },
  result: { type: Object, default: null },
});
const emit = defineEmits(["query", "refresh", "update:queryForm"]);
const trackingNo = computed({
  get: () => props.queryForm.trackingNo,
  set: (value) => emit("update:queryForm", { ...props.queryForm, trackingNo: value }),
});
const exceptionColumns = [
  { title: "订单号", dataIndex: "orderId", width: 170 },
  { title: "快递公司", dataIndex: "carrier", width: 120 },
  { title: "快递单号", dataIndex: "trackingNo", width: 180 },
  { title: "物流状态", dataIndex: "status", width: 110 },
  {
    title: "最新轨迹",
    dataIndex: "latestDescription",
    ellipsis: true,
    tooltip: true,
  },
  {
    title: "异常原因",
    slotName: "error",
    width: 220,
    ellipsis: true,
    tooltip: true,
  },
  { title: "最后同步", dataIndex: "lastSyncedAt", width: 170 },
  { title: "操作", slotName: "actions", width: 100, fixed: "right" },
];
const traceColumns = [
  { title: "时间", dataIndex: "time", width: 180 },
  { title: "物流信息", dataIndex: "description" },
  { title: "位置", dataIndex: "location", width: 180 },
];
</script>
<template>
  <section>
    <a-alert :type="config.configured ? 'success' : 'warning'" class="toolbar"
      >快递鸟物流查询{{
        config.configured ? "已配置" : "未配置，请先配置商户 ID 和 API Key"
      }}。查询不会发货、创建订单或修改订单状态。<template
        v-if="config.configured && !config.jdQinglongCodeConfigured"
        > 京东物流需额外配置青龙商家编码。</template
      ></a-alert
    >
    <a-card title="快递单号查询" :bordered="false"
      ><a-input-search
        v-model="trackingNo"
        search-button
        allow-clear
        placeholder="输入快递单号，自动识别快递公司"
        style="max-width: 560px"
        :loading="loading"
        :disabled="!config.configured"
        @search="emit('query')"
        @press-enter="emit('query')"
        ><template #button-default>查询物流</template></a-input-search
      >
      <template v-if="result"
        ><a-descriptions :column="3" bordered style="margin-top: 18px"
          ><a-descriptions-item label="快递公司">{{
            result.carrier || "自动识别"
          }}</a-descriptions-item
          ><a-descriptions-item label="快递单号">{{
            result.trackingNo || queryForm.trackingNo
          }}</a-descriptions-item
          ><a-descriptions-item label="当前状态"
            ><a-tag color="arcoblue">{{
              result.status
            }}</a-tag></a-descriptions-item
          ></a-descriptions
        ><a-alert
          v-if="result.reason"
          type="warning"
          style="margin-top: 16px"
          >{{ result.reason }}</a-alert
        ><a-table
          :columns="traceColumns"
          :data="result.events"
          :pagination="false"
          row-key="id"
          style="margin-top: 16px" /><a-empty
          v-if="!result.events?.length"
          description="暂无物流轨迹"
      /></template>
    </a-card>
    <a-card
      v-if="exceptions.length"
      title="历史异常记录"
      :bordered="false"
      style="margin-top: 16px"
      ><a-table
        :columns="exceptionColumns"
        :data="exceptions"
        :pagination="{ pageSize: 20 }"
        row-key="id"
        :scroll="{ x: 1300 }"
        ><template #error="{ record }"
          ><span class="red">{{
            record.subscriptionError ||
            (record.status === "物流异常" ? record.latestDescription : "—")
          }}</span></template
        ><template #actions="{ record }"
          ><a-button
            type="text"
            size="small"
            :disabled="!config.configured"
            @click="emit('refresh', record)"
            >立即重试</a-button
          ></template
        ></a-table
      ></a-card
    >
  </section>
</template>
<style scoped>
.toolbar {
  margin-bottom: 16px;
}
.red {
  color: rgb(var(--danger-6));
}
</style>
