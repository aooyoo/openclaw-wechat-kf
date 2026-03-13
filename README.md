# openclaw-wechat-kf

微信客服 Channel 插件 for [OpenClaw](https://github.com/openclaw/openclaw)。

让你的 OpenClaw AI 助手对接微信客服号消息接口。在微信中随时控制你的OpenClaw。

## 工作原理

```
微信用户发起消息
  → 微信服务器推送事件通知到你的回调 URL
    → 插件验证签名、解密消息
    → 调用 sync_msg 拉取消息内容
    → 转发给 OpenClaw AI 处理
      → AI 生成回复
        → 调用 send_msg 发送回复给用户
```

微信客服采用「回调通知 + 主动拉取」两步模式——回调只通知"有新消息了"，具体内容需要调用接口拉取。

## 前置条件

- [OpenClaw](https://github.com/openclaw/openclaw) 已安装并运行
- 企业已在 [微信客服管理后台](https://kf.weixin.qq.com/) 开通微信客服并开启 API
- 准备好以下凭据：
  - **企业ID** (Corp ID)
  - **微信客服 Secret**
  - **回调 Token**
  - **回调 EncodingAESKey**
  - **客服账号ID** (open_kfid)

## 安装

```bash
# 从 npm 安装
openclaw plugins install openclaw-wechat-kf

# 或本地安装（开发调试用）
git clone https://github.com/aooyoo/openclaw-wechat-kf.git
cd openclaw-wechat-kf
openclaw plugins install -l .
```

## 配置

### 快速配置

```bash
openclaw channels add --channel wechat-kf \
  --token "你的corpId:你的kfSecret:你的token:你的encodingAESKey:你的openKfId"
```

### 手动配置

在 OpenClaw 配置文件中添加：

```json
{
  "channels": {
    "wechat-kf": {
      "enabled": true,
      "corpId": "你的企业ID",
      "kfSecret": "你的微信客服Secret",
      "token": "回调Token",
      "encodingAESKey": "回调EncodingAESKey（43位）",
      "openKfId": "客服账号ID，如 wkxxxxxxxx"
    }
  }
}
```

### 多账号配置

```json
{
  "channels": {
    "wechat-kf": {
      "corpId": "公共企业ID",
      "kfSecret": "公共Secret",
      "token": "公共Token",
      "encodingAESKey": "公共AESKey",
      "accounts": {
        "售前客服": {
          "openKfId": "wk_presale_xxx"
        },
        "售后客服": {
          "openKfId": "wk_aftersale_xxx",
          "kfSecret": "单独的Secret（可选）"
        }
      }
    }
  }
}
```

### 回调 URL

在微信客服管理后台的「开发配置」中，将回调 URL 设置为：

```
https://你的域名/wechat-kf/callback
```

本地开发可以用 ngrok 暴露：

```bash
ngrok http 18789
# 然后用 ngrok 给的 https 地址 + /wechat-kf/callback
```

## 支持的消息类型

### 接收（用户 → AI）

| 类型 | 说明 |
|------|------|
| 文本 | 直接转发给 AI |
| 图片 | 识别为 `[图片]`，附带 media_id |
| 语音 | 识别为 `[语音]` |
| 视频 | 识别为 `[视频]` |
| 文件 | 识别为 `[文件]` |
| 位置 | 提取地名和地址 |
| 链接 | 提取标题和 URL |
| 小程序 | 提取标题 |

### 发送（AI → 用户）

| 类型 | 说明 |
|------|------|
| 文本 | 超过 2048 字节自动分块发送 |
| 图片 | 通过 media_id 发送 |
| 链接 | 图文链接消息 |

## 限制

这些是微信客服 API 本身的限制，非插件限制：

- 用户主动发消息后，**48 小时内**可回复，最多发送 **5 条**
- 用户再次发消息后，计数重置
- access_token 有效期 7200 秒（插件自动刷新）

## 项目结构

```
├── index.ts                   # 入口，注册 channel 和 HTTP 路由
├── openclaw.plugin.json       # 插件清单
├── package.json
├── tsconfig.json
└── src/
    ├── types.ts               # 类型定义
    ├── crypto.ts              # SHA1 签名 + AES-256-CBC 加解密
    ├── xml.ts                 # 轻量 XML 解析
    ├── runtime.ts             # 运行时单例
    ├── config.ts              # 多账号配置管理
    ├── api.ts                 # 微信客服 API（access_token / sync_msg / send_msg）
    ├── outbound.ts            # 出站消息处理
    ├── callback.ts            # 回调处理（签名验证 → 解密 → 拉取消息 → 去重）
    └── channel.ts             # ChannelPlugin 接口实现
```

## 开发

```bash
git clone https://github.com/你的用户名/openclaw-wechat-kf.git
cd openclaw-wechat-kf
npm install
npm run build

# 链接到本地 OpenClaw
openclaw plugins install -l .
```

## 相关文档

- [微信客服 API - 接收消息和事件](https://kf.weixin.qq.com/api/doc/path/94745)
- [微信客服 API - 发送消息](https://kf.weixin.qq.com/api/doc/path/94744)
- [微信客服 API - 获取 access_token](https://kf.weixin.qq.com/api/doc/path/93304)
- [OpenClaw 插件开发文档](https://docs.openclaw.ai/tools/plugin)

## License

MIT
