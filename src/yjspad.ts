import { MonacoBinding } from "y-monaco";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";
import type { editor } from "monaco-editor/esm/vs/editor/editor.api";

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
    readonly onInitialContentNeeded?: () => Promise<string>;
    readonly reconnectInterval?: number;
};

/** Browser client for YjsPad using Yjs CRDT. */
class YjsPad {
    private doc: Y.Doc;
    private provider: WebsocketProvider;
    private binding: MonacoBinding;
    private awareness: any;
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
        this.provider = new WebsocketProvider(wsUrl, this.getDocumentId(), this.doc);

        // Get awareness for cursor/selection sync
        this.awareness = this.provider.awareness;

        // Create Monaco binding for real-time collaboration
        this.binding = new MonacoBinding(
            yText,
            options.editor.getModel()!,
            new Set([options.editor]),
            this.awareness
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
    }

    private async handleInitialContent() {
        if (this.initialContentHandled) return;
        this.initialContentHandled = true;

        // Wait a bit for any existing content to sync
        await new Promise(resolve => setTimeout(resolve, 200));

        const yText = this.doc.getText("content");
        const currentContent = yText.toString();

        // Only load initial content if Yjs document is empty
        if (currentContent.length === 0 && this.options.onInitialContentNeeded) {
            try {
                const initialContent = await this.options.onInitialContentNeeded();
                if (initialContent && yText.toString().length === 0) {
                    // Use Yjs transaction to set initial content
                    this.doc.transact(() => {
                        yText.insert(0, initialContent);
                    });
                }
            } catch (error) {
                console.error("Failed to load initial content:", error);
            }
        }
    }


    // 辅助比较函数（浅比较 name + hue）
    private usersEqual(a: Record<string, UserInfo>, b: Record<string, UserInfo>): boolean {
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
        const localClientId = this.awareness.clientID; // number | undefined

        // states.forEach callback signature is (value, key)
        states.forEach((state: any, clientId: number) => {
            if (!state || !state.user) return;
            // 正确排除本地 client（clientId 是 number）
            if (localClientId !== undefined && clientId === localClientId) return;

            newUsers[String(clientId)] = {
                name: state.user.name || "Anonymous",
                hue: state.user.hue ?? 0,
            };
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
