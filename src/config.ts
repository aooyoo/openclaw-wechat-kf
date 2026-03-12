import type {
  OpenClawConfig,
  WechatKfChannelConfig,
  WechatKfAccountConfig,
  ResolvedWechatKfAccount,
} from "./types.js";

const CHANNEL_ID = "wechat-kf";

/**
 * 获取频道配置
 */
function getChannelConfig(cfg: OpenClawConfig): WechatKfChannelConfig {
  return (cfg.channels?.[CHANNEL_ID] ?? {}) as WechatKfChannelConfig;
}

/**
 * 列出所有已配置的账号 ID
 */
export function listAccountIds(cfg: OpenClawConfig): string[] {
  const channelCfg = getChannelConfig(cfg);
  const ids: string[] = [];

  // 如果有顶层配置（默认账号）
  if (channelCfg.corpId || channelCfg.kfSecret) {
    ids.push("default");
  }

  // 多账号
  if (channelCfg.accounts) {
    for (const id of Object.keys(channelCfg.accounts)) {
      if (!ids.includes(id)) {
        ids.push(id);
      }
    }
  }

  return ids;
}

/**
 * 解析完整的账号配置
 */
export function resolveAccount(
  cfg: OpenClawConfig,
  accountId: string,
): ResolvedWechatKfAccount {
  const channelCfg = getChannelConfig(cfg);
  let accountCfg: WechatKfAccountConfig;

  if (accountId === "default") {
    accountCfg = channelCfg;
  } else {
    accountCfg = channelCfg.accounts?.[accountId] ?? {};
    // 从顶层继承缺失的字段
    accountCfg = {
      corpId: accountCfg.corpId ?? channelCfg.corpId,
      kfSecret: accountCfg.kfSecret ?? channelCfg.kfSecret,
      token: accountCfg.token ?? channelCfg.token,
      encodingAESKey: accountCfg.encodingAESKey ?? channelCfg.encodingAESKey,
      openKfId: accountCfg.openKfId ?? channelCfg.openKfId,
      enabled: accountCfg.enabled ?? channelCfg.enabled,
    };
  }

  return {
    accountId,
    enabled: accountCfg.enabled !== false,
    corpId: accountCfg.corpId ?? "",
    kfSecret: accountCfg.kfSecret ?? "",
    token: accountCfg.token ?? "",
    encodingAESKey: accountCfg.encodingAESKey ?? "",
    openKfId: accountCfg.openKfId ?? "",
  };
}

/**
 * 检查账号是否已配置
 */
export function isAccountConfigured(
  cfg: OpenClawConfig,
  accountId: string,
): boolean {
  const account = resolveAccount(cfg, accountId);
  return account !== null && !!account.corpId && !!account.kfSecret && !!account.token;
}
