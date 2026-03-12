import type { OpenClawConfig, ResolvedWechatKfAccount } from "./types.js";
import { listAccountIds, resolveAccount, isAccountConfigured } from "./config.js";
import { sendText } from "./outbound.js";
import { accountStates } from "./callback.js";
import { getRuntime } from "./runtime.js";
import { getAccessToken } from "./api.js";
import { chunkText } from "./outbound.js";

/**
 * 微信客服 Channel 插件定义
 * 实现 OpenClaw ChannelPlugin 接口
 */
export const wechatKfPlugin = {
  id: "wechat-kf",

  meta: {
    id: "wechat-kf",
    label: "微信客服",
    selectionLabel: "微信客服 (WeChat KF)",
    docsPath: "/docs/channels/wechat-kf",
    blurb: "通过微信客服 API 接收和发送消息",
    aliases: ["wechat-kf", "wxkf"],
  },

  capabilities: {
    chatTypes: ["direct"] as const,
    media: true,
    reactions: false,
    threads: false,
    blockStreaming: true,
  },

  config: {
    listAccountIds(cfg: OpenClawConfig): string[] {
      return listAccountIds(cfg);
    },

    resolveAccount(
      cfg: OpenClawConfig,
      accountId: string,
    ): ResolvedWechatKfAccount {
      return resolveAccount(cfg, accountId);
    },

    defaultAccountId(cfg: OpenClawConfig): string | undefined {
      const ids = listAccountIds(cfg);
      return ids.length > 0 ? ids[0] : undefined;
    },

    isConfigured(account: ResolvedWechatKfAccount): boolean {
      return !!account.corpId && !!account.kfSecret && !!account.token;
    },

    describeAccount(account: ResolvedWechatKfAccount): string {
      return `微信客服 [${account.openKfId || account.accountId}]`;
    },
  },

  setup: {
    resolveAccountId(input: string): string {
      return input || "default";
    },

    validateInput(input: { token?: string }): { ok: boolean; error?: string } {
      if (!input.token) {
        return { ok: false, error: "请提供 --token 参数，格式: corpId:kfSecret:token:encodingAESKey:openKfId" };
      }
      const parts = input.token.split(":");
      if (parts.length < 4) {
        return { ok: false, error: "Token 格式错误，需要: corpId:kfSecret:token:encodingAESKey[:openKfId]" };
      }
      return { ok: true };
    },

    applyAccountConfig(
      cfg: OpenClawConfig,
      accountId: string,
      input: { token: string },
    ): OpenClawConfig {
      const parts = input.token.split(":");
      const [corpId, kfSecret, token, encodingAESKey, openKfId] = parts;

      const channelKey = "wechat-kf";
      if (!cfg.channels) cfg.channels = {};
      if (!cfg.channels[channelKey]) cfg.channels[channelKey] = {};

      if (accountId === "default") {
        Object.assign(cfg.channels[channelKey], {
          corpId,
          kfSecret,
          token,
          encodingAESKey,
          openKfId: openKfId ?? "",
          enabled: true,
        });
      } else {
        if (!cfg.channels[channelKey].accounts) {
          cfg.channels[channelKey].accounts = {};
        }
        cfg.channels[channelKey].accounts[accountId] = {
          corpId,
          kfSecret,
          token,
          encodingAESKey,
          openKfId: openKfId ?? "",
          enabled: true,
        };
      }

      return cfg;
    },
  },

  messaging: {
    normalizeTarget(target: string): { to: string; openKfId?: string } | null {
      // 支持格式: "external_userid" 或 "external_userid@open_kfid"
      if (target.includes("@")) {
        const [to, openKfId] = target.split("@");
        return { to, openKfId };
      }
      return { to: target };
    },
  },

  outbound: {
    deliveryMode: "direct" as const,
    chunker: chunkText,
    chunkerMode: "text" as const,
    textChunkLimit: 2048,

    async sendText(params: {
      to: string;
      text: string;
      accountId: string;
      replyToId?: string;
      cfg: OpenClawConfig;
    }): Promise<{ channel: string; messageId?: string; error?: string }> {
      const account = resolveAccount(params.cfg, params.accountId);
      if (!account.corpId || !account.kfSecret) {
        return { channel: "wechat-kf", error: "Account not configured (missing corpId or kfSecret)" };
      }

      const result = await sendText(account, params.to, params.text);

      // 更新状态
      const state = accountStates.get(account.accountId);
      if (state) state.lastOutboundAt = Date.now();

      return {
        channel: "wechat-kf",
        messageId: result.messageId,
        error: result.ok ? undefined : result.error,
      };
    },
  },

  gateway: {
    async startAccount(ctx: {
      accountId: string;
      cfg: OpenClawConfig;
      setStatus: (status: string) => void;
    }): Promise<void> {
      const log = getRuntime().log;
      const account = resolveAccount(ctx.cfg, ctx.accountId);

      if (!account.corpId || !account.kfSecret) {
        ctx.setStatus("error");
        log.error(`Account ${ctx.accountId} not configured (missing corpId or kfSecret)`);
        return;
      }

      // 验证凭据可用性（尝试获取 access_token）
      try {
        await getAccessToken(account.corpId, account.kfSecret);
        ctx.setStatus("connected");
        log.info(
          `微信客服账号 ${ctx.accountId} 已连接 (openKfId: ${account.openKfId})`,
        );

        // 初始化运行时状态
        accountStates.set(ctx.accountId, {
          accountId: ctx.accountId,
          running: true,
          connected: true,
        });
      } catch (err: any) {
        ctx.setStatus("error");
        log.error(`微信客服账号 ${ctx.accountId} 连接失败: ${err.message}`);
        accountStates.set(ctx.accountId, {
          accountId: ctx.accountId,
          running: false,
          connected: false,
          lastError: err.message,
        });
      }
    },
  },

  status: {
    defaultRuntime: {
      accountId: "",
      running: false,
      connected: false,
    },

    buildAccountSnapshot(params: {
      account: ResolvedWechatKfAccount;
    }): Record<string, any> {
      const state = accountStates.get(params.account.accountId);
      return {
        accountId: params.account.accountId,
        openKfId: params.account.openKfId,
        running: state?.running ?? false,
        connected: state?.connected ?? false,
        lastError: state?.lastError,
        lastInboundAt: state?.lastInboundAt,
        lastOutboundAt: state?.lastOutboundAt,
      };
    },
  },
};
