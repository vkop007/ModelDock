# Contributing to ModelDock

First off, thank you for considering contributing to ModelDock! It's people like you that make ModelDock a great tool for everyone.

## Getting Started

1. **Fork the repository** on GitHub.
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/yourusername/ModelDock.git
   cd ModelDock
   ```
3. **Install dependencies**:
   ```bash
   npm install
   ```
4. **Create a new branch** for your feature or bugfix:
   ```bash
   git checkout -b feature/my-new-feature
   ```

## Development Environment

ModelDock uses:
- **Next.js** (App Router)
- **React** and **Tailwind CSS** for the frontend
- **Puppeteer** for browser automation
- **SQLite** and **Keytar** for local secure storage

When writing code, please ensure you adhere to the existing code style. We use ESLint and Prettier for code formatting.

```bash
npm run lint
```

## Adding a New LLM Provider

If you are adding support for a new LLM provider, you will generally need to:
1. Add the provider URL to `PROVIDER_URLS` in `lib/puppeteer/browser-manager.ts`.
2. Add the provider type to `LLMProvider` in `types/index.ts`.
3. Implement the specific DOM selectors and interaction logic to send messages and scrape responses for that provider.
4. Update the UI components to show the newly supported provider.

## Pull Request Process

1. Ensure your code is well-tested and doesn't break existing provider integrations. Browser automation is fragile, so please test across different platforms if possible.
2. Update the `README.md` with details of changes to the interface or new providers added.
3. Submit a Pull Request targeting the `main` branch.
4. Describe your changes clearly in the PR description, including what problem it solves and how you tested it.

## Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct. Please be respectful, welcoming, and collaborative.

Thank you for contributing!
