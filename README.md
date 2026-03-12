# ModelDock (All in One LLM Model)
![D4343233-A1E6-4AB1-9C13-6452071229B8_1_201_a](https://github.com/user-attachments/assets/eb005f09-301d-4750-907b-67028f45fd7e)

ModelDock is a unified Next.js application that provides a single, clean chat interface to communicate with all major Large Language Models (LLMs) including ChatGPT, Claude, Gemini, Grok, Qwen, Mistral, and local Ollama models.

Instead of relying on costly API keys, ModelDock automates real local browser sessions using Puppeteer. This allows you to leverage your existing web accounts seamlessly and bypasses typical bot detection systems (like Cloudflare Turnstile).

## Features

- **Unified Chat Interface**: Interact with multiple LLMs from a single UI.
- **No API Keys Required**: Uses your existing browser sessions/accounts to communicate with models.
- **Cross-Platform**: Supports Windows, macOS, and Linux out of the box with auto-detected Chrome installations.
- **Secure Credentials**: Stores session cookies and data securely using `keytar` and SQLite.
- **Voice Support**: Built-in voice features and customizable styling.
- **Privacy-First**: Runs entirely locally on your machine.

## Supported Providers

- **ChatGPT** (OpenAI)
- **Claude** (Anthropic)
- **Gemini** (Google)
- **Grok** (xAI)
- **Z.ai**
- **Qwen**
- **Mistral**
- **Ollama** (Local Models)

## Prerequisites

- **Node.js**: v18 or newer
- **Google Chrome**: Installed on your system (paths auto-detected for Windows, macOS, and Linux).

## Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/yourusername/ModelDock.git
   cd ModelDock
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```
   *(Note: This project uses `npm` but also includes a `bun.lock` if you prefer using Bun).*

3. **Start the development server**:
   ```bash
   npm run dev
   ```

4. **Access the Application**:
   Open `http://localhost:3000` in your web browser.

## How It Works

ModelDock uses `puppeteer-real-browser` to launch a headless/visible Chrome instance. When you send a message to a specific provider, the backend navigates to the respective web interface, injects your session cookies (which you configure in the settings), and interacts with the chat DOM elements strictly through the browser, scraping the AI's responses and piping them back to your unified chat window.

## Configuration

Navigate to the settings icon in the sidebar to configure individual providers, manage cookies, and adjust your theme/voice preferences.

## Developer API

ModelDock now includes a developer-facing local API so you can talk to every supported provider without using the chat UI directly.

- **Docs page**: Open `http://localhost:3000/docs/api`
- **Provider discovery**: `GET /api/v1/providers`
- **Session setup**: `POST /api/v1/providers/:provider/session`
- **Chat endpoint**: `POST /api/v1/chat`

The public API is designed for local scripts, CLIs, automations, and companion tools. Browser-backed providers can reuse your existing web sessions by importing cookies from a local browser or by posting cookies directly to the session endpoint. If you want to protect the API, set `MODELDOCK_API_KEY` in your environment and send it as a Bearer token or `x-modeldock-api-key` header.

## Contributing

We welcome contributions! Please see the [CONTRIBUTING.md](CONTRIBUTING.md) file for guidelines on how to get started.

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.
