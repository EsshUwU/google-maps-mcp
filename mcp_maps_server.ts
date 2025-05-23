/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {Transport} from '@modelcontextprotocol/sdk/shared/transport.js';
import {z} from 'zod';

export interface MapParams {
  location?: string;
  search?: string;
  origin?: string;
  destination?: string;
  zoom_adjust?: number; // Positive for zoom in, negative for zoom out
}

const DEFAULT_ZOOM_INCREMENT = 1; // Changed from 2 to 1

export async function startMcpGoogleMapServer(
  transport: Transport,
  mapQueryHandler: (params: MapParams) => void,
) {
  // Create an MCP server
  const server = new McpServer({
    name: 'AI Studio Google Map',
    version: '1.0.0',
  });

  server.tool(
    'view_location_google_maps',
    'View a specific query or geographical location and display in the embedded maps interface',
    {query: z.string()},
    async ({query}) => {
      mapQueryHandler({location: query});
      return {
        content: [{type: 'text', text: `Navigating to: ${query}`}],
      };
    },
  );

  server.tool(
    'search_google_maps',
    'Search google maps for a series of places near a location and display it in the maps interface',
    {search: z.string()},
    async ({search}) => {
      mapQueryHandler({search});
      return {
        content: [{type: 'text', text: `Searching: ${search}`}],
      };
    },
  );

  server.tool(
    'directions_on_google_maps',
    'Search google maps for directions from origin to destination.',
    {origin: z.string(), destination: z.string()},
    async ({origin, destination}) => {
      mapQueryHandler({origin, destination});
      return {
        content: [
          {type: 'text', text: `Navigating from ${origin} to ${destination}`},
        ],
      };
    },
  );

  server.tool(
    'zoom_in_google_maps',
    'Zooms in on the current map view. Optionally specify a zoom level increment.',
    {level: z.number().optional()},
    async ({level}) => {
      const zoomAmount = level || DEFAULT_ZOOM_INCREMENT;
      mapQueryHandler({zoom_adjust: zoomAmount});
      return {
        content: [{type: 'text', text: `Zoomed in by ${zoomAmount} levels.`}],
      };
    },
  );

  server.tool(
    'zoom_out_google_maps',
    'Zooms out of the current map view. Optionally specify a zoom level decrement.',
    {level: z.number().optional()},
    async ({level}) => {
      const zoomAmount = level || DEFAULT_ZOOM_INCREMENT;
      mapQueryHandler({zoom_adjust: -zoomAmount}); // Negative for zoom out
      return {
        content: [{type: 'text', text: `Zoomed out by ${zoomAmount} levels.`}],
      };
    },
  );

  await server.connect(transport);
  console.log('server running');
  while (true) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}