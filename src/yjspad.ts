import type { editor } from "monaco-editor/esm/vs/editor/editor.api";
import { MonacoBinding } from "y-monaco";
import { Awareness } from "y-protocols/awareness";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";

/** A user currently editing the document. */
export type UserInfo = {
  readonly name: string;
  readonly hue: number;
};

/** Options passed in to the YjsPad constructor. */
export type YjsPadOptions = {
  readonly uri: string;
  readonly editor: editor.IStandaloneCodeEditor;
  readonly onConnected?: () => void;
  readonly onDisconnected?: () => void;
  readonly onDesynchronized?: () => void;
  readonly onChangeLanguage?: (language: string) => void;
  readonly onChangeUsers?: (users: Record<string, UserInfo>) => void;
  readonly onInitialContentNeeded?: () => Promise<{
    content: string;
    language?: string;
  }>;
  readonly checkRoomExists?: () => Promise<boolean>;
  readonly reconnectInterval?: number;
};

/** Browser client for YjsPad using Yjs CRDT. */
class YjsPad {
  private doc: Y.Doc;
  private provider: WebsocketProvider;
  private binding: MonacoBinding;
  private awareness: Awareness;
  private languageText: Y.Text;
  private users: Record<string, UserInfo> = {};
  private initialContentHandled = false;

  constructor(readonly options: YjsPadOptions) {
    // Create Yjs document
    this.doc = new Y.Doc();

    // Get shared text type for document content
    const yText = this.doc.getText("content");

    // Get shared text type for language
    this.languageText = this.doc.getText("language");

    // Create WebSocket provider
    const wsUrl = this.getWebSocketUrl();
    this.provider = new WebsocketProvider(
      wsUrl,
      this.getDocumentId(),
      this.doc,
    );

    // Get awareness for cursor/selection sync
    this.awareness = this.provider.awareness;

    // Create Monaco binding for real-time collaboration
    this.binding = new MonacoBinding(
      yText,
      options.editor.getModel()!,
      new Set([options.editor]),
      this.awareness,
    );

    // Set up event listeners
    this.setupEventListeners();
  }

  private getWebSocketUrl(): string {
    const url = new URL(this.options.uri);
    // Convert HTTP to WebSocket protocol
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = "/api/socket";
    return url.toString();
  }

  private getDocumentId(): string {
    // Extract document ID from the URI
    const match = this.options.uri.match(/\/api\/socket\/([^\/]+)/);
    return match ? match[1] : "default";
  }

  private setupEventListeners() {
    // Connection status events
    this.provider.on("status", (event: any) => {
      if (event.status === "connected") {
        this.options.onConnected?.();
        // Handle initial content after connection
        this.handleInitialContent();
        // Check for existing language when connected
        const currentLanguage = this.languageText.toString();
        if (currentLanguage) {
          this.options.onChangeLanguage?.(currentLanguage);
        }
      } else if (event.status === "disconnected") {
        this.options.onDisconnected?.();
      }
    });

    // Language change events
    this.languageText.observe(() => {
      const language = this.languageText.toString();
      if (language) {
        this.options.onChangeLanguage?.(language);
      }
    });

    // User awareness events (cursors, selections, user info)
    this.awareness.on("change", () => {
      this.updateUsers();
    });

    // Error handling
    this.provider.on("connection-error", () => {
      this.options.onDesynchronized?.();
    });

    window.addEventListener("beforeunload", () => {
      try {
        this.awareness.setLocalState(null);
      } catch (e) {
        null;
      }
    });
  }

  private async handleInitialContent() {
    if (this.initialContentHandled) return;
    this.initialContentHandled = true;

    const yText = this.doc.getText("content");

    // 首先检查房间是否已存在（即是否有其他用户在编辑）
    let roomExists = false;
    if (this.options.checkRoomExists) {
      try {
        roomExists = await this.options.checkRoomExists();
      } catch (error) {
        console.warn("Failed to check room existence:", error);
        // 如果检查失败，回退到原来的延迟策略
        roomExists = false;
      }
    }

    if (roomExists) {
      // 如果房间已存在，优先使用 Yjs 数据，等待同步
      const waitForSync = async (maxWaitTime = 2000) => {
        if (yText.toString().length > 0) {
          return; // 已有内容
        }

        let waitTime = 0;
        const interval = 100;

        return new Promise<void>((resolve) => {
          const check = () => {
            const content = yText.toString();
            if (content.length > 0 || waitTime >= maxWaitTime) {
              resolve();
            } else {
              waitTime += interval;
              setTimeout(check, interval);
            }
          };
          check();
        });
      };

      await waitForSync();
      console.log("Room exists, used Yjs synchronized content");
    } else {
      // 如果房间不存在，使用后端内容作为初始内容
      if (
        this.options.onInitialContentNeeded &&
        yText.toString().length === 0
      ) {
        try {
          const initialData = await this.options.onInitialContentNeeded();
          // 再次检查文档是否仍然为空，避免在请求过程中内容已被同步
          if (initialData?.content && yText.toString().length === 0) {
            // 使用Yjs事务设置初始内容
            this.doc.transact(() => {
              yText.insert(0, initialData.content);
            });
            console.log("Room doesn't exist, loaded content from backend");
          }

          // 同步语言信息到 Yjs 文档
          if (
            initialData?.language &&
            this.languageText.toString().length === 0
          ) {
            this.doc.transact(() => {
              this.languageText.insert(0, initialData.language!);
            });
            console.log("Synchronized language to Yjs:", initialData.language);
          }
        } catch (error) {
          console.error("Failed to load initial content:", error);
        }
      }
    }

    // 无论房间是否存在，都要检查和同步语言信息
    // 这样确保第二个用户也能获取到正确的语言
    if (this.languageText.toString().length === 0) {
      // 如果 Yjs 文档中没有语言信息，尝试从当前编辑器状态获取
      // 这个信息可能已经在 onInitialContentNeeded 回调中被设置
      const currentLanguage = this.options.editor.getModel()?.getLanguageId();
      if (currentLanguage && currentLanguage !== "plaintext") {
        this.doc.transact(() => {
          this.languageText.insert(0, currentLanguage);
        });
      }
    }
  }

  // 辅助比较函数（浅比较 name + hue）
  private usersEqual(
    a: Record<string, UserInfo>,
    b: Record<string, UserInfo>,
  ): boolean {
    const ak = Object.keys(a);
    const bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    for (const k of ak) {
      const va = a[k];
      const vb = b[k];
      if (!vb || va.name !== vb.name || va.hue !== vb.hue) return false;
    }
    return true;
  }

  private updateUsers() {
    const states = this.awareness.getStates(); // Map<number, any>
    const newUsers: Record<string, UserInfo> = {};
    const usersByIdentity: Map<
      string,
      { clientId: number; userInfo: UserInfo }
    > = new Map();
    const localClientId = this.awareness.clientID; // number | undefined

    // 第一步：收集所有远程用户，按身份去重
    states.forEach((state: any, clientId: number) => {
      if (!state || !state.user) return;
      if (localClientId !== undefined && clientId === localClientId) return;

      const userInfo: UserInfo = {
        name: state.user.name || "Anonymous",
        hue: state.user.hue ?? 0,
      };

      // 使用用户名+颜色作为唯一标识，去重相同用户的多个连接
      const userIdentity = `${userInfo.name}-${userInfo.hue}`;

      // 如果已存在相同身份的用户，保留较新的（较大的 clientId）
      const existing = usersByIdentity.get(userIdentity);
      if (!existing || clientId > existing.clientId) {
        usersByIdentity.set(userIdentity, { clientId, userInfo });
      }
    });

    // 第二步：将去重后的用户添加到结果中
    usersByIdentity.forEach(({ clientId, userInfo }) => {
      newUsers[String(clientId)] = userInfo;
    });

    if (!this.usersEqual(this.users, newUsers)) {
      this.users = newUsers;
      this.options.onChangeUsers?.(this.users);
    }
  }

  /** Destroy this YjsPad instance and close connections. */
  dispose() {
    this.binding.destroy();
    this.provider.destroy();
    this.doc.destroy();
  }

  /** Try to set the language of the editor, if connected. */
  setLanguage(language: string): boolean {
    if (this.provider.wsconnected) {
      this.doc.transact(() => {
        this.languageText.delete(0, this.languageText.length);
        this.languageText.insert(0, language);
      });
      return true;
    }
    return false;
  }

  /** Set the user's information. */
  setInfo(info: UserInfo) {
    this.awareness.setLocalStateField("user", {
      name: info.name,
      hue: info.hue,
    });
  }

  /** Get connection status. */
  isConnected(): boolean {
    return this.provider.wsconnected;
  }

  /** Get current document text. */
  getText(): string {
    return this.doc.getText("content").toString();
  }

  /** Get current language. */
  getLanguage(): string {
    return this.languageText.toString();
  }
}

export default YjsPad;
