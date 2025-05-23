/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { ChatState, marked, Playground } from './playground';
import { applyStoredTheme } from './lib/theme'; // Import the theme utility

import { startMcpGoogleMapServer, MapParams } from './mcp_maps_server';

/* --------- */

async function startClient(transport: Transport) {
    const client = new Client({ name: 'AI Studio', version: '1.0.0' });
    await client.connect(transport);
    return client;
}

/* ------------ */

const SYSTEM_INSTRUCTIONS = `You're an extremely proficient with maps and discovering interesting places.
You can use tools to control the map.
When asked a question try to use tools to show related informations on the map.
Always explain what are you doing.
The available tools are:
- view_location_google_maps: View a specific query or geographical location.
- search_google_maps: Search for places near a location.
- directions_on_google_maps: Get directions from an origin to a destination.
- zoom_in_google_maps: Zooms in on the current map view. If the user does not specify by how much, assume a zoom in of 5 levels. Otherwise, use the level specified by the user (e.g., a level of 2 means zoom in by 2 steps).
- zoom_out_google_maps: Zooms out of the current map view. If the user does not specify by how much, assume a zoom out of 5 levels. Otherwise, use the level specified by the user (e.g., a level of 2 means zoom out by 2 steps).`;

const EXAMPLE_PROMPTS = [
    'Where is something cool to see',
    'Show me San Francisco',
    'Where is a place with a tilted tower?',
    'Show me Mount Everest, then zoom in a bit',
    'Can you show me Mauna Kea in Hawaii? And zoom out twice.',
    "Let's go to Venice, Italy.",
    'Take me to the northernmost capital city in the world',
    "How about the southernmost permanently inhabited settlement? What's it called and where is it?",
    'Show me the location of the ancient city of Petra in Jordan, then zoom in by 3 levels',
    "Let's jump to Machu Picchu in Peru",
    'Can you show me the Three Gorges Dam in China?',
    'Can you find a town or city with a really funny or unusual name and show it to me?',
    'Go to India',
    'Zoom in',
    'Zoom out by 2 levels'
];

// Backend API endpoint
const BACKEND_API_URL = '/api/chat/completions';
const OPENROUTER_MODEL = 'google/gemini-2.5-flash-preview-05-20'; // Or your preferred OpenRouter model

// Stores the conversation history for the OpenRouter API
let apiMessages: Array<{
    role: string;
    content?: string | null;
    tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
    tool_call_id?: string;
    name?: string;
}> = [];

function mcpToOpenRouterTool(mcpClient?: Client): any[] {
    const tools: any[] = [];
    if (!mcpClient) return tools;

    tools.push({
        type: 'function',
        function: {
            name: 'view_location_google_maps',
            description:
                'View a specific query or geographical location and display in the embedded maps interface. Use this for general location queries.',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: "The location or query to display, e.g., 'Eiffel Tower' or 'Paris, France'."
                    }
                },
                required: ['query']
            }
        }
    });
    tools.push({
        type: 'function',
        function: {
            name: 'search_google_maps',
            description:
                "Search google maps for a series of places (e.g., 'restaurants', 'parks') near a location or within a general area and display it in the maps interface.",
            parameters: {
                type: 'object',
                properties: {
                    search: {
                        type: 'string',
                        description:
                            "The search query for places, e.g., 'cafes near Golden Gate Park' or 'museums in Rome'."
                    }
                },
                required: ['search']
            }
        }
    });
    tools.push({
        type: 'function',
        function: {
            name: 'directions_on_google_maps',
            description: 'Search google maps for directions from an origin to a destination and display the route.',
            parameters: {
                type: 'object',
                properties: {
                    origin: {
                        type: 'string',
                        description: "The starting point for directions, e.g., 'San Francisco, CA'."
                    },
                    destination: {
                        type: 'string',
                        description: "The end point for directions, e.g., 'Los Angeles, CA'."
                    }
                },
                required: ['origin', 'destination']
            }
        }
    });
    tools.push({
        type: 'function',
        function: {
            name: 'zoom_in_google_maps',
            description:
                "Zooms in on the current map view. If the user doesn't specify a zoom amount, you should use a default level of 5. Optionally accepts a 'level' parameter for a custom zoom increment (e.g., 2 for 2 steps).",
            parameters: {
                type: 'object',
                properties: {
                    level: {
                        type: 'number',
                        description:
                            'Optional. The amount to increment the zoom level by. E.g., 2. If not provided by the user in their prompt, default to 5.'
                    }
                }
            }
        }
    });
    tools.push({
        type: 'function',
        function: {
            name: 'zoom_out_google_maps',
            description:
                "Zooms out of the current map view. If the user doesn't specify a zoom amount, you should use a default level of 5. Optionally accepts a 'level' parameter for a custom zoom decrement (e.g., 2 for 2 steps).",
            parameters: {
                type: 'object',
                properties: {
                    level: {
                        type: 'number',
                        description:
                            'Optional. The amount to decrement the zoom level by. E.g., 2. If not provided by the user in their prompt, default to 5.'
                    }
                }
            }
        }
    });
    return tools;
}

document.addEventListener('DOMContentLoaded', async (event) => {
    applyStoredTheme(); // Apply theme as soon as DOM is loaded

    const rootElement = document.querySelector('#root')! as HTMLElement;
    const playground = new Playground();
    rootElement.appendChild(playground as unknown as HTMLElement);

    // Initial map render based on playground's default state
    playground.renderMapQuery({});

    const [transportA, transportB] = InMemoryTransport.createLinkedPair();
    let mcpClient: Client;

    void startMcpGoogleMapServer(transportA, (params: MapParams) => {
        // This callback now directly calls renderMapQuery which handles all logic including zoom.
        playground.renderMapQuery(params);
    });

    mcpClient = await startClient(transportB);

    // Initialize chat history with system prompt
    apiMessages = [{ role: 'system', content: SYSTEM_INSTRUCTIONS }];

    playground.sendMessageHandler = async (input: string, role: string) => {
        if (role === 'user') {
            apiMessages.push({ role: 'user', content: input });
        }

        playground.setChatState(ChatState.GENERATING);
        const { text: thinkingTextElement, text: assistantMessageTextElement } = playground.addMessage(
            'assistant',
            '...'
        ); // Placeholder for assistant message

        let currentToolCalls: Array<{
            index: number;
            id: string;
            type: string;
            function: { name: string; arguments: string };
        }> = [];
        let accumulatedTextResponse = '';

        try {
            await processMessagesWithOpenRouter();
        } catch (e: any) {
            console.error('OpenRouter API Error:', e);
            let message = e.message || 'An unknown error occurred.';
            if (e.error && e.error.message) {
                // OpenRouter specific error structure
                message = e.error.message;
            }
            try {
                message = await marked.parse(message);
            } catch (parseError) {
                /* Do nothing */
            }
            const { text: errorTextElement } = playground.addMessage('error', '');
            errorTextElement.innerHTML = message;
        } finally {
            playground.setChatState(ChatState.IDLE);
            playground.scrollToTheEnd();
        }

        async function processMessagesWithOpenRouter() {
            const openRouterTools = mcpToOpenRouterTool(mcpClient);
            const headers = {
                'Content-Type': 'application/json'
            };

            const body = JSON.stringify({
                model: OPENROUTER_MODEL,
                messages: apiMessages,
                tools: openRouterTools.length > 0 ? openRouterTools : undefined,
                stream: true
            });

            const response = await fetch(BACKEND_API_URL, {
                method: 'POST',
                headers: headers,
                body: body
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: response.statusText }));
                throw errorData;
            }

            if (!response.body) {
                throw new Error('Response body is null');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            currentToolCalls = []; // Reset for this stream
            accumulatedTextResponse = ''; // Reset for this stream

            assistantMessageTextElement.innerHTML = '...'; // Reset UI for new response

            // eslint-disable-next-line no-constant-condition
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                let boundary = buffer.indexOf('\n\n');
                while (boundary !== -1) {
                    const chunkLine = buffer.substring(0, boundary).trim();
                    buffer = buffer.substring(boundary + 2);

                    if (chunkLine.startsWith('data: ')) {
                        const jsonData = chunkLine.substring(6);
                        if (jsonData === '[DONE]') {
                            playground.setChatState(ChatState.IDLE);
                            break;
                        }
                        try {
                            const chunk = JSON.parse(jsonData);
                            if (chunk.choices && chunk.choices[0] && chunk.choices[0].delta) {
                                const delta = chunk.choices[0].delta;

                                if (delta.content) {
                                    accumulatedTextResponse += delta.content;
                                    assistantMessageTextElement.innerHTML = await marked.parse(
                                        accumulatedTextResponse + '...'
                                    );
                                    playground.scrollToTheEnd();
                                }

                                if (delta.tool_calls) {
                                    playground.setChatState(ChatState.EXECUTING);
                                    for (const toolCallChunk of delta.tool_calls) {
                                        let existingCall = currentToolCalls.find(
                                            (tc) => tc.index === toolCallChunk.index
                                        );
                                        if (!existingCall) {
                                            existingCall = {
                                                index: toolCallChunk.index,
                                                id: toolCallChunk.id || '',
                                                type: toolCallChunk.type || 'function',
                                                function: {
                                                    name: toolCallChunk.function?.name || '',
                                                    arguments: toolCallChunk.function?.arguments || ''
                                                }
                                            };
                                            currentToolCalls.push(existingCall);
                                        } else {
                                            if (toolCallChunk.id) existingCall.id = toolCallChunk.id;
                                            if (toolCallChunk.type) existingCall.type = toolCallChunk.type;
                                            if (toolCallChunk.function?.name)
                                                existingCall.function.name = toolCallChunk.function.name;
                                            if (toolCallChunk.function?.arguments)
                                                existingCall.function.arguments += toolCallChunk.function.arguments;
                                        }
                                    }
                                }
                            }
                            if (chunk.choices && chunk.choices[0] && chunk.choices[0].finish_reason === 'tool_calls') {
                                if (accumulatedTextResponse.trim()) {
                                    apiMessages.push({ role: 'assistant', content: accumulatedTextResponse.trim() });
                                    assistantMessageTextElement.innerHTML = await marked.parse(
                                        accumulatedTextResponse.trim()
                                    );
                                }
                                apiMessages.push({
                                    role: 'assistant',
                                    tool_calls: currentToolCalls.map((tc) => ({
                                        id: tc.id,
                                        type: tc.type,
                                        function: tc.function
                                    }))
                                });
                                await handleToolCalls();
                                return;
                            }
                        } catch (e) {
                            console.error('Error parsing stream chunk:', e, jsonData);
                        }
                    }
                    boundary = buffer.indexOf('\n\n');
                }
            }
            if (accumulatedTextResponse.trim()) {
                assistantMessageTextElement.innerHTML = await marked.parse(accumulatedTextResponse);
                apiMessages.push({ role: 'assistant', content: accumulatedTextResponse.trim() });
            } else if (currentToolCalls.length === 0 && !accumulatedTextResponse.trim()) {
                assistantMessageTextElement.innerHTML = await marked.parse('Done.');
            }
            playground.setChatState(ChatState.IDLE);
        }

        interface McpToolCallFullResponse {
            result?: {
                content?: Array<{ type: string; text?: string; [key: string]: any }>;
            };
            [key: string]: any;
        }

        async function handleToolCalls() {
            for (const toolCall of currentToolCalls) {
                if (!toolCall.id || !toolCall.function.name) {
                    console.error('Incomplete tool call information:', toolCall);
                    continue;
                }
                const functionName = toolCall.function.name;
                let functionArgs;
                try {
                    functionArgs = JSON.parse(toolCall.function.arguments || '{}');
                } catch (e) {
                    console.error(`Error parsing arguments for ${functionName}:`, e);
                    apiMessages.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        name: functionName,
                        content: `Error: Invalid arguments JSON: ${toolCall.function.arguments}`
                    });
                    continue;
                }

                let toolResultText = `Executed ${functionName}.`;

                try {
                    const explanation = `Calling function: ${functionName}\n\`\`\`json\n${JSON.stringify(
                        functionArgs,
                        null,
                        2
                    )}\n\`\`\``;
                    const { text: toolCallTextElement } = playground.addMessage('assistant', '');
                    toolCallTextElement.innerHTML = await marked.parse(explanation);
                    playground.scrollToTheEnd();

                    const toolCallRawResponse = await mcpClient.callTool({
                        name: functionName,
                        arguments: functionArgs
                    });
                    const mcpToolResponse = toolCallRawResponse as McpToolCallFullResponse;
                    const resultContent = mcpToolResponse?.result?.content;

                    if (
                        Array.isArray(resultContent) &&
                        resultContent.length > 0 &&
                        resultContent[0]?.type === 'text' &&
                        typeof resultContent[0].text === 'string'
                    ) {
                        toolResultText = resultContent[0].text;
                    } else {
                        // Fallback for unexpected MCP response structure, but rely on server's text.
                        console.warn(
                            `Tool ${functionName} called via MCP. Response format unexpected or empty. Using fallback text. Response:`,
                            toolCallRawResponse
                        );
                        // Use a generic success message if parsing fails, actual message comes from server tool.
                        toolResultText = `Successfully called ${functionName}.`;
                    }
                    apiMessages.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        name: functionName,
                        content: toolResultText
                    });
                } catch (e: any) {
                    console.error(`Error executing tool ${functionName} via MCP:`, e);
                    apiMessages.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        name: functionName,
                        content: `Error: ${e.message}`
                    });
                }
            }
            await processMessagesWithOpenRouter();
        }
    };

    playground.setInputField(EXAMPLE_PROMPTS[Math.floor(Math.random() * EXAMPLE_PROMPTS.length)]);
});
