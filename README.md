# MCP Google Maps Playground

An interactive playground for Google Maps using the Model Context Protocol (MCP).

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file in the root directory with your OpenRouter API key:

```
OPENROUTER_API_KEY=your_openrouter_api_key_here
```

3. Build the frontend:

```bash
npm run build
```

4. Start the server:

```bash
npm start
```

## Development

For development with auto-reload, you have two options:

### Option 1: Run both servers automatically

```bash
npm run dev:full
```

### Option 2: Run servers separately (recommended)

```bash
# Terminal 1: Start backend server (port 3000)
npm run dev:server

# Terminal 2: Start frontend dev server (port 5173)
npm run dev
```

Then open your browser to http://localhost:5173 (frontend dev server)

**Important:** Make sure both servers are running! The frontend (port 5173) will proxy API requests to the backend (port 3000).

## Features

-   Interactive Google Maps integration
-   AI-powered location search and directions
-   Real-time map manipulation (zoom, search, directions)
-   Tool-based interactions with map functionality

Future works

use open source version of Google maps

Archived
