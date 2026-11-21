<script setup>
import { computed, ref, watch } from "vue";
import { api } from "../api.js";
import VerifyView from "./VerifyView.vue";
import MakeupDialog from "./MakeupDialog.vue";

const code = ref("");
const order = ref(null);
const searching = ref(false);
const verifying = ref(false);
const verifyError = ref("");
const normalizedCode = computed(() =>
  String(code.value || "").replace(/\s+/g, ""),
);
let orderRequest = 0;

function clearResult() {
  orderRequest++;
  order.value = null;
  searching.value = false;
  verifyError.value = "";
}
watch(normalizedCode, clearResult, { flush: "sync" });

async function searchOrder() {
  if (!normalizedCode.value || verifying.value) return;
  const request = ++orderRequest;
  const value = normalizedCode.value;
  searching.value = true;
  order.value = null;
  verifyError.value = "";
  try {
    const result = await api.get("/orders/code/" + encodeURIComponent(value));
    if (request === orderRequest) order.value = result;
  } catch (e) {
    if (request === orderRequest) verifyError.value = e.message;
  } finally {
    if (request === orderRequest) searching.value = false;
  }
}

async function confirmOrder() {
  const current = order.value;
  if (
    !current ||
    searching.value ||
    verifying.value ||
    String(current.code || "").replace(/\s+/g, "") !== normalizedCode.value
  )
    return;
  const request = orderRequest;
  verifying.value = true;
  verifyError.value = "";
  try {
    const result = await api.post(
      "/orders/" + encodeURIComponent(current.id) + "/verify",
    );
    if (request === orderRequest) order.value = result;
  } catch (e) {
    if (request !== orderRequest) return;
    // 请求可能已在服务端完成。重新查询才能再次确认同一订单。
    order.value = null;
    verifyError.value = e.message + "，请重新查询凭证。";
  } finally {
    verifying.value = false;
  }
}

const keyword = ref("");
const customers = ref([]);
const customerSearching = ref(false);
const customerError = ref("");
let customerRequest = 0;

async function searchCustomers(value = "") {
  const request = ++customerRequest;
  keyword.value = String(value || "").trim();
  customerError.value = "";
  customerSearching.value = true;
  try {
    const rows = await api.get(
      "/cards/customers?keyword=" + encodeURIComponent(keyword.value),
    );
    if (request === customerRequest) customers.value = rows;
  } catch (e) {
    if (request === customerRequest) {
      customers.value = [];
      customerError.value = e.message;
    }
  } finally {
    if (request === customerRequest) customerSearching.value = false;
  }
}

const customerId = ref("");
const profile = ref(null);
const cardLoading = ref(false);
const cardError = ref("");
const selectedCardId = ref(null);
const makeupSuccess = ref("");
let cardRequest = 0;

const options = computed(() => {
  const list = [...customers.value];
  const selected = profile.value?.user;
  if (selected && !list.some((item) => String(item.id) === String(selected.id)))
    list.unshift(selected);
  return list.map((item) => ({
    value: String(item.id),
    label: [item.name || "会员", item.phone || item.id].join(" · "),
  }));
});
const cards = computed(() => profile.value?.cards || []);
const selectedCard = computed(() =>
  cards.value.find((card) => card.id === selectedCardId.value),
);

async function loadCards(id) {
  const request = ++cardRequest;
  const value = String(id ?? "");
  customerId.value = value;
  selectedCardId.value = null;
  makeupSuccess.value = "";
  cardError.value = "";
  profile.value = null;
  cardLoading.value = Boolean(value);
  if (!value) return;
  try {
    const result = await api.get(
      "/cards/customers/" + encodeURIComponent(value),
    );
    if (request === cardRequest) profile.value = result;
  } catch (e) {
    if (request === cardRequest) cardError.value = e.message;
  } finally {
    if (request === cardRequest) cardLoading.value = false;
  }
}

function openMakeup(card) {
  if (
    !cardLoading.value &&
    Number(card.remain) > 0 &&
    cards.value.includes(card)
  ) {
    selectedCardId.value = card.id;
    makeupSuccess.value = "";
  }
}

function makeupSaved(card, date) {
  if (!profile.value || selectedCardId.value !== card.id) return;
  profile.value.cards = cards.value.map((item) =>
    item.id === card.id ? card : item,
  );
  makeupSuccess.value = `${profile.value.user.name} · ${card.title} · ${date} 已签到，剩余 ${card.remain} 次。`;
  selectedCardId.value = null;
}
</script>

<template>
  <VerifyView
    v-model:code="code"
    v-model:customer-id="customerId"
    :order="order"
    :searching="searching"
    :verifying="verifying"
    :verify-error="verifyError"
    :customer-options="options"
    :customer-searching="customerSearching"
    :customer-error="customerError"
    :profile="profile"
    :cards="cards"
    :card-loading="cardLoading"
    :card-error="cardError"
    :makeup-success="makeupSuccess"
    @search="searchOrder"
    @confirm="confirmOrder"
    @reset-order="clearResult"
    @search-customer="searchCustomers"
    @retry-customers="searchCustomers(keyword)"
    @load-customer="loadCards"
    @retry-cards="loadCards(customerId)"
    @makeup="openMakeup"
  />
  <MakeupDialog
    v-if="selectedCard"
    :card="selectedCard"
    :member="profile.user"
    @close="selectedCardId = null"
    @saved="makeupSaved"
  />
</template>
