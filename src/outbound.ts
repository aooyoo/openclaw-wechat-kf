import type { ResolvedWechatKfAccount, SendMsgResponse } from "./types.js";
import { sendMessage, sendTextMessage } from "./api.js";
import { getRuntime } from "./runtime.js";

/** 文本消息最大字节数 */
const TEXT_MAX_BYTES = 2048;

/**
 * 按字节限制分割文本
 * 优先在换行符处断开，其次在空格处断开
 */
export function chunkText(text: string, maxBytes: number = TEXT_MAX_BYTES): string[] {
  const totalBytes = Buffer.byteLength(text, "utf-8");
  if (totalBytes <= maxBytes) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    // 按字符逐步查找不超过 maxBytes 的最大子串
    let end = remaining.length;
    while (Buffer.byteLength(remaining.substring(0, end), "utf-8") > maxBytes) {
      end = Math.floor(end * 0.8); // 快速缩减
    }
    // 精确调整
    while (
      end < remaining.length &&
      Buffer.byteLength(remaining.substring(0, end + 1), "utf-8") <= maxBytes
    ) {
      end++;
    }

    let chunk = remaining.substring(0, end);

    // 尝试在换行符或空格处断开
    if (end < remaining.length) {
      const lastNewline = chunk.lastIndexOf("\n");
      const lastSpace = chunk.lastIndexOf(" ");
      const breakAt = lastNewline > chunk.length * 0.3
        ? lastNewline + 1
        : lastSpace > chunk.length * 0.3
          ? lastSpace + 1
          : end;
      chunk = remaining.substring(0, breakAt);
    }

    chunks.push(chunk);
    remaining = remaining.substring(chunk.length);
  }

  return chunks;
}

/**
 * 发送文本消息（自动分块）
 */
export async function sendText(
  account: ResolvedWechatKfAccount,
  touser: string,
  text: string,
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const log = getRuntime().log;

  try {
    const chunks = chunkText(text);

    let lastMsgId: string | undefined;
    for (const chunk of chunks) {
      const result = await sendTextMessage(account, touser, chunk);
      if (result.errcode !== 0) {
        log.error(`Send text failed: ${result.errcode} ${result.errmsg}`);
        return { ok: false, error: `${result.errcode} ${result.errmsg}` };
      }
      lastMsgId = result.msgid;
    }

    return { ok: true, messageId: lastMsgId };
  } catch (err: any) {
    log.error(`Send text error: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

/**
 * 发送图片消息
 */
export async function sendImage(
  account: ResolvedWechatKfAccount,
  touser: string,
  mediaId: string,
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const log = getRuntime().log;

  try {
    const result = await sendMessage(
      account,
      touser,
      account.openKfId,
      "image",
      { media_id: mediaId },
    );

    if (result.errcode !== 0) {
      return { ok: false, error: `${result.errcode} ${result.errmsg}` };
    }
    return { ok: true, messageId: result.msgid };
  } catch (err: any) {
    log.error(`Send image error: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

/**
 * 发送链接消息
 */
export async function sendLink(
  account: ResolvedWechatKfAccount,
  touser: string,
  title: string,
  description: string,
  url: string,
  thumbMediaId: string,
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const log = getRuntime().log;

  try {
    const result = await sendMessage(
      account,
      touser,
      account.openKfId,
      "link",
      { title, desc: description, url, thumb_media_id: thumbMediaId },
    );

    if (result.errcode !== 0) {
      return { ok: false, error: `${result.errcode} ${result.errmsg}` };
    }
    return { ok: true, messageId: result.msgid };
  } catch (err: any) {
    log.error(`Send link error: ${err.message}`);
    return { ok: false, error: err.message };
  }
}
