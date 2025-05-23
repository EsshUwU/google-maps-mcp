/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable
import hljs from 'highlight.js';
import {html, LitElement} from 'lit';
import {customElement, query, state} from 'lit/decorators.js';
import {classMap} from 'lit/directives/class-map.js';
import {Marked} from 'marked';
import {markedHighlight} from 'marked-highlight';

import {MapParams} from './mcp_maps_server'; // MapParams now includes zoom_adjust

/** Markdown formatting function with syntax hilighting */
export const marked = new Marked(
  markedHighlight({
    async: true,
    emptyLangClass: 'hljs',
    langPrefix: 'hljs language-',
    highlight(code, lang, info) {
      const language = hljs.getLanguage(lang) ? lang : 'plaintext';
      return hljs.highlight(code, {language}).value;
    },
  }),
);

const ICON_BUSY = html`<svg
  class="rotating"
  xmlns="http://www.w3.org/2000/svg"
  height="24px"
  viewBox="0 -960 960 960"
  width="24px"
  fill="currentColor">
  <path
    d="M480-80q-82 0-155-31.5t-127.5-86Q143-252 111.5-325T80-480q0-83 31.5-155.5t86-127Q252-817 325-848.5T480-880q17 0 28.5 11.5T520-840q0 17-11.5 28.5T480-800q-133 0-226.5 93.5T160-480q0 133 93.5 226.5T480-160q133 0 226.5-93.5T800-480q0-17 11.5-28.5T840-520q17 0 28.5 11.5T880-480q0 82-31.5 155t-86 127.5q-54.5 54.5-127 86T480-80Z" />
</svg>`;

/**
 * Chat state enum to manage the current state of the chat interface.
 */
export enum ChatState {
  IDLE,
  GENERATING,
  THINKING,
  EXECUTING,
}

/**
 * Chat tab enum to manage the current selected tab in the chat interface.
 */
enum ChatTab {
  GEMINI,
}

// Internal state for current map display parameters
interface MapDisplayState {
  queryType: 'place' | 'search' | 'directions' | 'none';
  queryValue?: string; // For place & search
  origin?: string; // For directions
  destination?: string; // For directions
  zoom: number;
}

/**
 * Playground component for p5js.
 */
@customElement('gdm-playground')
export class Playground extends LitElement {
  @query('#anchor') anchor?: HTMLDivElement;

  @state() chatState = ChatState.IDLE;
  @state() isRunning = true;
  @state() selectedChatTab = ChatTab.GEMINI;
  @state() inputMessage = '';
  @state() messages: HTMLElement[] = [];

  // Storing current map parameters internally
  @state() private mapDisplayParams: MapDisplayState = {
    queryType: 'none', // Start with none, initial renderMapQuery({}) will set to World
    queryValue: undefined, 
    zoom: 3, // Default initial zoom for the world view
  };

  private readonly previewFrame: HTMLIFrameElement =
    document.createElement('iframe');
  
  private readonly MAPS_API_KEY = 'AIzaSyC7c1m_Jyz3uw6lbIQUNuH3e6o0NKc_8hk'; // Keep your API key secure


  sendMessageHandler?: CallableFunction;

  constructor() {
    super();
    this.previewFrame.classList.add('preview-iframe');
    this.previewFrame.setAttribute('allowTransparency', 'true');
    this.previewFrame.setAttribute('allowfullscreen', 'true');
    this.previewFrame.setAttribute('loading', 'lazy');
    this.previewFrame.setAttribute(
      'referrerpolicy',
      'no-referrer-when-downgrade',
    );
  }

  /** Disable shadow DOM */
  createRenderRoot() {
    return this;
  }

  setChatState(state: ChatState) {
    this.chatState = state;
  }

  renderMapQuery(newParams: Partial<MapParams>) {
    let targetZoom = this.mapDisplayParams.zoom;

    if (newParams.zoom_adjust !== undefined) {
      targetZoom = Math.max(1, Math.min(21, this.mapDisplayParams.zoom + newParams.zoom_adjust));
      this.mapDisplayParams.zoom = targetZoom; // Update zoom immediately if adjusting
    }

    // Handle new navigation queries, these take precedence for context
    if (newParams.location) {
      this.mapDisplayParams = {
        queryType: 'place',
        queryValue: newParams.location,
        zoom: newParams.zoom_adjust === undefined ? 5 : targetZoom,
        origin: undefined,
        destination: undefined,
      };
    } else if (newParams.search) {
      this.mapDisplayParams = {
        queryType: 'search',
        queryValue: newParams.search,
        zoom: newParams.zoom_adjust === undefined ? 14 : targetZoom,
        origin: undefined,
        destination: undefined,
      };
    } else if (newParams.origin && newParams.destination) {
      this.mapDisplayParams = {
        queryType: 'directions',
        origin: newParams.origin,
        destination: newParams.destination,
        zoom: newParams.zoom_adjust === undefined ? 8 : targetZoom,
        queryValue: undefined,
      };
    } else if (newParams.zoom_adjust !== undefined) {
      if (this.mapDisplayParams.queryType === 'none') {
        this.mapDisplayParams.queryType = 'place';
        this.mapDisplayParams.queryValue = 'World'; 
      }
    } else if (Object.keys(newParams).length === 0 && this.mapDisplayParams.queryType === 'none') {
        this.mapDisplayParams = { queryType: 'place', queryValue: 'World', zoom: 3, origin: undefined, destination: undefined};
    }

    let src = '';
    const currentContext = this.mapDisplayParams;

    switch (currentContext.queryType) {
      case 'place':
        if (currentContext.queryValue) {
          src = `https://www.google.com/maps/embed/v1/place?key=${this.MAPS_API_KEY}&q=${encodeURIComponent(currentContext.queryValue)}&zoom=${currentContext.zoom}`;
        }
        break;
      case 'search':
        if (currentContext.queryValue) {
          src = `https://www.google.com/maps/embed/v1/search?key=${this.MAPS_API_KEY}&q=${encodeURIComponent(currentContext.queryValue)}&zoom=${currentContext.zoom}`;
        }
        break;
      case 'directions':
        if (currentContext.origin && currentContext.destination) {
          src = `https://www.google.com/maps/embed/v1/directions?key=${this.MAPS_API_KEY}&origin=${encodeURIComponent(currentContext.origin)}&destination=${encodeURIComponent(currentContext.destination)}&zoom=${currentContext.zoom}`;
        }
        break;
      default: 
        if (!this.previewFrame.src || (currentContext.queryType === 'none' && !currentContext.queryValue)) { 
             src = `https://www.google.com/maps/embed/v1/place?key=${this.MAPS_API_KEY}&q=${encodeURIComponent(currentContext.queryValue || 'World')}&zoom=${currentContext.zoom}`;
        }
        break;
    }

    if (src) {
      this.previewFrame.src = src;
    }
    (this as LitElement).requestUpdate();
  }

  setInputField(message: string) {
    this.inputMessage = message.trim();
  }

  addMessage(role: string, message: string) {
    const div = document.createElement('div');
    // Base card classes + flex for layout + max-width & break-words from old .turn
    div.className = "turn p-3 rounded-lg shadow-sm mb-2 flex flex-col max-w-[85%] break-words"; 

    const roleNormalized = role.trim().toLowerCase();
    // Not adding .role-${roleNormalized} class anymore, specific styles are applied directly.

    // Apply role-specific background, text colors, and alignment
    switch (roleNormalized) {
      case 'user':
        div.classList.add('bg-primary', 'text-primary-foreground', 'self-end', 'rounded-bl-none');
        break;
      case 'assistant': 
        div.classList.add('bg-muted', 'text-muted-foreground', 'self-start', 'rounded-br-none');
        break;
      case 'error':
        div.classList.add('bg-destructive', 'text-destructive-foreground', 'self-start', 'rounded-br-none');
        break;
      case 'system-ask': 
        div.classList.add('bg-secondary', 'text-secondary-foreground', 'self-center', 'text-center', 'rounded-md'); 
        break;
      default: // Fallback for any other roles
        div.classList.add('bg-card', 'text-card-foreground', 'self-start', 'rounded-br-none');
        break;
    }

    const thinkingDetails = document.createElement('details');
    // Styling for thinking details using Tailwind classes
    thinkingDetails.className = "thinking hidden text-sm text-muted-foreground p-2 mt-2 bg-card rounded"; 
    thinkingDetails.setAttribute('open', 'true'); 
    const summary = document.createElement('summary');
    summary.textContent = 'Thinking...'; 
    const thinkingContent = document.createElement('div'); 
    thinkingDetails.append(summary); 
    thinkingDetails.append(thinkingContent);
    div.append(thinkingDetails);

    const text = document.createElement('div');
    text.className = 'text'; 
    text.textContent = message; 
    div.append(text);

    this.messages = [...this.messages, div];
    (this as LitElement).requestUpdate();

    this.scrollToTheEnd();
    return {thinking: thinkingContent, text};
  }

  scrollToTheEnd() {
    if (!this.anchor) return;
    this.anchor.scrollIntoView({
      behavior: 'auto', 
      block: 'end',
    });
  }

  async sendMessageAction(message?: string, role?: string) {
    if (this.chatState !== ChatState.IDLE) return;
    this.chatState = ChatState.GENERATING;
    let msg = '';
    if (message) {
      msg = message.trim();
    } else {
      msg = this.inputMessage.trim();
      this.inputMessage = '';
    }
    if (msg.length === 0) {
      this.chatState = ChatState.IDLE;
      return;
    }
    const msgRole = role ? role.toLowerCase() : 'user';
    if (msgRole === 'user' && msg) {
      this.addMessage(msgRole, msg);
    }
    if (this.sendMessageHandler) {
      await this.sendMessageHandler(msg, msgRole);
    }
  }

  private async inputKeyDownAction(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      this.sendMessageAction();
    }
  }

  render() {
    // Classes for shadcn-like Tabs styling
    const tabsListClasses = "inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground";
    const tabsTriggerClasses = "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50";
    const activeTriggerClasses = "bg-background text-foreground shadow-sm";
    const inactiveTriggerClasses = ""; 

    const tabsContentClasses = "mt-2 ring-offset-background";

    return html`<div class="playground">
      <div class="sidebar">
        <div class="selector ${tabsListClasses}">
          <button
            id="geminiTab"
            class="${tabsTriggerClasses} ${this.selectedChatTab === ChatTab.GEMINI ? activeTriggerClasses : inactiveTriggerClasses}"
            data-state=${this.selectedChatTab === ChatTab.GEMINI ? "active" : "inactive"}
            @click=${() => {
              this.selectedChatTab = ChatTab.GEMINI;
            }}>
            Gemini
          </button>
        </div>
        <div
          id="chat"
          class="tabcontent ${tabsContentClasses} ${classMap({
            'showtab': this.selectedChatTab === ChatTab.GEMINI,
          })}">
          <div class="chat-messages">
            ${this.messages}
            <div id="anchor"></div>
          </div>

          <div class="footer">
            <div
              id="chatStatus"
              class=${classMap({'hidden': this.chatState === ChatState.IDLE})}>
              ${this.chatState === ChatState.GENERATING
                ? html`${ICON_BUSY} Generating...`
                : html``}
              ${this.chatState === ChatState.THINKING
                ? html`${ICON_BUSY} Thinking...`
                : html``}
              ${this.chatState === ChatState.EXECUTING
                ? html`${ICON_BUSY} Executing...`
                : html``}
            </div>
            <div id="inputArea">
              <input
                type="text"
                id="messageInput"
                .value=${this.inputMessage}
                @input=${(e: InputEvent) => {
                  this.inputMessage = (e.target as HTMLInputElement).value;
                }}
                @keydown=${(e: KeyboardEvent) => {
                  this.inputKeyDownAction(e);
                }}
                placeholder="Type your message..."
                autocomplete="off"
                class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                 /> {/* Applied shadcn Input classes */}
              <button
                id="sendButton"
                class="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 size-9 rounded-full"
                ?disabled=${this.chatState !== ChatState.IDLE}
                @click=${() => {
                  this.sendMessageAction();
                }}> {/* Applied shadcn default variant, icon size, and rounded-full. Ensured disabled state is bound correctly for Lit. */}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  height="24px"
                  viewBox="0 -960 960 960"
                  width="24px"
                  fill="currentColor">
                  <path d="M120-160v-240l320-80-320-80v-240l760 320-760 320Z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="main-container"> ${this.previewFrame} </div>
    </div>`;
  }
}