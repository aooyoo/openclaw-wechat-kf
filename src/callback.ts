import type {
  ResolvedWechatKfAccount,
  KfMessage,
  IncomingMessage,
  AccountRuntimeState,
} from "./types.js";
import { verifySignature, decryptMessage } from "./crypto.js";
import { parseCallbackXml } from "./xml.js";
import { syncMessages } from "./api.js";
import { resolveAccount, listAccountIds, getConfig } from "./config.js";
import { getRuntime } from "./runtime.js";

/** 消息去重缓存 (msgid -> timestamp) */
const processedMessages = new Map<string, number>();
const DEDUP_TTL_MS = 10 * 60 * 1000; // 10 分钟

/** 每个账号的运行时状态 */
export const accountStates = new Map<string, AccountRuntimeState>();

/** 每个账号的消息拉取游标 */
const cursors = new Map<string, string>();

/**
 * 清理过期的去重缓存
 */
function cleanupDedup(): void {
  const now = Date.now();
  for (const [msgid, ts] of processedMessages) {
    if (now - ts > DEDUP_TTL_MS) {
      processedMessages.delete(msgid);
    }
  }
}

// 定期清理
setInterval(cleanupDedup, 60_000);

/**
 * 解析 URL 查询参数
 */
function parseQuery(url: string): Record<string, string> {
  const params: Record<string, string> = {};
  const queryString = url.split("?")[1];
  if (!queryString) return params;

  for (const pair of queryString.split("&")) {
    const [key, value] = pair.split("=");
    if (key) params[decodeURIComponent(key)] = decodeURIComponent(value ?? "");
  }
  return params;
}

/**
 * 读取请求体
 */
function readBody(req: any): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

/**
 * 查找匹配的账号（通过回调中的 ToUserName 或遍历所有账号）
 */
function findAccount(): ResolvedWechatKfAccount | null {
  const cfg = getConfig();
  const accountIds = listAccountIds(cfg);

  for (const id of accountIds) {
    const account = resolveAccount(cfg, id);
    if (account.enabled && account.corpId && account.kfSecret) {
      return account;
    }
  }
  return null;
}

/**
 * 将微信客服消息转换为 OpenClaw IncomingMessage
 */
function toIncomingMessage(
  msg: KfMessage,
  account: ResolvedWechatKfAccount,
): IncomingMessage | null {
  // 只处理客户发送的消息 (origin=3)
  if (msg.origin !== 3) return null;

  const base: IncomingMessage = {
    channel: "wechat-kf",
    accountId: account.accountId,
    senderId: msg.external_userid,
    messageId: msg.msgid,
    chatType: "direct",
    raw: msg,
  };

  switch (msg.msgtype) {
    case "text":
      return { ...base, text: msg.text?.content };

    case "image":
      return {
        ...base,
        text: "[图片]",
        mediaType: "image",
        mediaUrl: msg.image?.media_id,
      };

    case "voice":
      return {
        ...base,
        text: "[语音]",
        mediaType: "voice",
        mediaUrl: msg.voice?.media_id,
      };

    case "video":
      return {
        ...base,
        text: "[视频]",
        mediaType: "video",
        mediaUrl: msg.video?.media_id,
      };

    case "file":
      return {
        ...base,
        text: "[文件]",
        mediaType: "file",
        mediaUrl: msg.file?.media_id,
      };

    case "location":
      return {
        ...base,
        text: `[位置] ${msg.location?.name ?? ""} ${msg.location?.address ?? ""}`.trim(),
      };

    case "link":
      return {
        ...base,
        text: `[链接] ${msg.link?.title ?? ""}\n${msg.link?.url ?? ""}`,
      };

    case "business_card":
      return { ...base, text: "[名片]" };

    case "miniprogram":
      return {
        ...base,
        text: `[小程序] ${msg.miniprogram?.title ?? ""}`,
      };

    default:
      return { ...base, text: `[${msg.msgtype}]` };
  }
}

/**
 * 拉取并处理消息
 */
async function pullAndProcessMessages(
  account: ResolvedWechatKfAccount,
  callbackToken?: string,
): Promise<void> {
  const log = console;

  try {
    const cursor = cursors.get(account.accountId);
    const result = await syncMessages(account, cursor, callbackToken);

    if (result.errcode && result.errcode !== 0) {
      log.error(`sync_msg failed: ${result.errcode} ${result.errmsg}`);
      return;
    }

    // 更新游标
    if (result.next_cursor) {
      cursors.set(account.accountId, result.next_cursor);
    }

    // 处理消息
    for (const msg of result.msg_list ?? []) {
      // 去重
      if (processedMessages.has(msg.msgid)) continue;
      processedMessages.set(msg.msgid, Date.now());

      const incoming = toIncomingMessage(msg, account);
      if (!incoming) continue;

      log.info(
        `Received ${msg.msgtype} from ${msg.external_userid}: ${incoming.text?.substring(0, 50) ?? ""}`,
      );

      // 更新状态
      const state = accountStates.get(account.accountId);
      if (state) state.lastInboundAt = Date.now();

      // 转发给 OpenClaw（通过 runtime channel）
      const runtime = getRuntime();
      if (runtime?.channel?.handleIncomingMessage) {
        await runtime.channel.handleIncomingMessage(incoming);
      } else {
        log.warn("Runtime channel not available, message not forwarded");
      }
    }

    // 如果还有更多消息，继续拉取
    if (result.has_more === 1) {
      await pullAndProcessMessages(account);
    }
  } catch (err: any) {
    log.error(`Pull messages error: ${err.message}`);
    const state = accountStates.get(account.accountId);
    if (state) state.lastError = err.message;
  }
}

/**
 * HTTP 回调处理器
 * 处理 GET（URL 验证）和 POST（事件通知）请求
 */
export async function handleCallback(req: any, res: any): Promise<boolean> {
  const log = console;
  const query = parseQuery(req.url ?? "");
  const account = findAccount();

  if (!account) {
    log.error("No configured wechat-kf account found");
    res.statusCode = 500;
    res.end("No account configured");
    return true;
  }

  const { msg_signature, timestamp, nonce, echostr } = query;

  // GET 请求 — URL 验证
  if (req.method === "GET") {
    if (!msg_signature || !timestamp || !nonce || !echostr) {
      res.statusCode = 400;
      res.end("Missing parameters");
      return true;
    }

    if (
      !verifySignature(account.token, timestamp, nonce, echostr, msg_signature)
    ) {
      log.error("URL verification: signature mismatch");
      res.statusCode = 403;
      res.end("Signature mismatch");
      return true;
    }

    try {
      const decrypted = decryptMessage(
        account.encodingAESKey,
        echostr,
        account.corpId,
      );
      res.statusCode = 200;
      res.end(decrypted);
      log.info("URL verification succeeded");
    } catch (err: any) {
      log.error(`URL verification decrypt error: ${err.message}`);
      res.statusCode = 500;
      res.end("Decrypt error");
    }
    return true;
  }

  // POST 请求 — 事件通知
  if (req.method === "POST") {
    const body = await readBody(req);

    // 解析 XML
    const xmlData = parseCallbackXml(body);
    const encrypt = xmlData.Encrypt;

    if (!encrypt) {
      res.statusCode = 400;
      res.end("Missing Encrypt field");
      return true;
    }

    // 验证签名
    if (
      msg_signature &&
      !verifySignature(account.token, timestamp ?? "", nonce ?? "", encrypt, msg_signature)
    ) {
      log.error("Callback: signature mismatch");
      res.statusCode = 403;
      res.end("Signature mismatch");
      return true;
    }

    // 解密消息
    let decryptedXml: string;
    try {
      decryptedXml = decryptMessage(
        account.encodingAESKey,
        encrypt,
        account.corpId,
      );
    } catch (err: any) {
      log.error(`Callback decrypt error: ${err.message}`);
      res.statusCode = 500;
      res.end("Decrypt error");
      return true;
    }

    // 立即返回 success（微信要求 5 秒内响应）
    res.statusCode = 200;
    res.end("success");

    // 解析事件内容，提取回调 Token
    const eventData = parseCallbackXml(decryptedXml);
    const callbackToken = eventData.Token;

    log.debug(
      `Callback event: MsgType=${eventData.MsgType}, Event=${eventData.Event}`,
    );

    // 异步拉取消息
    pullAndProcessMessages(account, callbackToken).catch((err) => {
      log.error(`Async pull messages failed: ${err.message}`);
    });

    return true;
  }

  res.statusCode = 405;
  res.end("Method not allowed");
  return true;
}
