<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { fmtMoney, orderChip } from "../utils/presentation.js";

const props = defineProps({
  order: { type: Object, default: null },
  searching: { type: Boolean, default: false },
  verifying: { type: Boolean, default: false },
  verifyError: { type: String, default: "" },
  customerOptions: { type: Array, default: () => [] },
  customerSearching: { type: Boolean, default: false },
  customerError: { type: String, default: "" },
  profile: { type: Object, default: null },
  cards: { type: Array, default: () => [] },
  cardLoading: { type: Boolean, default: false },
  cardError: { type: String, default: "" },
  makeupSuccess: { type: String, default: "" },
});

const code = defineModel("code", { type: String, default: "" });
const customerId = defineModel("customerId", { type: String, default: "" });
const emit = defineEmits([
  "search",
  "confirm",
  "load-customer",
  "makeup",
  "reset-order",
  "search-customer",
  "retry-cards",
  "retry-customers",
]);

const mode = ref("verify");
const codeInput = ref(null);
let customerModeLoaded = false;
let customerSearchTimer = null;
const acceptedStatuses = ["待签到", "待核销", "待使用", "待发货", "待收货"];
const completedFulfillmentStatuses = ["已签到", "已核销", "已使用"];

const normalizedCode = computed(() =>
  String(code.value || "").replace(/\s+/g, ""),
);
const orderCode = computed(() =>
  String(props.order?.code || "").replace(/\s+/g, ""),
);
const orderMatchesInput = computed(
  () => Boolean(orderCode.value) && orderCode.value === normalizedCode.value,
);
const isCheckin = computed(
  () =>
    props.order?.serviceMode === "checkin" ||
    ["待签到", "已签到"].includes(props.order?.fulfillmentStatus) ||
    ["待签到", "已签到"].includes(props.order?.status),
);
const actionLabel = computed(() =>
  isCheckin.value
    ? "签到"
    : props.order?.serviceMode === "online"
      ? "使用"
      : "核销",
);
const completed = computed(
  () =>
    Boolean(props.order) &&
    orderMatchesInput.value &&
    props.order.serviceMode !== "delivery" &&
    (Boolean(props.order.verifiedAt) ||
      completedFulfillmentStatuses.includes(props.order.fulfillmentStatus)),
);
const canVerify = computed(
  () =>
    Boolean(props.order) &&
    orderMatchesInput.value &&
    !completed.value &&
    acceptedStatuses.includes(props.order.status) &&
    props.order.serviceMode !== "delivery" &&
    !props.searching &&
    !props.verifying,
);
const member = computed(() => props.profile?.user || null);
const selectedCustomerLabel = computed(
  () =>
    props.customerOptions.find(
      (option) => String(option.value) === String(customerId.value),
    )?.label || "",
);

function changeMode(value) {
  mode.value = value;
  if (value === "verify") nextTick(focusCode);
  else if (!customerModeLoaded) {
    customerModeLoaded = true;
    emit("search-customer", "");
  }
}
function focusCode() {
  const target = codeInput.value;
  if (typeof target?.focus === "function") target.focus();
  else if (typeof target?.inputRef?.focus === "function")
    target.inputRef.focus();
  else target?.$el?.querySelector("input")?.focus();
}
function submitSearch() {
  if (!props.searching && normalizedCode.value) emit("search");
}
function continueNext() {
  code.value = "";
  emit("reset-order");
  nextTick(focusCode);
}
function searchCustomer(value) {
  window.clearTimeout(customerSearchTimer);
  customerSearchTimer = window.setTimeout(
    () => emit("search-customer", String(value || "").trim()),
    250,
  );
}
function loadCustomer(value) {
  emit("load-customer", value == null ? "" : String(value));
}
function cardRemaining(card) {
  return Math.max(0, Number(card.remain || 0));
}
function cardTotal(card) {
  return Math.max(cardRemaining(card), Number(card.total || 0));
}
function cardPercent(card) {
  const total = cardTotal(card);
  return total
    ? Math.min(100, Math.round((cardRemaining(card) / total) * 100))
    : 0;
}
function cardExpired(card) {
  const raw = String(card.validUntil || "").trim();
  if (!raw) return false;
  const end = new Date(`${raw.slice(0, 10)}T23:59:59`);
  return !Number.isNaN(end.getTime()) && end.getTime() < Date.now();
}
onBeforeUnmount(() => window.clearTimeout(customerSearchTimer));
onMounted(() => nextTick(focusCode));
</script>

<template>
  <section class="verify-workbench">
    <header class="workbench-head">
      <div>
        <h2>{{ mode === "verify" ? "现场签到与核销" : "课程补签" }}</h2>
      </div>
      <a-radio-group
        :model-value="mode"
        type="button"
        class="mode-switch"
        @change="changeMode"
      >
        <a-radio value="verify">签到 / 核销</a-radio
        ><a-radio value="makeup">课程补签</a-radio>
      </a-radio-group>
    </header>

    <div v-if="mode === 'verify'" class="workflow-panel">
      <section class="step-card">
        <div class="step-heading">
          <strong>扫描或输入凭证码</strong
          ><small>扫描后按回车，或点击「查询凭证」</small>
        </div>
        <a-input-search
          ref="codeInput"
          v-model="code"
          size="large"
          placeholder="请扫描或输入签到 / 核销码"
          search-button
          allow-clear
          class="full-width"
          :loading="searching"
          @search="submitSearch"
          @press-enter="submitSearch"
        >
          <template #button-default>{{
            searching ? "查询中" : "查询凭证"
          }}</template>
        </a-input-search>
        <a-alert v-if="verifyError" type="error" show-icon class="inline-alert"
          ><span>{{ verifyError }}</span
          ><a-button type="text" size="mini" @click="continueNext"
            >清空重试</a-button
          ></a-alert
        >
      </section>

      <section class="step-card">
        <div class="step-heading">
          <strong>核对信息并确认</strong><small>请核对参与人、项目与场次</small>
        </div>
        <a-empty
          v-if="!order || !orderMatchesInput"
          :description="
            order && !orderMatchesInput
              ? '凭证码已修改，请重新查询'
              : '查询后将在这里显示订单信息'
          "
        />
        <template v-else>
          <a-alert
            v-if="completed"
            type="success"
            show-icon
            class="inline-alert"
            >{{ actionLabel }}已完成，可继续处理下一单。</a-alert
          >
          <a-alert
            v-else-if="order.serviceMode === 'delivery'"
            type="warning"
            show-icon
            class="inline-alert"
            >配送订单不能在现场签到或核销。</a-alert
          >
          <a-alert
            v-else-if="!acceptedStatuses.includes(order.status)"
            type="warning"
            class="inline-alert"
          >
            订单当前为「{{ order.status }}」，不能办理{{ actionLabel }}。
          </a-alert>
          <div class="order-summary">
            <div class="title-row">
              <div>
                <span class="label">项目</span>
                <h3>{{ order.title || "未命名项目" }}</h3>
              </div>
              <a-tag
                :color="completed ? 'green' : orderChip(order.status)"
                size="large"
                >{{
                  completed
                    ? order.fulfillmentStatus || order.status
                    : order.status
                }}</a-tag
              >
            </div>
            <div class="summary-grid">
              <div>
                <span>会员 / 参与人</span
                ><strong>{{ order.participants || "—" }}</strong>
              </div>
              <div>
                <span>人数</span><strong>{{ order.count || 1 }}</strong>
              </div>
              <div>
                <span>场次</span
                ><strong>{{
                  order.schedule
                    ? `${order.schedule.date || ""} ${order.schedule.time || ""}`.trim() ||
                      "—"
                    : "—"
                }}</strong>
              </div>
              <div>
                <span>订单金额</span
                ><strong>¥{{ fmtMoney(order.payAmount) }}</strong>
              </div>
              <div>
                <span>订单号</span><strong class="mono">{{ order.id }}</strong>
              </div>
              <div>
                <span>凭证码</span
                ><strong class="mono code-value">{{ order.code }}</strong>
              </div>
            </div>
          </div>
          <div class="actions">
            <a-button
              v-if="completed"
              type="primary"
              size="large"
              @click="continueNext"
              >继续下一单</a-button
            >
            <template v-else
              ><a-button size="large" @click="continueNext">清空并重查</a-button
              ><a-button
                type="primary"
                size="large"
                :loading="verifying"
                :disabled="!canVerify"
                @click="emit('confirm')"
                >确认{{ actionLabel }}</a-button
              ></template
            >
          </div>
        </template>
      </section>
    </div>

    <div v-else class="workflow-panel">
      <section class="step-card">
        <div class="step-heading">
          <strong>查找会员</strong><small>按姓名、手机号或会员 ID 搜索</small>
        </div>
        <a-select
          v-model="customerId"
          :options="customerOptions"
          :loading="customerSearching"
          :filter-option="false"
          placeholder="输入姓名或手机号"
          allow-search
          allow-clear
          size="large"
          class="full-width"
          @search="searchCustomer"
          @change="loadCustomer"
        />
        <a-alert
          v-if="customerError"
          type="error"
          show-icon
          class="inline-alert"
          ><span>{{ customerError }}</span
          ><a-button type="text" size="mini" @click="emit('retry-customers')"
            >重试</a-button
          ></a-alert
        >
        <div v-if="customerId" class="member-summary">
          <div class="avatar">
            {{ (member?.name || selectedCustomerLabel || "会").slice(0, 1) }}
          </div>
          <div>
            <strong>{{
              member?.name || selectedCustomerLabel || "已选择会员"
            }}</strong
            ><span v-if="member?.phone">{{ member.phone }}</span
            ><span v-else-if="cardLoading">正在读取会员卡…</span>
          </div>
          <a-tag color="orange">{{ cards.length }} 张计次卡</a-tag>
        </div>
      </section>

      <section class="step-card">
        <div class="step-heading">
          <strong>选择课程卡并补签</strong
          ><small>提交后扣减 1 次；过期卡可补签有效期内的历史日期</small>
        </div>
        <a-alert
          v-if="makeupSuccess"
          type="success"
          show-icon
          class="inline-alert"
          >{{ makeupSuccess }}</a-alert
        >
        <a-alert v-if="cardError" type="error" show-icon class="inline-alert"
          ><span>{{ cardError }}</span
          ><a-button type="text" size="mini" @click="emit('retry-cards')"
            >重试</a-button
          ></a-alert
        >
        <a-spin :loading="cardLoading" class="full-width">
          <a-empty v-if="!customerId" description="请先选择会员" /><a-empty
            v-else-if="!cardLoading && !cardError && cards.length === 0"
            description="该会员暂无计次卡"
          />
          <div v-else class="card-grid">
            <article
              v-for="card in cards"
              :key="card.id"
              class="usage-card"
              :class="{ unavailable: cardRemaining(card) <= 0 }"
            >
              <div class="title-row">
                <div>
                  <span class="label">课程 / 计次卡</span>
                  <h3>{{ card.title || "未命名课程卡" }}</h3>
                </div>
                <a-tag
                  :color="
                    cardRemaining(card) <= 0
                      ? 'gray'
                      : cardExpired(card)
                        ? 'orange'
                        : 'green'
                  "
                  >{{
                    cardRemaining(card) <= 0
                      ? "次数已用完"
                      : cardExpired(card)
                        ? "已过期·可历史补签"
                        : "可用"
                  }}</a-tag
                >
              </div>
              <div class="remaining">
                <strong>{{ cardRemaining(card) }}</strong
                ><span>/ {{ cardTotal(card) }} 次</span>
              </div>
              <a-progress
                :percent="cardPercent(card) / 100"
                :show-text="false"
                size="small"
              />
              <div class="card-meta">
                <span>有效期</span
                ><strong>{{ card.validUntil || "长期有效" }}</strong>
              </div>
              <a-button
                type="primary"
                long
                :disabled="cardRemaining(card) <= 0"
                @click="emit('makeup', card)"
                >{{ cardExpired(card) ? "办理历史补签" : "办理补签" }}</a-button
              >
            </article>
          </div>
        </a-spin>
      </section>
    </div>
  </section>
</template>

<style scoped>
.verify-workbench {
  display: grid;
  gap: 16px;
  max-width: 1240px;
}
.workbench-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px;
  background: var(--color-bg-2);
  border: 1px solid var(--color-border-2);
  border-radius: 10px;
}
.workbench-head h2 {
  margin: 0 0 3px;
  color: var(--color-text-1);
  font-size: 20px;
}
.mode-switch {
  flex: 0 0 auto;
  padding: 3px;
  background: var(--color-fill-2);
  border-radius: 8px;
}
.mode-switch :deep(.arco-radio-button-content) {
  color: var(--color-text-2);
  border-color: transparent;
}
.mode-switch :deep(.arco-radio-checked .arco-radio-button-content) {
  color: #a45f2a;
  background: #fff;
  box-shadow: 0 2px 8px rgba(132, 79, 37, 0.12);
}
.workflow-panel {
  display: grid;
  grid-template-columns: minmax(0, 0.82fr) minmax(0, 1.38fr);
  gap: 16px;
  align-items: start;
}
.step-card {
  min-width: 0;
  padding: 18px;
  background: var(--color-bg-2);
  border: 1px solid var(--color-border-2);
  border-radius: 10px;
}
.step-heading {
  display: grid;
  gap: 3px;
  margin-bottom: 14px;
}
.step-heading strong {
  font-size: 16px;
}
.step-heading small,
.label,
.summary-grid span,
.card-meta span {
  color: var(--color-text-3);
  font-size: 12px;
}
.full-width {
  width: 100%;
}
.inline-alert {
  margin-top: 12px;
}
.order-summary {
  padding: 18px;
  background: var(--color-fill-1);
  border-radius: 12px;
}
.title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.title-row h3 {
  margin: 4px 0 0;
  font-size: 17px;
}
.summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--color-border-2);
}
.summary-grid > div {
  min-width: 0;
}
.summary-grid strong {
  display: block;
  margin-top: 3px;
  overflow-wrap: anywhere;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.code-value {
  color: #b56f35;
  font-size: 17px;
  letter-spacing: 0.08em;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
}
.member-summary {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
  padding: 14px;
  background: var(--color-fill-1);
  border-radius: 12px;
}
.avatar {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  color: #fff;
  font-weight: 700;
  background: #c58a52;
  border-radius: 50%;
}
.member-summary > div:nth-child(2) {
  display: grid;
  gap: 3px;
  min-width: 0;
}
.member-summary span {
  color: var(--color-text-3);
  font-size: 13px;
}
.card-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.usage-card {
  display: grid;
  gap: 14px;
  padding: 16px;
  border: 1px solid var(--color-border-2);
  border-radius: 12px;
}
.usage-card.unavailable {
  opacity: 0.7;
  background: var(--color-fill-1);
}
.remaining {
  display: flex;
  align-items: baseline;
  gap: 5px;
  color: var(--color-text-2);
}
.remaining strong {
  color: #b56f35;
  font-size: 30px;
  line-height: 1;
}
.card-meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.verify-workbench :deep(.arco-btn-primary) {
  border-color: #bf7b42;
  background: #bf7b42;
}
.verify-workbench :deep(.arco-btn-primary:hover) {
  border-color: #aa6833;
  background: #aa6833;
}
.verify-workbench :deep(.arco-progress-line-bar) {
  background: #c58a52;
}
@media (max-width: 1180px) {
  .workbench-head {
    align-items: stretch;
    flex-direction: column;
  }
  .mode-switch {
    align-self: stretch;
  }
  .mode-switch :deep(.arco-radio-button) {
    flex: 1;
    text-align: center;
  }
  .workflow-panel {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 560px) {
  .workbench-head,
  .step-card {
    padding: 16px;
    border-radius: 12px;
  }
  .summary-grid,
  .card-grid {
    grid-template-columns: 1fr;
  }
  .actions {
    flex-direction: column-reverse;
  }
  .actions :deep(button) {
    width: 100%;
  }
  .member-summary {
    grid-template-columns: auto 1fr;
  }
  .member-summary > :last-child {
    grid-column: 1/-1;
    justify-self: start;
  }
}
</style>
