/**
 * 轻量 XML 解析工具
 * 只处理微信回调中的简单 XML 结构，无需第三方依赖
 */

/**
 * 从 XML 字符串中提取指定标签的文本内容
 * 支持 CDATA 和普通文本
 */
export function extractXmlField(xml: string, tagName: string): string | null {
  // 匹配 <tagName><![CDATA[content]]></tagName>
  const cdataRegex = new RegExp(
    `<${tagName}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tagName}>`,
  );
  const cdataMatch = xml.match(cdataRegex);
  if (cdataMatch) return cdataMatch[1];

  // 匹配 <tagName>content</tagName>
  const plainRegex = new RegExp(
    `<${tagName}>([\\s\\S]*?)</${tagName}>`,
  );
  const plainMatch = xml.match(plainRegex);
  if (plainMatch) return plainMatch[1];

  return null;
}

/**
 * 解析微信回调 XML 为键值对象
 */
export function parseCallbackXml(xml: string): Record<string, string> {
  const result: Record<string, string> = {};
  const fields = [
    "ToUserName",
    "CreateTime",
    "MsgType",
    "Event",
    "Token",
    "Encrypt",
  ];

  for (const field of fields) {
    const value = extractXmlField(xml, field);
    if (value !== null) {
      result[field] = value;
    }
  }

  return result;
}
