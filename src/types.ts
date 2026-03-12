// ============================================================
// OpenClaw Plugin SDK 类型声明
// ============================================================

export interface OpenClawConfig {
  channels: Record<string, any>;
  [key: string]: any;
}

export interface PluginRuntime {
  getConfig(): OpenClawConfig;
  setConfig(cfg: OpenClawConfig): Promise<void>;
  getDataDir(): string;
  channel: {
    handleIncomingMessage(msg: IncomingMessage): Promise<void>;
  };
  log: {
    info(msg: string, ...args: any[]): void;
    warn(msg: string, ...args: any[]): void;
    error(msg: string, ...args: any[]): void;
    debug(msg: string, ...args: any[]): void;
  };
}

export interface OpenClawPluginApi {
  runtime: PluginRuntime;
  registerChannel(opts: { plugin: any }): void;
  registerHttpRoute(opts: HttpRouteConfig): void;
}

export interface HttpRouteConfig {
  path: string;
  auth: "plugin" | "gateway";
  match?: "exact" | "prefix";
  handler: (req: any, res: any) => Promise<boolean>;
}

export interface IncomingMessage {
  channel: string;
  accountId: string;
  senderId: string;
  senderName?: string;
  text?: string;
  mediaUrl?: string;
  mediaType?: string;
  messageId?: string;
  replyToId?: string;
  chatType: "direct" | "group";
  raw?: any;
}

// ============================================================
// 微信客服 API 类型
// ============================================================

/** 微信客服账号配置 */
export interface WechatKfAccountConfig {
  enabled?: boolean;
  corpId?: string;
  kfSecret?: string;
  token?: string;
  encodingAESKey?: string;
  openKfId?: string;
}

/** 解析后的完整账号配置 */
export interface ResolvedWechatKfAccount {
  accountId: string;
  enabled: boolean;
  corpId: string;
  kfSecret: string;
  token: string;
  encodingAESKey: string;
  openKfId: string;
}

/** 微信客服频道配置（支持多账号） */
export interface WechatKfChannelConfig extends WechatKfAccountConfig {
  accounts?: Record<string, WechatKfAccountConfig>;
}

// ============================================================
// 微信客服 API 响应类型
// ============================================================

/** access_token 响应 */
export interface AccessTokenResponse {
  errcode?: number;
  errmsg?: string;
  access_token: string;
  expires_in: number;
}

/** sync_msg 请求参数 */
export interface SyncMsgRequest {
  cursor?: string;
  token?: string;
  limit?: number;
  voice_format?: number;
}

/** sync_msg 响应 */
export interface SyncMsgResponse {
  errcode?: number;
  errmsg?: string;
  next_cursor: string;
  has_more: number;
  msg_list: KfMessage[];
}

/** 微信客服消息 */
export interface KfMessage {
  msgid: string;
  open_kfid: string;
  external_userid: string;
  send_time: number;
  origin: number; // 3=客户发送, 4=系统推送, 5=客服回复
  servicer_userid?: string;
  msgtype: string;
  text?: { content: string; menu_id?: string };
  image?: { media_id: string };
  voice?: { media_id: string };
  video?: { media_id: string };
  file?: { media_id: string };
  location?: {
    latitude: number;
    longitude: number;
    name: string;
    address: string;
  };
  link?: {
    title: string;
    desc: string;
    url: string;
    pic_url: string;
  };
  business_card?: { userid: string };
  miniprogram?: {
    title: string;
    appid: string;
    pagepath: string;
    thumb_media_id: string;
  };
  event?: KfEvent;
}

/** 微信客服事件 */
export interface KfEvent {
  event_type: string;
  open_kfid?: string;
  external_userid?: string;
  scene?: string;
  scene_param?: string;
  welcome_code?: string;
  wechat_channels?: {
    nickname: string;
    scene: number;
  };
  fail_msgid?: string;
  fail_type?: number;
  servicer_userid?: string;
  status?: number;
  change_type?: number;
  old_servicer_userid?: string;
  new_servicer_userid?: string;
  msg_code?: string;
  recall_msgid?: string;
}

/** send_msg 响应 */
export interface SendMsgResponse {
  errcode: number;
  errmsg: string;
  msgid?: string;
}

/** 回调事件 XML 解析结果 */
export interface CallbackEvent {
  ToUserName: string;
  CreateTime: string;
  MsgType: string;
  Event: string;
  Token: string;
}

/** 运行时状态 */
export interface AccountRuntimeState {
  accountId: string;
  running: boolean;
  connected: boolean;
  lastError?: string;
  lastInboundAt?: number;
  lastOutboundAt?: number;
  cursor?: string;
}
