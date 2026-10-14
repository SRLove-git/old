<script setup>
import { fmtMoney } from "../utils/presentation.js";

const props = defineProps({
  categories: { type: Object, default: () => ({}) },
  statItems: { type: Array, default: () => [] },
  stats: { type: Object, required: true },
});
const emit = defineEmits(["open-stat"]);

const rankingColumns = [
  { title: "排名", slotName: "rank", width: 60 },
  { title: "主理人", dataIndex: "name", ellipsis: true, tooltip: true },
  { title: "累计佣金", slotName: "commission", align: "right", width: 130 },
];

function categoryName(id) {
  return (
    props.categories[String(id)]?.name || props.categories[id]?.name || "未知"
  );
}
</script>

<template>
  <section>
    <a-row :gutter="[16, 16]">
      <a-col
        v-for="item in statItems"
        :key="item.label"
        :xs="12"
        :sm="8"
        :md="6"
        :xl="3"
      >
        <button
          type="button"
          class="stat-card-link"
          :aria-label="`查看${item.label}详情`"
          @click="emit('open-stat', item)"
        >
          <a-card :bordered="false" class="stat-card">
            <a-statistic
              :title="item.label"
              :value="Number(item.value ?? 0)"
              :precision="item.precision"
              :value-style="{ color: 'var(--color-text-1)', fontSize: '24px' }"
            >
              <template v-if="item.prefix" #prefix
                ><span class="stat-prefix">{{ item.prefix }}</span></template
              >
            </a-statistic>
            <span class="stat-detail">查看详情</span>
          </a-card>
        </button>
      </a-col>
    </a-row>

    <a-row :gutter="[16, 16]" class="mt">
      <a-col :xs="24" :lg="8">
        <a-card title="订单状态分布" :bordered="false">
          <a-space wrap
            ><a-tag
              v-for="(value, key) in stats.orderStatus"
              :key="key"
              color="gray"
              >{{ key }}：{{ value }}</a-tag
            ></a-space
          >
        </a-card>
      </a-col>
      <a-col :xs="24" :lg="8">
        <a-card title="商品分类分布" :bordered="false">
          <a-space wrap
            ><a-tag
              v-for="(value, key) in stats.byCategory"
              :key="key"
              color="arcoblue"
              >{{ categoryName(key) }}：{{ value }}</a-tag
            ></a-space
          >
        </a-card>
      </a-col>
      <a-col :xs="24" :lg="8">
        <a-card title="主理人排行榜（按累计佣金）" :bordered="false">
          <a-table
            :columns="rankingColumns"
            :data="stats.managerRanking"
            :pagination="false"
            row-key="id"
            size="small"
          >
            <template #rank="{ rowIndex }">{{ rowIndex + 1 }}</template>
            <template #commission="{ record }"
              ><span class="num"
                >¥{{ fmtMoney(record.totalCommission) }}</span
              ></template
            >
          </a-table>
        </a-card>
      </a-col>
    </a-row>
  </section>
</template>

<style scoped>
.stat-card {
  height: 100%;
}
.stat-card-link {
  width: 100%;
  height: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
}
.stat-card-link .stat-card {
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
}
.stat-card-link:hover .stat-card,
.stat-card-link:focus-visible .stat-card {
  transform: translateY(-2px);
  box-shadow: 0 6px 18px rgba(96, 54, 35, 0.12);
}
.stat-card-link:focus-visible {
  outline: 2px solid rgb(var(--primary-6));
  outline-offset: 3px;
  border-radius: var(--border-radius-medium);
}
.stat-detail {
  display: inline-block;
  margin-top: 8px;
  color: rgb(var(--primary-6));
  font-size: 12px;
}
.stat-prefix {
  font-size: 14px;
  color: var(--color-text-2);
}
.mt {
  margin-top: 16px;
}
.num {
  font-variant-numeric: tabular-nums;
}
</style>
