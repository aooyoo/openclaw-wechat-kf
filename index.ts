import type { OpenClawPluginApi } from "./src/types.js";

import { wechatKfPlugin } from "./src/channel.js";
import { handleCallback } from "./src/callback.js";
import { setRuntime } from "./src/runtime.js";

const plugin = {
  id: "wechat-kf",
  name: "微信客服",
  description: "微信客服消息通道插件，支持通过微信客服 API 接收和发送消息",
  configSchema: {
    type: "object" as const,
    additionalProperties: false,
    properties: {},
  },
  register(api: OpenClawPluginApi) {
    setRuntime(api.runtime);

    // 注册消息通道
    api.registerChannel({ plugin: wechatKfPlugin });

    // 注册 HTTP 回调路由（用于接收微信客服的事件通知）
    api.registerHttpRoute({
      path: "/wechat-kf/callback",
      auth: "plugin",
      handler: handleCallback,
    });

    api.runtime.log.info("微信客服插件已加载");
  },
};

export default plugin;

// Re-exports
export { wechatKfPlugin } from "./src/channel.js";
export { setRuntime, getRuntime } from "./src/runtime.js";
export * from "./src/types.js";
export * from "./src/api.js";
export * from "./src/config.js";
export * from "./src/outbound.js";
export * from "./src/crypto.js";
