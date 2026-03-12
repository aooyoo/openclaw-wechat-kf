import type {
  AccessTokenResponse,
  SyncMsgResponse,
  SendMsgResponse,
  ResolvedWechatKfAccount,
} from "./types.js";

const BASE_URL = "https://qyapi.weixin.qq.com";

// access_token 缓存
interface TokenCache {
  token: string;
  expiresAt: number;
}

const tokenCache = new Map<string, TokenCache>();

// 并发刷新保护
const pendingRefresh = new Map<string, Promise<string>>();

/**
 * 获取 access_token（带缓存，提前 10 分钟刷新）
 */
export async function getAccessToken(
  corpId: string,
  kfSecret: string,
): Promise<string> {
  const cacheKey = `${corpId}:${kfSecret}`;

  // 检查缓存
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }

  // 并发保护：如果已有刷新请求，等待其完成
  const pending = pendingRefresh.get(cacheKey);
  if (pending) return pending;

  const refreshPromise = (async () => {
    try {
      const url = `${BASE_URL}/cgi-bin/gettoken?corpid=${encodeURIComponent(corpId)}&corpsecret=${encodeURIComponent(kfSecret)}`;
      const resp = await fetch(url);
      const data = (await resp.json()) as AccessTokenResponse;

      if (data.errcode && data.errcode !== 0) {
        throw new Error(
          `Failed to get access_token: ${data.errcode} ${data.errmsg}`,
        );
      }

      // 缓存，提前 10 分钟过期
      const token = data.access_token;
      tokenCache.set(cacheKey, {
        token,
        expiresAt: Date.now() + (data.expires_in - 600) * 1000,
      });

      return token;
    } finally {
      pendingRefresh.delete(cacheKey);
    }
  })();

  pendingRefresh.set(cacheKey, refreshPromise);
  return refreshPromise;
}

/**
 * 清除指定账号的 access_token 缓存
 */
export function clearTokenCache(corpId: string, kfSecret: string): void {
  tokenCache.delete(`${corpId}:${kfSecret}`);
}

/**
 * 拉取消息
 * POST /cgi-bin/kf/sync_msg
 */
export async function syncMessages(
  account: ResolvedWechatKfAccount,
  cursor?: string,
  token?: string,
  limit?: number,
): Promise<SyncMsgResponse> {
  const accessToken = await getAccessToken(account.corpId, account.kfSecret);
  const url = `${BASE_URL}/cgi-bin/kf/sync_msg?access_token=${accessToken}`;

  const body: Record<string, any> = {};
  if (cursor) body.cursor = cursor;
  if (token) body.token = token;
  if (limit) body.limit = limit;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = (await resp.json()) as SyncMsgResponse;

  if (data.errcode && data.errcode !== 0) {
    // token 过期，清除缓存重试一次
    if (data.errcode === 40014 || data.errcode === 42001) {
      clearTokenCache(account.corpId, account.kfSecret);
      const newToken = await getAccessToken(account.corpId, account.kfSecret);
      const retryResp = await fetch(
        `${BASE_URL}/cgi-bin/kf/sync_msg?access_token=${newToken}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      return (await retryResp.json()) as SyncMsgResponse;
    }
    throw new Error(
      `sync_msg failed: ${data.errcode} ${data.errmsg}`,
    );
  }

  return data;
}

/**
 * 发送消息
 * POST /cgi-bin/kf/send_msg
 */
export async function sendMessage(
  account: ResolvedWechatKfAccount,
  touser: string,
  openKfId: string,
  msgtype: string,
  content: Record<string, any>,
): Promise<SendMsgResponse> {
  const accessToken = await getAccessToken(account.corpId, account.kfSecret);
  const url = `${BASE_URL}/cgi-bin/kf/send_msg?access_token=${accessToken}`;

  const body: Record<string, any> = {
    touser,
    open_kfid: openKfId,
    msgtype,
    [msgtype]: content,
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = (await resp.json()) as SendMsgResponse;

  if (data.errcode && data.errcode !== 0) {
    // token 过期重试
    if (data.errcode === 40014 || data.errcode === 42001) {
      clearTokenCache(account.corpId, account.kfSecret);
      const newToken = await getAccessToken(account.corpId, account.kfSecret);
      const retryResp = await fetch(
        `${BASE_URL}/cgi-bin/kf/send_msg?access_token=${newToken}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      return (await retryResp.json()) as SendMsgResponse;
    }
  }

  return data;
}

/**
 * 发送文本消息（便捷方法）
 */
export async function sendTextMessage(
  account: ResolvedWechatKfAccount,
  touser: string,
  text: string,
): Promise<SendMsgResponse> {
  return sendMessage(account, touser, account.openKfId, "text", {
    content: text,
  });
}
