<script setup>
import { computed, ref } from "vue";
import { api } from "../api.js";

const props = defineProps({
  member: { type: Object, required: true },
  card: { type: Object, required: true },
});
const emit = defineEmits(["saved", "close"]);

function dateKey(date) {
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
const now = new Date();
const today = dateKey(now);
const until = props.card.validUntil;
const lastDate =
  /^\d{4}-\d{2}-\d{2}$/.test(until) && until < today ? until : today;
const date = ref(lastDate);
const time = ref(
  `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
);
const sessionId = ref("");
const reason = ref("");
const error = ref("");
const saving = ref(false);

const records = computed(() => props.card.attendanceRecords || []);
const pendingSessions = computed(() =>
  records.value
    .filter(
      (row) =>
        row.id && row.date && row.date <= lastDate && row.status !== "checked",
    )
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date)),
);
const sessionOptions = computed(() =>
  pendingSessions.value.map((row) => ({
    value: String(row.id),
    label: [row.date, row.time, row.lesson].filter(Boolean).join(" · "),
  })),
);
const selected = computed(() =>
  pendingSessions.value.find((row) => String(row.id) === sessionId.value),
);
const sameDay = computed(() =>
  records.value.filter((row) => row.date === date.value),
);
const dateProblem = computed(() => {
  if (!date.value) return "请选择实际到课日期。";
  if (date.value > lastDate) return "补签日期不能晚于今天或计次卡有效期。";
  if (selected.value || !sameDay.value.length) return "";
  if (sameDay.value.every((row) => row.status === "checked"))
    return "当天已签到，无需再次扣次。";
  if (sameDay.value.length > 1) return "当天有多个课次，请选择实际参加的课次。";
  return "";
});

function selectSession(value) {
  error.value = "";
  sessionId.value = String(value ?? "");
  if (selected.value) {
    date.value = selected.value.date;
    if (selected.value.time) time.value = selected.value.time;
  }
}

function selectDate(value) {
  date.value = value || "";
  const pending = sameDay.value.filter(
    (row) => row.status !== "checked" && row.id,
  );
  selectSession(pending.length === 1 ? pending[0].id : "");
}
selectDate(lastDate);

async function submit() {
  if (saving.value || dateProblem.value) return;
  const note = reason.value.trim();
  if (!note) {
    error.value = "请填写补签原因。";
    return;
  }
  const clock = time.value.trim().replace(/\s+/g, "");
  if (
    clock &&
    !/^(?:[01]\d|2[0-3]):[0-5]\d(?:-(?:[01]\d|2[0-3]):[0-5]\d)?$/.test(clock)
  ) {
    error.value = "课程时间请填写 14:00 或 14:00-15:30。";
    return;
  }
  saving.value = true;
  error.value = "";
  try {
    const updated = await api.post(
      `/cards/${encodeURIComponent(props.card.id)}/makeup-checkin`,
      {
        sessionId: sessionId.value || undefined,
        date: date.value,
        time: clock,
        reason: note,
      },
    );
    emit("saved", updated, date.value);
  } catch (e) {
    error.value = e.message;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <a-modal
    visible
    title="课程补签"
    width="min(520px, calc(100vw - 24px))"
    class="admin-editor-modal makeup-modal"
    :closable="!saving"
    :esc-to-close="!saving"
    :mask-closable="false"
    @cancel="!saving && emit('close')"
  >
    <div class="card-summary">
      <strong>{{ member.name || member.id }} · {{ card.title }}</strong>
      <span
        >剩余 {{ card.remain }} 次，本次补签后剩
        <b>{{ Number(card.remain) - 1 }}</b> 次</span
      >
    </div>
    <a-form layout="vertical">
      <a-form-item v-if="sessionOptions.length" label="已排课次">
        <a-select
          :model-value="sessionId"
          :options="sessionOptions"
          allow-clear
          placeholder="选择已排课次，或直接填写下方日期"
          popup-container=".makeup-modal .arco-modal-body"
          @change="selectSession"
        />
      </a-form-item>
      <div class="date-time">
        <a-form-item label="到课日期" required>
          <a-date-picker
            :model-value="date"
            value-format="YYYY-MM-DD"
            :disabled-date="(d) => dateKey(d) > lastDate"
            popup-container=".makeup-modal .arco-modal-body"
            style="width: 100%"
            @change="selectDate"
          />
        </a-form-item>
        <a-form-item label="课程时间">
          <a-input
            v-model="time"
            :readonly="Boolean(selected?.time)"
            placeholder="如 14:00-15:30"
          />
        </a-form-item>
      </div>
      <a-form-item label="补签原因" required>
        <a-textarea
          v-model="reason"
          :max-length="100"
          show-word-limit
          placeholder="请说明会员已到场但未签到的原因"
          :auto-size="{ minRows: 2, maxRows: 4 }"
        />
        <template #extra>
          <a-space size="mini" wrap>
            <span>常用原因</span>
            <a-button
              v-for="note in ['现场漏签', '签到设备故障']"
              :key="note"
              size="mini"
              @click="
                reason = note;
                error = '';
              "
              >{{ note }}</a-button
            >
          </a-space>
        </template>
      </a-form-item>
      <a-alert v-if="dateProblem || error" type="warning">{{
        dateProblem || error
      }}</a-alert>
    </a-form>
    <template #footer>
      <a-button :disabled="saving" @click="emit('close')">取消</a-button>
      <a-button
        type="primary"
        :loading="saving"
        :disabled="!!dateProblem"
        @click="submit"
        >确认补签并扣 1 次</a-button
      >
    </template>
  </a-modal>
</template>

<style scoped>
.card-summary {
  display: grid;
  gap: 6px;
  margin-bottom: 16px;
  padding: 12px 14px;
  background: var(--color-fill-1);
  border-radius: 8px;
}
.card-summary span {
  color: var(--color-text-2);
}
.date-time {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
@media (max-width: 520px) {
  .date-time {
    grid-template-columns: 1fr;
    gap: 0;
  }
}
</style>
