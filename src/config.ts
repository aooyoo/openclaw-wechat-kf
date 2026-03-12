import type {
  OpenClawConfig,
  WechatKfChannelConfig,
  WechatKfAccountConfig,
  ResolvedWechatKfAccount,
} from "./types.js";
import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const CHANNEL_ID = "wechat-kf";

// 直接从配置文件读取（兼容不同 OpenClaw 版本）
let _configCache: OpenClawConfig | null = null;

function loadConfig(): OpenClawConfig {
  try {
    const configPath = join(homedir(), ".openclaw", "openclaw.json");
    const content = readFileSync(configPath, "utf-8");
    return JSON.parse(content);
  } catch (e) {
    console.error("[wechat-kf] Failed to load config:", e);
    return { channels: {} };
  }
}

export function getConfig(): OpenClawConfig {
  if (!_configCache) {
    _configCache = loadConfig();
  }
  return _configCache;
}

export function refreshConfig(): void {
  _configCache = null;
}

function getChannelConfig(cfg: OpenClawConfig): WechatKfChannelConfig {
  return (cfg.channels?.[CHANNEL_ID] ?? {}) as WechatKfChannelConfig;
}

export function listAccountIds(cfg: OpenClawConfig): string[] {
  const channelCfg = getChannelConfig(cfg);
  const ids: string[] = [];

  if (channelCfg.corpId || channelCfg.kfSecret) {
    ids.push("default");
  }

  if (channelCfg.accounts) {
    for (const id of Object.keys(channelCfg.accounts)) {
      if (!ids.includes(id)) {
        ids.push(id);
      }
    }
  }

  return ids;
}

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

export function isAccountConfigured(
  cfg: OpenClawConfig,
  accountId: string,
): boolean {
  const account = resolveAccount(cfg, accountId);
  return !!account.corpId && !!account.kfSecret && !!account.token;
}
