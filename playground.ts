/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable
import hljs from 'highlight.js';
import { html, LitElement } from 'lit';
import { customElement, query, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';

import { MapParams } from './mcp_maps_server'; // MapParams now includes zoom_adjust

/** Markdown formatting function with syntax hilighting */
export const marked = new Marked(
    markedHighlight({
        async: true,
        emptyLangClass: 'hljs',
        langPrefix: 'hljs language-',
        highlight(code, lang, info) {
            const language = hljs.getLanguage(lang) ? lang : 'plaintext';
            return hljs.highlight(code, { language }).value;
        }
    })
);

const ICON_BUSY = html`<svg
    class="rotating"
    xmlns="http://www.w3.org/2000/svg"
    height="24px"
    viewBox="0 -960 960 960"
    width="24px"
    fill="currentColor"
>
    <path
        d="M480-80q-82 0-155-31.5t-127.5-86Q143-252 111.5-325T80-480q0-83 31.5-155.5t86-127Q252-817 325-848.5T480-880q17 0 28.5 11.5T520-840q0 17-11.5 28.5T480-800q-133 0-226.5 93.5T160-480q0 133 93.5 226.5T480-160q133 0 226.5-93.5T800-480q0-17 11.5-28.5T840-520q17 0 28.5 11.5T880-480q0 82-31.5 155t-86 127.5q-54.5 54.5-127 86T480-80Z"
    />
</svg>`;

/**
 * Chat state enum to manage the current state of the chat interface.
 */
export enum ChatState {
    IDLE,
    GENERATING,
    THINKING,
    EXECUTING
}

/**
 * Chat tab enum to manage the current selected tab in the chat interface.
 */
enum ChatTab {
    GEMINI
}

// Internal state for current map display parameters
interface MapDisplayState {
    queryType: 'place' | 'search' | 'directions' | 'none' | 'view';
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
    @query('#chatBarInput') chatBarInput?: HTMLInputElement; // Query for the new input field
    @query('#chatBarMessageArea') chatBarMessageArea?: HTMLDivElement; // Container for stacked messages

    @state() chatState = ChatState.IDLE;
    @state() isRunning = true;
    // @state() selectedChatTab = ChatTab.GEMINI; // Removed: No longer using tabs
    @state() inputMessage = '';
    // @state() messages: HTMLElement[] = []; // Removed: Messages will be handled differently

    // Storing current map parameters internally
    @state() private mapDisplayParams: MapDisplayState = {
        queryType: 'none', // Start with none, initial renderMapQuery({}) will set to World
        queryValue: undefined,
        zoom: 3 // Default initial zoom for the world view
    };

    private readonly previewFrame: HTMLIFrameElement = document.createElement('iframe');

    private readonly MAPS_API_KEY = 'AIzaSyC7c1m_Jyz3uw6lbIQUNuH3e6o0NKc_8hk'; // Keep your API key secure

    // For the dedicated streaming message
    private streamingMessageElement: HTMLElement | null = null;
    private streamingMessageFadeOutTimeoutId: number | null = null;
    private streamingMessageRemovalTimeoutId: number | null = null;

    sendMessageHandler?: CallableFunction;

    constructor() {
        super();
        this.previewFrame.classList.add('preview-iframe');
        this.previewFrame.setAttribute('allowTransparency', 'true');
        this.previewFrame.setAttribute('allowfullscreen', 'true');
        this.previewFrame.setAttribute('loading', 'lazy');
        this.previewFrame.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
        this.previewFrame.setAttribute(
            'sandbox',
            'allow-scripts allow-same-origin allow-forms allow-popups allow-presentation'
        );
    }

    /** Disable shadow DOM */
    createRenderRoot() {
        return this;
    }

    // Method to display temporary messages in the chat bar, now stacking
    displayTemporaryChatMessage(message: string, duration: number = 3000) {
        if (!this.chatBarMessageArea) return;

        const messageElement = document.createElement('div');
        messageElement.classList.add('chat-bar-message');
        messageElement.innerHTML = message;
        messageElement.style.opacity = '0'; // Start transparent for fade-in

        this.chatBarMessageArea.appendChild(messageElement);

        // Trigger reflow to ensure transition is applied
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const _ = messageElement.offsetHeight;

        messageElement.style.opacity = '1'; // Fade in

        const fadeOutTimeoutId = window.setTimeout(() => {
            messageElement.style.opacity = '0'; // Start fade out
            const removalTimeoutId = window.setTimeout(() => {
                if (this.chatBarMessageArea && messageElement.parentNode === this.chatBarMessageArea) {
                    this.chatBarMessageArea.removeChild(messageElement);
                }
            }, 500); // Corresponds to CSS transition duration for opacity
        }, duration);
    }

    public showStreamingMessage(contentHtml: string, duration: number = 60000) {
        if (!this.chatBarMessageArea) return;

        if (this.streamingMessageFadeOutTimeoutId) window.clearTimeout(this.streamingMessageFadeOutTimeoutId);
        if (this.streamingMessageRemovalTimeoutId) window.clearTimeout(this.streamingMessageRemovalTimeoutId);

        if (!this.streamingMessageElement || !this.streamingMessageElement.parentNode) {
            this.streamingMessageElement = document.createElement('div');
            this.streamingMessageElement.classList.add('chat-bar-message');
            // Prepend to keep it at the "bottom" of the column-reverse flex container,
            // making it appear as the most recent / lowest in the visual stack.
            this.chatBarMessageArea.insertBefore(this.streamingMessageElement, this.chatBarMessageArea.firstChild);

            this.streamingMessageElement.style.opacity = '0';
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const _ = this.streamingMessageElement.offsetHeight; // reflow
        }
        this.streamingMessageElement.innerHTML = contentHtml;
        this.streamingMessageElement.style.opacity = '1'; // Ensure it's visible

        this.streamingMessageFadeOutTimeoutId = window.setTimeout(() => {
            if (this.streamingMessageElement) {
                this.streamingMessageElement.style.opacity = '0';
                this.streamingMessageRemovalTimeoutId = window.setTimeout(() => {
                    if (this.streamingMessageElement && this.streamingMessageElement.parentNode) {
                        this.streamingMessageElement.parentNode.removeChild(this.streamingMessageElement);
                    }
                    this.streamingMessageElement = null;
                }, 500);
            }
        }, duration);
    }

    public finalizeStreamingMessage(finalContentHtml?: string, shortDuration: number = 5000) {
        if (this.streamingMessageElement) {
            if (this.streamingMessageFadeOutTimeoutId) window.clearTimeout(this.streamingMessageFadeOutTimeoutId);
            if (this.streamingMessageRemovalTimeoutId) window.clearTimeout(this.streamingMessageRemovalTimeoutId);

            if (finalContentHtml) {
                this.streamingMessageElement.innerHTML = finalContentHtml;
            }
            this.streamingMessageElement.style.opacity = '1'; // Ensure visible

            this.streamingMessageFadeOutTimeoutId = window.setTimeout(() => {
                if (this.streamingMessageElement) {
                    this.streamingMessageElement.style.opacity = '0';
                    this.streamingMessageRemovalTimeoutId = window.setTimeout(() => {
                        if (this.streamingMessageElement && this.streamingMessageElement.parentNode) {
                            this.streamingMessageElement.parentNode.removeChild(this.streamingMessageElement);
                        }
                        this.streamingMessageElement = null;
                    }, 500);
                }
            }, shortDuration);
        } else if (finalContentHtml) {
            // If there was no active streaming message, but we have final content, display it as a normal temp message.
            this.displayTemporaryChatMessage(finalContentHtml, shortDuration);
        }
    }

    public clearActiveStreamingMessageImmediately() {
        if (this.streamingMessageFadeOutTimeoutId) window.clearTimeout(this.streamingMessageFadeOutTimeoutId);
        if (this.streamingMessageRemovalTimeoutId) window.clearTimeout(this.streamingMessageRemovalTimeoutId);
        if (this.streamingMessageElement && this.streamingMessageElement.parentNode) {
            this.streamingMessageElement.parentNode.removeChild(this.streamingMessageElement);
        }
        this.streamingMessageElement = null;
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
                // Default to zoom 5 for broad place queries (like countries/cities) if not adjusting zoom simultaneously
                zoom: newParams.zoom_adjust === undefined ? 6 : targetZoom,
                origin: undefined,
                destination: undefined
            };
        } else if (newParams.search) {
            this.mapDisplayParams = {
                queryType: 'search',
                queryValue: newParams.search,
                // Default to zoom 14 for local search queries if not adjusting zoom simultaneously
                zoom: newParams.zoom_adjust === undefined ? 14 : targetZoom,
                origin: undefined,
                destination: undefined
            };
        } else if (newParams.origin && newParams.destination) {
            this.mapDisplayParams = {
                queryType: 'directions',
                origin: newParams.origin,
                destination: newParams.destination,
                // Default to zoom 8 for directions if not adjusting zoom simultaneously
                zoom: newParams.zoom_adjust === undefined ? 8 : targetZoom,
                queryValue: undefined
            };
        } else if (newParams.zoom_adjust !== undefined) {
            // If only zoom_adjust was provided, mapDisplayParams.zoom is already updated.
            // No change to queryType or queryValue/origin/destination needed.
            // If there was no prior context for zoom, it will apply to the 'World' view.
            if (this.mapDisplayParams.queryType === 'none') {
                this.mapDisplayParams.queryType = 'view';
                this.mapDisplayParams.queryValue = undefined;
            }
        } else if (Object.keys(newParams).length === 0 && this.mapDisplayParams.queryType === 'none') {
            // Handles initial load if mapDisplayParams was 'none' and empty params passed.
            // Use view mode with explicit coordinates to prevent location detection
            this.mapDisplayParams = {
                queryType: 'view',
                queryValue: undefined,
                zoom: 3,
                origin: undefined,
                destination: undefined
            };
        }

        let src = '';
        const currentContext = this.mapDisplayParams;

        switch (currentContext.queryType) {
            case 'place':
                if (currentContext.queryValue) {
                    src = `https://www.google.com/maps/embed/v1/place?key=${this.MAPS_API_KEY}&q=${encodeURIComponent(
                        currentContext.queryValue
                    )}&zoom=${currentContext.zoom}&region=US&language=en`;
                }
                break;
            case 'view':
                // Use explicit center coordinates for world view to prevent location detection
                src = `https://www.google.com/maps/embed/v1/view?key=${this.MAPS_API_KEY}&center=20,0&zoom=${currentContext.zoom}&region=US&language=en`;
                break;
            case 'search':
                if (currentContext.queryValue) {
                    src = `https://www.google.com/maps/embed/v1/search?key=${this.MAPS_API_KEY}&q=${encodeURIComponent(
                        currentContext.queryValue
                    )}&zoom=${currentContext.zoom}&region=US&language=en`;
                }
                break;
            case 'directions':
                if (currentContext.origin && currentContext.destination) {
                    src = `https://www.google.com/maps/embed/v1/directions?key=${
                        this.MAPS_API_KEY
                    }&origin=${encodeURIComponent(currentContext.origin)}&destination=${encodeURIComponent(
                        currentContext.destination
                    )}&zoom=${currentContext.zoom}&region=US&language=en`;
                }
                break;
            default: // Includes 'none' or if context is somehow invalid
                // Fallback to a general world view if no specific query is active
                if (!this.previewFrame.src || (currentContext.queryType === 'none' && !currentContext.queryValue)) {
                    src = `https://www.google.com/maps/embed/v1/view?key=${this.MAPS_API_KEY}&center=20,0&zoom=3&region=US&language=en`;
                }
                break;
        }

        if (src) {
            this.previewFrame.src = src;
        }
        // Request update for LitElement to re-render based on @state changes
        (this as LitElement).requestUpdate();
    }

    setInputField(message: string) {
        this.inputMessage = message.trim();
        if (this.chatBarInput) {
            // Also update the new input field
            this.chatBarInput.value = message.trim();
        }
    }

    // addMessage is simplified to only handle temporary messages for tool calls/results
    addMessage(role: string, message: string) {
        // We will now use displayTemporaryChatMessage for feedback
        // This function might be further refactored or removed if all messages become temporary
        const messageContent = `<strong>${role}:</strong> ${message}`;
        this.displayTemporaryChatMessage(messageContent, 4000);

        // Return dummy elements as the original structure expects it,
        // though they are not used in the new UI.
        const thinking = document.createElement('div');
        const text = document.createElement('div');
        return { thinking, text };
    }

    scrollToTheEnd() {
        // Scrolling is no longer needed with the new chat bar UI
        // if (!this.anchor) return;
        // this.anchor.scrollIntoView({
        //   behavior: 'auto',
        //   block: 'end',
        // });
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
            if (this.chatBarInput) {
                // Clear the new input field
                this.chatBarInput.value = '';
            }
        }

        if (msg.length === 0) {
            this.chatState = ChatState.IDLE;
            return;
        }

        const msgRole = role ? role.toLowerCase() : 'user';

        if (this.sendMessageHandler) {
            await this.sendMessageHandler(msg, msgRole);
        }

        // No longer setting to IDLE here, it's handled in processMessagesWithOpenRouter completion/error
    }

    private async inputKeyDownAction(e: KeyboardEvent) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            // Ensure inputMessage is synced from chatBarInput before sending
            if (this.chatBarInput) {
                this.inputMessage = this.chatBarInput.value;
            }
            this.sendMessageAction();
        }
    }

    render() {
        // Removed sidebar, chat messages, and tabs. Added new chat bar structure.
        return html`
            <div class="playground">
                <div class="main-container">
                    ${this.previewFrame}
                    <div id="chatBar">
                        <div id="chatBarMessageArea"></div>
                        <input
                            id="chatBarInput"
                            type="text"
                            placeholder="Enter a prompt here..."
                            .value=${this.inputMessage}
                            @input=${(e: Event) => (this.inputMessage = (e.target as HTMLInputElement).value)}
                            @keydown=${this.inputKeyDownAction}
                            ?disabled=${this.chatState !== ChatState.IDLE}
                        />
                        <button
                            id="sendButton"
                            @click=${() => {
                                if (this.chatBarInput) {
                                    this.inputMessage = this.chatBarInput.value; // Sync before send
                                }
                                this.sendMessageAction();
                            }}
                            ?disabled=${this.chatState !== ChatState.IDLE || !this.inputMessage.trim()}
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                height="24px"
                                viewBox="0 -960 960 960"
                                width="24px"
                                fill="currentColor"
                            >
                                <path d="M120-160v-240l320-80-320-80v-240l760 320-760 320Z" />
                            </svg>
                        </button>
                    </div>
                </div>
                <div id="anchor"></div>
            </div>
        `;
    }
}

// Helper function to simulate a delay
// function delay(ms: number) {
//   return new Promise((resolve) => setTimeout(resolve, ms));
// }
