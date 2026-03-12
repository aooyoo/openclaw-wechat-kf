import crypto from "node:crypto";

/**
 * SHA1 签名验证
 * 将 token, timestamp, nonce, encrypt 按字典序排序后拼接，做 SHA1 哈希
 */
export function generateSignature(
  token: string,
  timestamp: string,
  nonce: string,
  encrypt: string,
): string {
  const str = [token, timestamp, nonce, encrypt].sort().join("");
  return crypto.createHash("sha1").update(str).digest("hex");
}

/**
 * 验证签名
 */
export function verifySignature(
  token: string,
  timestamp: string,
  nonce: string,
  encrypt: string,
  expectedSignature: string,
): boolean {
  const signature = generateSignature(token, timestamp, nonce, encrypt);
  return signature === expectedSignature;
}

/**
 * 解密消息
 * EncodingAESKey 43字符 Base64 → 32 字节 AES Key
 * IV = AES Key 前 16 字节
 * AES-256-CBC 解密 → 去 PKCS7 填充 → 16字节随机前缀 + 4字节消息长度(BE) + 消息 + CorpID
 */
export function decryptMessage(
  encodingAESKey: string,
  encryptedMsg: string,
  corpId: string,
): string {
  const aesKey = Buffer.from(encodingAESKey + "=", "base64");
  const iv = aesKey.subarray(0, 16);

  const encrypted = Buffer.from(encryptedMsg, "base64");

  const decipher = crypto.createDecipheriv("aes-256-cbc", aesKey, iv);
  decipher.setAutoPadding(false);
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  // 去除 PKCS7 填充
  const padLen = decrypted[decrypted.length - 1];
  const unpadded = decrypted.subarray(0, decrypted.length - padLen);

  // 解析结构：16字节随机前缀 + 4字节消息长度(BE) + 消息内容 + CorpID
  const msgLength = unpadded.readUInt32BE(16);
  const message = unpadded.subarray(20, 20 + msgLength).toString("utf-8");
  const receivedCorpId = unpadded.subarray(20 + msgLength).toString("utf-8");

  if (receivedCorpId !== corpId) {
    throw new Error(
      `CorpID mismatch: expected ${corpId}, got ${receivedCorpId}`,
    );
  }

  return message;
}

/**
 * 加密消息（用于响应验证等场景）
 */
export function encryptMessage(
  encodingAESKey: string,
  message: string,
  corpId: string,
): string {
  const aesKey = Buffer.from(encodingAESKey + "=", "base64");
  const iv = aesKey.subarray(0, 16);

  // 16字节随机前缀
  const randomPrefix = crypto.randomBytes(16);

  // 消息内容
  const msgBuf = Buffer.from(message, "utf-8");

  // 4字节消息长度 (big-endian)
  const msgLenBuf = Buffer.alloc(4);
  msgLenBuf.writeUInt32BE(msgBuf.length);

  // CorpID
  const corpIdBuf = Buffer.from(corpId, "utf-8");

  // 拼接
  const plaintext = Buffer.concat([randomPrefix, msgLenBuf, msgBuf, corpIdBuf]);

  // PKCS7 填充到 32 字节块大小
  const blockSize = 32;
  const padLen = blockSize - (plaintext.length % blockSize);
  const padding = Buffer.alloc(padLen, padLen);
  const padded = Buffer.concat([plaintext, padding]);

  const cipher = crypto.createCipheriv("aes-256-cbc", aesKey, iv);
  cipher.setAutoPadding(false);
  const encrypted = Buffer.concat([cipher.update(padded), cipher.final()]);

  return encrypted.toString("base64");
}
