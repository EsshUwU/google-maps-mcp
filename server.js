import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createReadStream } from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from dist directory (built frontend)
app.use(express.static(path.join(__dirname, 'dist')));

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// API endpoint for OpenRouter chat completions
app.post('/api/chat/completions', async (req, res) => {
    try {
        const { messages, tools, model, stream } = req.body;

        const headers = {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.HTTP_REFERER || 'http://localhost:3000',
            'X-Title': process.env.X_TITLE || 'MCP Maps Playground'
        };

        const body = JSON.stringify({
            model: model || 'google/gemini-2.5-flash-preview-05-20',
            messages,
            tools: tools && tools.length > 0 ? tools : undefined,
            stream: stream || false
        });

        const response = await fetch(OPENROUTER_API_URL, {
            method: 'POST',
            headers: headers,
            body: body
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: response.statusText }));
            return res.status(response.status).json(errorData);
        }

        if (stream) {
            // Handle streaming response
            res.setHeader('Content-Type', 'text/plain');
            res.setHeader('Transfer-Encoding', 'chunked');

            if (!response.body) {
                return res.status(500).json({ error: 'Response body is null' });
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });
                    res.write(chunk);
                }
                res.end();
            } catch (error) {
                console.error('Streaming error:', error);
                res.end();
            }
        } else {
            // Handle non-streaming response
            const data = await response.json();
            res.json(data);
        }
    } catch (error) {
        console.error('OpenRouter API Error:', error);
        res.status(500).json({
            error: {
                message: error.message || 'Internal server error'
            }
        });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Catch all handler: send back React's index.html file for client-side routing
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`OpenRouter API Key configured: ${process.env.OPENROUTER_API_KEY ? 'Yes' : 'No'}`);
});
