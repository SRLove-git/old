<script setup>
import { ref } from "vue";

const config = defineModel("config", { type: Object, required: true });

defineProps({
  categories: { type: Array, default: () => [] },
  qrUploading: { type: Object, required: true },
  previewUrl: { type: Function, required: true },
});

const emit = defineEmits(["category-limit", "upload-qr", "save"]);

const officialQrInput = ref(null);
const videoQrInput = ref(null);
const homeQrInput = ref(null);

function chooseQr(field) {
  const inputs = {
    officialAccount: officialQrInput.value,
    videoChannel: videoQrInput.value,
    homeAssistant: homeQrInput.value,
  };
  inputs[field]?.click();
}

function addRechargeAmount() {
  const amounts = config.value.balanceRechargeAmounts;
  if (amounts.length >= 8) return;
  const used = new Set(amounts.map(Number));
  const suggested = [20, 50, 100, 200, 300, 500, 1000, 2000].find(
    (amount) => !used.has(amount),
  );
  amounts.push(
    suggested || Math.min(50000, Number(amounts[amounts.length - 1] || 0) + 50),
  );
}

function removeRechargeAmount(index) {
  if (config.value.balanceRechargeAmounts.length <= 1) return;
  config.value.balanceRechargeAmounts.splice(index, 1);
}
</script>

<template>
  <section>
    <a-card title="业务规则配置" :bordered="false" class="config-card">
      <a-form :model="config" layout="vertical">
        <a-form-item label="全局默认分佣比例（%）">
          <a-input-number
            v-model="config.globalCommissionRate"
            :min="0"
            :max="100"
            class="full-width"
          />
        </a-form-item>
        <a-form-item label="最低提现金额（元）">
          <a-input-number
            v-model="config.minWithdraw"
            :min="0"
            class="full-width"
          />
        </a-form-item>
        <a-form-item label="每月提现次数上限">
          <a-input-number
            v-model="config.withdrawMonthlyLimit"
            :min="0"
            class="full-width"
          />
        </a-form-item>
        <a-form-item label="提现代扣税费比例（%）">
          <a-input-number
            v-model="config.withdrawTaxRate"
            :min="0"
            :max="100"
            class="full-width"
          />
        </a-form-item>
        <a-form-item label="主理人申请费用（元）">
          <a-input-number
            v-model="config.managerApplyFee"
            :min="0"
            class="full-width"
          />
        </a-form-item>
        <a-form-item label="退款后优惠券退回">
          <a-radio-group v-model="config.couponRefundReturn" type="button">
            <a-radio value="auto">未出行退款退回（已核销不退）</a-radio>
            <a-radio value="always">一律退回</a-radio>
            <a-radio value="never">不退回</a-radio>
          </a-radio-group>
        </a-form-item>
        <a-form-item label="用户申请退款是否需要审核">
          <a-switch v-model="config.refundNeedAudit" />
          <span class="muted">
            {{
              config.refundNeedAudit !== false
                ? "开启：申请先进入「退款中」，由运营在订单页同意或拒绝"
                : "关闭：用户申请后即时退款"
            }}
          </span>
        </a-form-item>
      </a-form>
    </a-card>

    <a-card title="余额充值配置" :bordered="false" class="config-card">
      <a-alert type="info" class="section-alert">
        设置小程序“我的余额”页面显示的快捷充值金额，展示顺序与下方一致。支持 1–8 个档位。
      </a-alert>
      <a-form :model="config" layout="vertical">
        <a-form-item label="快捷充值金额（元）">
          <div class="recharge-amount-list">
            <div
              v-for="(_, index) in config.balanceRechargeAmounts"
              :key="index"
              class="recharge-amount-row"
            >
              <a-input-number
                v-model="config.balanceRechargeAmounts[index]"
                :min="1"
                :max="50000"
                :precision="2"
                class="recharge-amount-input"
              />
              <a-button
                status="danger"
                :disabled="config.balanceRechargeAmounts.length <= 1"
                @click="removeRechargeAmount(index)"
              >删除</a-button>
            </div>
          </div>
          <a-button
            class="add-recharge-amount"
            :disabled="config.balanceRechargeAmounts.length >= 8"
            @click="addRechargeAmount"
          >+ 添加充值档位</a-button>
        </a-form-item>
      </a-form>
    </a-card>

    <a-card
      title="首页展示数量"
      :bordered="false"
      class="config-card home-display-config-card"
    >
      <a-alert type="info" class="section-alert">
        这里只控制首页直接展示的数量，不会下架或删除内容。超出的已上架内容仍可从“查看全部”进入列表查看；设置为
        0 可隐藏对应首页模块。
      </a-alert>
      <a-form :model="config" layout="vertical">
        <a-form-item
          v-for="item in categories"
          :key="item.id"
          :label="`${item.name}首页展示数量`"
        >
          <a-input-number
            :model-value="Number(item.homeDisplayLimit ?? 6)"
            :min="0"
            :max="50"
            :precision="0"
            class="full-width"
            @change="emit('category-limit', item.id, $event)"
          />
        </a-form-item>
        <a-row :gutter="12">
          <a-col :span="12">
            <a-form-item label="政策资讯展示数量">
              <a-input-number
                v-model="config.homeDisplay.newsLimit"
                :min="0"
                :max="20"
                :precision="0"
                class="full-width"
              />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="视频推荐展示数量">
              <a-input-number
                v-model="config.homeDisplay.videoLimit"
                :min="0"
                :max="20"
                :precision="0"
                class="full-width"
              />
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>
    </a-card>

    <a-card title="品牌信息" :bordered="false" class="config-card">
      <a-form :model="config" layout="vertical">
        <a-form-item label="中文品牌名">
          <a-input
            v-model="config.brand.chineseName"
            placeholder="例如：岁悦里"
          />
        </a-form-item>
        <a-form-item label="页脚英文品牌名">
          <a-input
            v-model="config.brand.englishName"
            placeholder="例如：SUI YUE LI"
          />
        </a-form-item>
        <a-form-item label="首页口号">
          <a-input
            v-model="config.brand.slogan"
            placeholder="例如：和同龄人一起，玩得开心又省心"
          />
        </a-form-item>
      </a-form>
    </a-card>

    <a-card
      title="用户端运营文案"
      :bordered="false"
      class="config-card copy-config-card"
    >
      <a-alert type="info" class="section-alert">
        修改中文品牌名后，相关品牌文案会自动同步，无需逐项替换。会员权益每行格式为“图标|文案”，完成后请保存全部配置。
      </a-alert>
      <a-form :model="config" layout="vertical">
        <a-row :gutter="12">
          <a-col :span="12"
            ><a-form-item label="登录欢迎语"
              ><a-input v-model="config.copy.loginTitle" /></a-form-item
          ></a-col>
          <a-col :span="12"
            ><a-form-item label="登录说明"
              ><a-input v-model="config.copy.loginDescription" /></a-form-item
          ></a-col>
          <a-col :span="12"
            ><a-form-item label="首页欢迎标题"
              ><a-input v-model="config.copy.homeWelcomeTitle" /></a-form-item
          ></a-col>
          <a-col :span="12"
            ><a-form-item label="首页欢迎说明"
              ><a-input
                v-model="config.copy.homeWelcomeSubtitle" /></a-form-item
          ></a-col>
          <a-col :span="12"
            ><a-form-item label="轮播图品牌标识"
              ><a-input v-model="config.copy.homeHeroKicker" /></a-form-item
          ></a-col>
          <a-col :span="12"
            ><a-form-item label="分类数量文案"
              ><a-input
                v-model="config.copy.homeCategoryCountText" /></a-form-item
          ></a-col>
          <a-col :span="12"
            ><a-form-item label="入会区标题"
              ><a-input v-model="config.copy.homeMemberTitle" /></a-form-item
          ></a-col>
          <a-col :span="12"
            ><a-form-item label="入会区说明"
              ><a-input v-model="config.copy.homeMemberSubtitle" /></a-form-item
          ></a-col>
          <a-col :span="12"
            ><a-form-item label="首页品牌展示名"
              ><a-input v-model="config.copy.homeHighlightBrand" /></a-form-item
          ></a-col>
          <a-col :span="12"
            ><a-form-item label="首页品牌展示标题"
              ><a-input v-model="config.copy.homeHighlightTitle" /></a-form-item
          ></a-col>
          <a-col :span="24"
            ><a-form-item label="首页品牌展示说明"
              ><a-input
                v-model="config.copy.homeHighlightSubtitle" /></a-form-item
          ></a-col>
          <a-col :span="12"
            ><a-form-item label="会员权益摘要"
              ><a-input
                v-model="config.copy.memberBenefitsSummary" /></a-form-item
          ></a-col>
          <a-col :span="12"
            ><a-form-item label="主理人审核中提示"
              ><a-input
                v-model="config.copy.managerReviewPendingText" /></a-form-item
          ></a-col>
          <a-col :span="24"
            ><a-form-item label="社交二维码引导语"
              ><a-input v-model="config.copy.socialFollowTip" /></a-form-item
          ></a-col>
          <a-col :span="12"
            ><a-form-item label="公众号名称"
              ><a-input
                v-model="config.copy.officialAccountName" /></a-form-item
          ></a-col>
          <a-col :span="12"
            ><a-form-item label="视频号名称"
              ><a-input v-model="config.copy.videoChannelName" /></a-form-item
          ></a-col>
          <a-col :span="12"
            ><a-form-item label="详情图品牌名"
              ><a-input v-model="config.copy.detailGalleryBrand" /></a-form-item
          ></a-col>
          <a-col :span="12"
            ><a-form-item label="详情入会优惠语"
              ><a-input v-model="config.copy.detailMemberOffer" /></a-form-item
          ></a-col>
          <a-col :span="12"
            ><a-form-item label="课程讲师说明"
              ><a-input
                v-model="config.copy.courseTeacherDescription" /></a-form-item
          ></a-col>
          <a-col :span="12"
            ><a-form-item label="商家福利副标题"
              ><a-input
                v-model="config.copy.merchantBenefitsSubtitle" /></a-form-item
          ></a-col>
          <a-col :span="12"
            ><a-form-item label="店铺默认介绍"
              ><a-input v-model="config.copy.defaultShopIntro" /></a-form-item
          ></a-col>
          <a-col :span="12"
            ><a-form-item label="用户名设置说明"
              ><a-input
                v-model="config.copy.profileEditDescription" /></a-form-item
          ></a-col>
          <a-col :span="12"
            ><a-form-item label="会员卡副标题"
              ><a-input v-model="config.copy.memberCardSubtitle" /></a-form-item
          ></a-col>
          <a-col :span="12"
            ><a-form-item label="会员卡身份名"
              ><a-input v-model="config.copy.memberCardTitle" /></a-form-item
          ></a-col>
          <a-col :span="24"
            ><a-form-item label="会员权益列表"
              ><a-textarea
                v-model="config.copy.memberBenefitLines"
                :auto-size="{ minRows: 5, maxRows: 10 }" /></a-form-item
          ></a-col>
          <a-col :span="12"
            ><a-form-item label="入会引导语"
              ><a-input v-model="config.copy.memberJoinText" /></a-form-item
          ></a-col>
          <a-col :span="12"
            ><a-form-item label="入会成功提示"
              ><a-input
                model-value="系统会按实际发券数量自动生成"
                disabled /></a-form-item
          ></a-col>
          <a-col :span="12"
            ><a-form-item label="主理人分享标题"
              ><a-input v-model="config.copy.shareManagerTitle" /></a-form-item
          ></a-col>
          <a-col :span="12"
            ><a-form-item label="活动列表分享标题"
              ><a-input v-model="config.copy.shareActivityTitle" /></a-form-item
          ></a-col>
        </a-row>
      </a-form>
    </a-card>

    <a-card title="助理人信息" :bordered="false" class="config-card">
      <a-form :model="config" layout="vertical">
        <a-form-item label="助理人昵称"
          ><a-input v-model="config.assistant.name" placeholder="例如：小助理"
        /></a-form-item>
        <a-form-item label="微信号"
          ><a-input
            v-model="config.assistant.wechat"
            placeholder="例如：suiyueli6070"
        /></a-form-item>
        <a-form-item label="客服电话"
          ><a-input
            v-model="config.assistant.phone"
            placeholder="例如：400-800-6070"
        /></a-form-item>
        <a-form-item label="头像（emoji）"
          ><a-input v-model="config.assistant.avatar" placeholder="例如：🧑‍💼"
        /></a-form-item>
        <a-form-item label="一句话介绍"
          ><a-input
            v-model="config.assistant.intro"
            placeholder="例如：报名咨询、活动群、售后都可以找我"
        /></a-form-item>
      </a-form>
    </a-card>

    <a-card title="首页小助理二维码区" :bordered="false" class="config-card">
      <a-alert type="info" class="section-alert">
        修改上方助理微信号后，这里的微信说明会自动同步。上传后请点击页面底部“保存全部配置”。
      </a-alert>
      <a-form :model="config" layout="vertical">
        <a-form-item label="区域标题"
          ><a-input
            v-model="config.homeAssistant.title"
            placeholder="例如：小助理服务"
        /></a-form-item>
        <a-form-item label="二维码引导语"
          ><a-input
            v-model="config.homeAssistant.tip"
            placeholder="例如：长按二维码，添加小助理微信"
        /></a-form-item>
        <a-form-item label="微信说明"
          ><a-input
            v-model="config.homeAssistant.wechatNote"
            placeholder="例如：微信号：助理微信号（长按识别或保存二维码）"
        /></a-form-item>
      </a-form>
      <div class="qr-config-grid qr-config-grid-single">
        <div class="qr-config-item">
          <div class="qr-config-title">首页小助理二维码</div>
          <img
            v-if="config.homeAssistant.qrImage"
            class="qr-config-preview"
            :src="previewUrl(config.homeAssistant.qrImage)"
            alt="首页小助理二维码"
          />
          <div v-else class="qr-config-empty">当前使用小程序内置二维码</div>
          <input
            ref="homeQrInput"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            @change="emit('upload-qr', $event, 'homeAssistant')"
          />
          <a-space>
            <a-button
              type="primary"
              :loading="qrUploading.homeAssistant"
              @click="chooseQr('homeAssistant')"
              >上传图片</a-button
            >
            <a-button
              v-if="config.homeAssistant.qrImage"
              @click="config.homeAssistant.qrImage = ''"
              >恢复内置二维码</a-button
            >
          </a-space>
        </div>
      </div>
    </a-card>

    <a-card title="公众号与视频号二维码" :bordered="false" class="config-card">
      <a-alert type="info" class="section-alert">
        上传后请点击页面底部“保存全部配置”，个人中心才会显示最新二维码。
      </a-alert>
      <div class="qr-config-grid">
        <div class="qr-config-item">
          <div class="qr-config-title">公众号二维码</div>
          <img
            v-if="config.socialQrs.officialAccount"
            class="qr-config-preview"
            :src="previewUrl(config.socialQrs.officialAccount)"
            alt="公众号二维码"
          />
          <div v-else class="qr-config-empty">尚未上传</div>
          <input
            ref="officialQrInput"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            @change="emit('upload-qr', $event, 'officialAccount')"
          />
          <a-space>
            <a-button
              type="primary"
              :loading="qrUploading.officialAccount"
              @click="chooseQr('officialAccount')"
              >上传图片</a-button
            >
            <a-button
              v-if="config.socialQrs.officialAccount"
              @click="config.socialQrs.officialAccount = ''"
              >移除</a-button
            >
          </a-space>
        </div>
        <div class="qr-config-item">
          <div class="qr-config-title">视频号二维码</div>
          <img
            v-if="config.socialQrs.videoChannel"
            class="qr-config-preview"
            :src="previewUrl(config.socialQrs.videoChannel)"
            alt="视频号二维码"
          />
          <div v-else class="qr-config-empty">尚未上传</div>
          <input
            ref="videoQrInput"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            @change="emit('upload-qr', $event, 'videoChannel')"
          />
          <a-space>
            <a-button
              type="primary"
              :loading="qrUploading.videoChannel"
              @click="chooseQr('videoChannel')"
              >上传图片</a-button
            >
            <a-button
              v-if="config.socialQrs.videoChannel"
              @click="config.socialQrs.videoChannel = ''"
              >移除</a-button
            >
          </a-space>
        </div>
      </div>
    </a-card>

    <a-card title="备案信息" :bordered="false" class="config-card">
      <a-form :model="config" layout="vertical">
        <a-form-item label="公司名称"
          ><a-input
            v-model="config.filing.companyName"
            placeholder="例如：北京岁悦里科技有限公司"
        /></a-form-item>
        <a-form-item label="ICP备案号"
          ><a-input
            v-model="config.filing.icp"
            placeholder="例如：京ICP备2025001234号-1"
        /></a-form-item>
        <a-form-item label="公安备案号（可选）"
          ><a-input
            v-model="config.filing.police"
            placeholder="例如：京公网安备11010102001234号"
        /></a-form-item>
      </a-form>
    </a-card>

    <div class="actions-row">
      <a-button type="primary" @click="emit('save')">保存全部配置</a-button>
    </div>
  </section>
</template>

<style scoped>
.config-card {
  max-width: 520px;
  margin-bottom: 16px;
}

.home-display-config-card,
.copy-config-card {
  max-width: 760px;
}

.full-width {
  width: 100%;
}

.section-alert {
  margin-bottom: 18px;
}

.recharge-amount-list {
  display: grid;
  gap: 10px;
}

.recharge-amount-row {
  display: flex;
  gap: 10px;
}

.recharge-amount-input {
  flex: 1;
}

.add-recharge-amount {
  width: 100%;
  margin-top: 12px;
}

.muted {
  margin-left: 12px;
  color: var(--color-text-3);
  font-size: 13px;
}

.actions-row {
  margin-top: 16px;
}

.qr-config-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.qr-config-grid-single {
  grid-template-columns: minmax(280px, 420px);
}

.qr-config-item {
  padding: 18px;
  border: 1px solid var(--color-border-2);
  border-radius: 10px;
  text-align: center;
}

.qr-config-title {
  margin-bottom: 12px;
  font-weight: 600;
}

.qr-config-preview,
.qr-config-empty {
  width: 160px;
  height: 160px;
  margin: 0 auto 14px;
  border-radius: 8px;
  background: var(--color-fill-2);
}

.qr-config-preview {
  display: block;
  object-fit: contain;
}

.qr-config-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-3);
}

@media (max-width: 700px) {
  .qr-config-grid,
  .qr-config-grid-single {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
