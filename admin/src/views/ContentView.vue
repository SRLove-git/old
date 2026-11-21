<script setup>
import { IconPlus } from "@arco-design/web-vue/es/icon";
import { computed, ref } from "vue";
import { Message } from "@arco-design/web-vue";
import { api } from "../api.js";

defineProps({
  posts: { type: Array, default: () => [] },
  wechatLoading: { type: Object, default: () => ({}) },
});
const emit = defineEmits([
  "refresh",
  "edit",
  "remove",
  "wechat-draft",
  "wechat-publish",
  "wechat-status",
]);

const importing = ref(false);
const syncing = ref(false);
const form = ref({});
const records = ref(null);
const attempts = computed(() => {
  const state = records.value?.wechat;
  return state ? [state, ...(state.history || []).slice().reverse()].filter(row => row.publishId || row.submissionPending) : [];
});

function openImport(record) {
  form.value = record ? { postId: record.id, title: record.title, publishedAt: record.publishedAt,
    url: record.wechat.importUrl || '', accountConfirmed: false } : { accountConfirmed: false };
  importing.value = true;
}

async function syncArticles() {
  if (syncing.value) return;
  syncing.value = true;
  try {
    const result = await api.post('/content-posts/wechat-sync', {}, { timeoutMs: 120000 });
    Message.success(`新增 ${result.added} 篇，跳过 ${result.skipped} 条缺少文章信息的记录`);
  } catch (error) {
    Message.error(error.message);
  } finally {
    syncing.value = false;
    emit('refresh');
  }
}

async function importLink() {
  try {
    const result = await api.post('/content-posts/wechat-import', form.value);
    Message.success(result.added ? '文章已加入小程序资讯' : '原文信息已核对');
    emit('refresh');
    return true;
  } catch (error) {
    Message.error(error.message);
    return false;
  }
}

const columns = [
  { title: "类型", slotName: "type", width: 100 },
  { title: "标题", dataIndex: "title", ellipsis: true, tooltip: true },
  { title: "来源", dataIndex: "source", width: 180 },
  { title: "发布日期", dataIndex: "publishedAt", width: 120 },
  { title: "公众号", slotName: "wechat", width: 130 },
  { title: "状态", slotName: "status", width: 90 },
  { title: "操作", slotName: "actions", width: 330 },
];

function wechatStatus(record) {
  if (record.wechat?.withdrawn) return { label: record.wechat.publishStatus === 6 ? "微信已封禁" : "微信已撤回", color: "gray" };
  if (record.wechat?.sourceVerification) return record.wechat.confirmedAt
    ? { label: "原文已核对", color: "green" } : { label: "原文待核对", color: "orange" };
  if (record.wechat?.submissionPending) return { label: "提交结果待核实", color: "orange" };
  if (!record.wechat?.draftMediaId) return { label: "未生成草稿", color: "gray" };
  if (!record.wechat.publishId)
    return { label: "草稿待确认", color: "orange" };
  const status = Number(record.wechat.publishStatus);
  if (status === 0) return { label: "已发布", color: "green" };
  if (status === 1) return { label: "发布中", color: "arcoblue" };
  return { label: "发布失败", color: "red" };
}
</script>

<template>
  <section>
    <a-alert type="info" class="toolbar"
      >转载政府信息时请填写准确来源与原文链接，正文不要改动政策口径。</a-alert
    >
    <div class="list-create-toolbar">
      <a-button type="primary" shape="round" @click="emit('edit', null)">
        <template #icon><IconPlus /></template>
        新增资讯/视频
      </a-button>
      <a-button :loading="syncing" @click="syncArticles">同步公众号发表记录</a-button>
      <a-button @click="openImport()">按文章链接导入</a-button>
    </div>
    <a-modal v-model:visible="importing" title="核对岁悦里文化科技已发表文章" :ok-text="form.postId ? '保存原文信息' : '导入文章'" :on-before-ok="importLink">
      <a-form :model="form" layout="vertical">
        <a-form-item label="原标题"><a-input v-model="form.title" /></a-form-item>
        <a-form-item label="发表日期"><a-date-picker v-model="form.publishedAt" value-format="YYYY-MM-DD" /></a-form-item>
        <a-form-item label="微信文章链接"><a-input v-model="form.url" placeholder="https://mp.weixin.qq.com/s/…" /></a-form-item>
        <a-form-item><a-checkbox v-model="form.accountConfirmed">我已打开这篇原文，确认发表账号为“岁悦里文化科技”，标题和发表日期一致。</a-checkbox></a-form-item>
      </a-form>
    </a-modal>
    <a-modal :visible="!!records" title="公众号发表记录" :footer="false" @cancel="records = null">
      <p v-for="row in attempts" :key="row.publishId || row.draftMediaId">
        {{ row.publishSubmittedAt }} · {{ wechatStatus({ wechat: row }).label }}
        <span v-if="row.publishId"> · {{ row.publishId }}</span>
        <a v-if="row.publicArticleUrl" :href="row.publicArticleUrl" target="_blank" rel="noopener noreferrer">查看原文</a>
      </p>
    </a-modal>
    <a-card :bordered="false">
      <a-table
        :columns="columns"
        :data="posts"
        :pagination="false"
        row-key="id"
        :scroll="{ x: 1100 }"
      >
        <template #type="{ record }">
          <a-tag :color="record.type === 'video' ? 'purple' : 'arcoblue'">
            {{ record.type === "video" ? "视频" : "政策资讯" }}
          </a-tag>
        </template>
        <template #status="{ record }">
          <a-tag :color="record.status !== 0 ? 'green' : 'gray'">
            {{ record.status !== 0 ? "上架" : "下架" }}
          </a-tag>
        </template>
            <template #wechat="{ record }">
              <a-tag v-if="record.type === 'news'" :color="wechatStatus(record).color">
                {{ wechatStatus(record).label }}
              </a-tag>
              <span v-else>—</span>
            </template>
        <template #actions="{ record }">
              <a-space :size="0" wrap>
            <a-button type="text" size="small" @click="emit('edit', record)"
              >编辑</a-button
            >
                <a-button v-if="record.wechat?.sourceVerification && !record.wechat.withdrawn"
                  type="text" size="small" @click="openImport(record)">核对原文</a-button>
                <a-button
                  v-if="record.type === 'news' && !record.wechat?.sourceVerification && record.wechat?.publishStatus !== 1"
                  type="text"
                  size="small"
                  :loading="wechatLoading[`${record.id}:draft`]"
                  @click="emit('wechat-draft', record)"
                  >生成图文草稿</a-button
                >
                <a-button v-if="record.type === 'news' && !record.wechat?.sourceVerification && record.wechat?.publishStatus !== 1"
                  type="text" size="small" :loading="wechatLoading[`${record.id}:draft`]"
                  @click="emit('wechat-draft', record, 'newspic')">生成贴图草稿</a-button>
                <a-button v-if="record.wechat?.history?.length || record.wechat?.publishId || record.wechat?.submissionPending"
                  type="text" size="small" @click="records = record">发表记录</a-button>
                <a-button
                  v-if="record.type === 'news' && record.wechat?.draftMediaId && !record.wechat?.publishId && !record.wechat?.submissionPending"
                  type="text"
                  size="small"
                  status="warning"
                  :loading="wechatLoading[`${record.id}:publish`]"
                  @click="emit('wechat-publish', record)"
                  >提交发布</a-button
                >
                <a-button
                  v-if="record.type === 'news' && record.wechat?.publishId"
                  type="text"
                  size="small"
                  :loading="wechatLoading[`${record.id}:status`]"
                  @click="emit('wechat-status', record)"
                  >查询状态</a-button
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
  </section>
</template>

<style scoped>
.toolbar {
  margin-bottom: 16px;
}
</style>
