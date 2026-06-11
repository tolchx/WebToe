/**
 * WebToe AI Chat Panel
 *
 * A self-contained chat sidebar for WebToe that connects to the WebToe MCP Bridge.
 * Natural language → .webtoe.json networks.
 *
 * Copy-paste into WebToe's editor and instantiate with:
 *   new AiChatPanel(editorApp, { bridgeUrl: 'http://localhost:3001' })
 *
 * Keyboard shortcuts:
 *   Ctrl+Shift+A   — Toggle AI chat panel
 *   Enter          — Send message
 *   Shift+Enter    — New line
 */

export interface AiChatOptions {
  /** WebToe MCP Bridge URL */
  bridgeUrl?: string;
  /** Panel width in pixels */
  width?: number;
  /** Max messages to keep in history */
  maxHistory?: number;
  /** Custom system prompt prefix */
  systemPrompt?: string;
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'error';
  content: string;
  graph?: any; // optional .webtoe.json graph
}

export class AiChatPanel {
  private container!: HTMLDivElement;
  private messagesEl!: HTMLDivElement;
  private inputEl!: HTMLTextAreaElement;
  private sendBtn!: HTMLButtonElement;
  private toggleBtn!: HTMLButtonElement;
  private visible = false;
  private messages: ChatMessage[] = [];
  private loading = false;
  private bridgeUrl: string;
  private maxHistory: string;
  private modelProvider = 'bridge'; // 'bridge' | 'openai' | 'ollama'
  private modelKey = ''; // API key for OpenAI
  private ollamaUrl = 'http://127.0.0.1:11434';
  private recognition: any = null; // SpeechRecognition
  private listening = false;
  private savedHistory: ChatMessage[][] = [];

  constructor(
    private editorApp: any, // EditorApp instance
    private opts: AiChatOptions = {},
  ) {
    this.bridgeUrl = opts.bridgeUrl || 'http://localhost:3001';
    this.maxHistory = opts.maxHistory || 50;
    this.createUI();
    this.addSystemMessage('WebToe AI — describe what you want to build. I speak English and Spanish.');
  }

  // ─── UI Creation ────────────────────────────────────────────────────

  private createUI(): void {
    // Toggle button
    this.toggleBtn = document.createElement('button');
    this.toggleBtn.className = 'wt-ai-toggle';
    this.toggleBtn.textContent = '🤖 AI';
    this.toggleBtn.title = 'Toggle AI Assistant (Ctrl+Shift+A)';
    this.toggleBtn.addEventListener('click', () => this.toggle());

    // Panel container
    this.container = document.createElement('div');
    this.container.className = 'wt-ai-panel';
    this.container.style.cssText = `
      position: fixed; top: 0; right: -380px; width: ${this.opts.width || 360}px;
      height: 100vh; background: #1a1a2e; color: #e0e0e0;
      border-left: 2px solid #4a4a6a;
      display: flex; flex-direction: column;
      transition: right 0.3s ease;
      z-index: 1000; font-family: system-ui, sans-serif;
      box-shadow: -4px 0 20px rgba(0,0,0,0.5);
    `;

    // Header with model selector
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 8px 12px; background: #16213e;
      border-bottom: 1px solid #4a4a6a;
      display: flex; justify-content: space-between; align-items: center; gap: 6px;
    `;
    header.innerHTML = `<span style="font-weight:600;font-size:13px;">🤖 WebToe AI</span>`;

    const modelSel = document.createElement('select');
    modelSel.style.cssText = 'background:#0f3460;color:#e0e0e0;border:1px solid #4a4a6a;border-radius:4px;padding:2px 6px;font-size:11px;';
    modelSel.innerHTML = '<option value="bridge">Bridge MCP</option><option value="ollama">Ollama local</option>';
    modelSel.addEventListener('change', () => { this.modelProvider = modelSel.value; });
    header.appendChild(modelSel);

    const micBtn = document.createElement('button');
    micBtn.textContent = '🎤';
    micBtn.title = 'Voice input (Speech-to-Text)';
    micBtn.style.cssText = 'background:none;border:1px solid #4a4a6a;color:#888;border-radius:4px;cursor:pointer;font-size:14px;padding:2px 6px;';
    micBtn.addEventListener('click', () => this.toggleVoice(micBtn));
    header.appendChild(micBtn);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'background:none;border:none;color:#888;cursor:pointer;font-size:18px;';
    closeBtn.addEventListener('click', () => this.hide());
    header.appendChild(closeBtn);
    this.container.appendChild(header);

    // Messages area
    this.messagesEl = document.createElement('div');
    this.messagesEl.style.cssText = `
      flex: 1; overflow-y: auto; padding: 12px;
      display: flex; flex-direction: column; gap: 8px;
    `;
    this.container.appendChild(this.messagesEl);

    // Input area
    const inputArea = document.createElement('div');
    inputArea.style.cssText = `
      padding: 8px 12px; border-top: 1px solid #4a4a6a;
      display: flex; gap: 8px; align-items: flex-end;
    `;

    this.inputEl = document.createElement('textarea');
    this.inputEl.placeholder = 'Describe your patch...';
    this.inputEl.rows = 2;
    this.inputEl.style.cssText = `
      flex: 1; background: #0f3460; color: #e0e0e0;
      border: 1px solid #4a4a6a; border-radius: 6px;
      padding: 8px 12px; font-size: 13px; font-family: inherit;
      resize: none; outline: none;
    `;
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(); }
    });
    inputArea.appendChild(this.inputEl);

    this.sendBtn = document.createElement('button');
    this.sendBtn.textContent = '→';
    this.sendBtn.style.cssText = `
      background: #e94560; color: white; border: none;
      border-radius: 6px; padding: 8px 16px; cursor: pointer;
      font-size: 16px; font-weight: bold;
    `;
    this.sendBtn.addEventListener('click', () => this.send());
    inputArea.appendChild(this.sendBtn);
    this.container.appendChild(inputArea);

    // Add to page
    document.body.appendChild(this.container);
    document.body.appendChild(this.toggleBtn);

    // Keyboard shortcut
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'A') { e.preventDefault(); this.toggle(); }
    });
  }

  // ─── Chat Logic ─────────────────────────────────────────────────────

  toggle(): void {
    this.visible ? this.hide() : this.show();
  }

  show(): void {
    this.visible = true;
    this.container.style.right = '0';
    this.inputEl.focus();
  }

  hide(): void {
    this.visible = false;
    this.container.style.right = `-${this.opts.width || 360}px`;
  }

  // Speech-to-Text voice input
  private toggleVoice(btn: HTMLButtonElement): void {
    if (this.listening) {
      this.listening = false;
      btn.style.color = '#888';
      btn.textContent = '🎤';
      this.recognition?.stop();
      return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      this.addSystemMessage('⚠️ Speech recognition not supported in this browser.');
      return;
    }
    this.recognition = new SpeechRecognition();
    this.recognition.lang = 'es-ES'; // Spanish + English
    this.recognition.continuous = false;
    this.recognition.interimResults = false;
    this.recognition.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      this.inputEl.value = transcript;
      this.listening = false;
      btn.style.color = '#888';
      btn.textContent = '🎤';
      this.send();
    };
    this.recognition.onerror = () => {
      this.listening = false;
      btn.style.color = '#888';
      btn.textContent = '🎤';
    };
    this.listening = true;
    btn.style.color = '#e94560';
    btn.textContent = '🔴';
    this.recognition.start();
  }

  // Persist chat history to localStorage

  private addSystemMessage(content: string): void {
    this.addMessage({ role: 'system', content });
  }

  private addMessage(msg: ChatMessage): void {
    this.messages.push(msg);
    if (this.messages.length > this.maxHistory) this.messages.shift();
    this.renderMessage(msg);
  }

  private renderMessage(msg: ChatMessage): void {
    const el = document.createElement('div');
    el.style.cssText = `
      padding: 8px 12px; border-radius: 8px; font-size: 13px;
      line-height: 1.5; max-width: 85%;
      align-self: ${msg.role === 'user' ? 'flex-end' : 'flex-start'};
      background: ${msg.role === 'user' ? '#0f3460' : msg.role === 'system' ? '#1a1a3e' : msg.role === 'error' ? '#3e1a1a' : '#16213e'};
      border: 1px solid ${msg.role === 'error' ? '#6a3a3a' : '#4a4a6a'};
    `;

    // Message text
    const text = document.createElement('div');
    text.style.whiteSpace = 'pre-wrap';
    text.textContent = msg.content;
    el.appendChild(text);

    // "Create Network" button if graph data is present
    if (msg.graph && this.editorApp) {
      const btn = document.createElement('button');
      btn.textContent = '🔄 Create Network';
      btn.style.cssText = `
        margin-top: 8px; background: #e94560; color: white;
        border: none; border-radius: 4px; padding: 6px 12px;
        cursor: pointer; font-size: 12px; width: 100%;
      `;
      btn.addEventListener('click', () => this.loadGraph(msg.graph));
      el.appendChild(btn);
    }

    this.messagesEl.appendChild(el);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  private async send(): Promise<void> {
    const text = this.inputEl.value.trim();
    if (!text || this.loading) return;

    this.inputEl.value = '';
    this.addMessage({ role: 'user', content: text });
    this.loading = true;
    this.sendBtn.textContent = '···';
    this.sendBtn.disabled = true;

    try {
      const response = await fetch(`${this.bridgeUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text }),
      });

      if (!response.ok) {
        const err = await response.json();
        this.addMessage({ role: 'error', content: `Error: ${err.error || response.statusText}` });
        return;
      }

      const data = await response.json();

      // Build response text
      const summary = data.summary;
      let msg = '';
      if (summary.operators?.length) {
        msg += `**${summary.nodes} nodes** created:\n`;
        msg += summary.operators.map((o: string, i: number) =>
          `  ${i + 1}. ${o}`
        ).join('\n');
        msg += `\n\n${summary.wires} connections wired.`;
      } else {
        msg = data.message || 'Network created.';
      }

      if (summary.templates?.length) {
        msg += `\n\n📋 Templates available: ${summary.templates.join(', ')}`;
      }
      if (summary.recipes?.length) {
        msg += `\n\n🧪 Recipes available: ${summary.recipes.join(', ')}`;
      }

      this.addMessage({
        role: 'assistant',
        content: msg,
        graph: data.graph,
      });
    } catch (e: any) {
      this.addMessage({
        role: 'error',
        content: `Connection error: ${e.message}. Is the bridge running on ${this.bridgeUrl}?`,
      });
    } finally {
      this.loading = false;
      this.sendBtn.textContent = '→';
      this.sendBtn.disabled = false;
      this.inputEl.focus();
    }
  }

  private loadGraph(graph: any): void {
    try {
      // Use EditorApp's adoptGraph method
      if (this.editorApp?.adoptGraph) {
        this.editorApp.adoptGraph(graph, 'ai-generated');
        this.addSystemMessage('✅ Network loaded into editor.');
      } else {
        // Fallback: download as file
        const blob = new Blob([JSON.stringify(graph, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'ai-network.webtoe.json';
        a.click();
        URL.revokeObjectURL(url);
        this.addSystemMessage('✅ Downloaded as ai-network.webtoe.json. Drag/folder-pick to load.');
      }
    } catch (e: any) {
      this.addMessage({ role: 'error', content: `Load error: ${e.message}` });
    }
  }
}
