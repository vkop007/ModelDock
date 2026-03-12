"use client";

import { useChatContext } from "@/context/ChatContext";
import { PROVIDER_ORDER, PROVIDERS } from "@/types";
import {
  FiArrowLeft,
  FiCode,
  FiCompass,
  FiKey,
  FiPlay,
} from "react-icons/fi";
import styles from "@/app/docs/api/page.module.css";

const curlProvidersExample = [
  "curl http://localhost:3000/api/v1/providers \\",
  '  -H "Authorization: Bearer $MODELDOCK_API_KEY"',
].join("\n");

const curlSessionExample = [
  "curl -X POST http://localhost:3000/api/v1/providers/chatgpt/session \\",
  '  -H "Content-Type: application/json" \\',
  '  -H "Authorization: Bearer $MODELDOCK_API_KEY" \\',
  '  -d \'{',
  '    "importFromBrowser": "chrome",',
  '    "persist": true,',
  '    "warmup": true',
  "  }'",
].join("\n");

const curlChatExample = [
  "curl -X POST http://localhost:3000/api/v1/chat \\",
  '  -H "Content-Type: application/json" \\',
  '  -H "Authorization: Bearer $MODELDOCK_API_KEY" \\',
  '  -d \'{',
  '    "provider": "chatgpt",',
  '    "message": "Summarize this repository in five bullets.",',
  '    "stream": false',
  "  }'",
].join("\n");

const curlStreamExample = [
  "curl -N -X POST http://localhost:3000/api/v1/chat \\",
  '  -H "Content-Type: application/json" \\',
  '  -H "Authorization: Bearer $MODELDOCK_API_KEY" \\',
  '  -d \'{',
  '    "provider": "claude",',
  '    "message": "Design a release checklist for this app.",',
  '    "stream": true',
  "  }'",
].join("\n");

const javascriptExample = [
  'const response = await fetch("http://localhost:3000/api/v1/chat", {',
  '  method: "POST",',
  "  headers: {",
  '    "Content-Type": "application/json",',
  '    Authorization: `Bearer ${process.env.MODELDOCK_API_KEY}`,',
  "  },",
  "  body: JSON.stringify({",
  '    provider: "gemini",',
  '    message: "Generate a launch announcement draft.",',
  "    stream: false,",
  "  }),",
  "});",
  "",
  "const data = await response.json();",
  "console.log(data.content);",
].join("\n");

const sessionBodyExample = [
  "{",
  '  "cookies": [',
  "    {",
  '      "name": "session_cookie_name",',
  '      "value": "session_cookie_value",',
  '      "domain": ".chatgpt.com",',
  '      "path": "/"',
  "    }",
  "  ],",
  '  "persist": true,',
  '  "warmup": false',
  "}",
].join("\n");

const chatBodyExample = [
  "{",
  '  "provider": "chatgpt",',
  '  "message": "Write a changelog for today\'s work.",',
  '  "conversationId": "optional-provider-thread-id",',
  '  "stream": false,',
  '  "warmup": false,',
  '  "persistCookies": true',
  "}",
].join("\n");

const endpoints = [
  {
    method: "GET",
    path: "/api/v1/providers",
    body: "Lists every provider, its transport, whether cookies are required, and whether a stored API session already exists.",
  },
  {
    method: "GET",
    path: "/api/v1/providers/:provider/session",
    body: "Returns the saved-session status for one provider. For browser-backed providers, authentication is only known once the tab is live.",
  },
  {
    method: "POST",
    path: "/api/v1/providers/:provider/session",
    body: "Imports cookies from a local browser or accepts pasted cookies, optionally persists them under .browser-data/api-config.json, and verifies login.",
  },
  {
    method: "DELETE",
    path: "/api/v1/providers/:provider/session",
    body: "Clears the stored API session for that provider and closes its live browser tab.",
  },
  {
    method: "POST",
    path: "/api/v1/chat",
    body: "Sends a prompt to any provider. Supports non-streaming JSON responses, SSE streaming, images, optional warmup, and provider-native conversationId reuse.",
  },
];

const notes = [
  "UI cookie settings and API sessions are intentionally separate. The chat UI stores cookies in browser localStorage; the public API stores them server-side in .browser-data/api-config.json when persistence is enabled.",
  "Browser-backed providers open a real visible browser through Puppeteer. That is expected behavior and how ModelDock reuses your existing web sessions instead of API keys.",
  "Use provider-native conversationId values from the API response to continue an existing remote thread. The app does not replay full chat history on each request.",
  "Ollama is the only provider that does not require cookies. It talks to the local Ollama HTTP server instead of a browser session.",
];

const providers = PROVIDER_ORDER.map((id) => ({
  id,
  name: PROVIDERS[id].name,
  mode: id === "ollama" ? "local-http" : "browser-session",
}));

const sections = [
  { id: "quickstart", label: "Quick start" },
  { id: "endpoints", label: "Endpoints" },
  { id: "payloads", label: "Payloads" },
  { id: "examples", label: "Examples" },
  { id: "providers", label: "Providers" },
  { id: "operations", label: "Operational notes" },
];

const recommendedFlow = [
  "Discover providers",
  "Configure a provider session",
  "Send prompts or stream replies",
];

export default function ApiDocsView() {
  const { showChatView } = useChatContext();

  return (
    <section className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.topbar}>
          <button
            type="button"
            className={styles.backLink}
            onClick={showChatView}
          >
            <FiArrowLeft size={16} />
            Back to chat
          </button>
          <div className={styles.statusRow}>
            <span className={styles.statusBadge}>
              <FiCode size={14} />
              Developer API
            </span>
            <span className={styles.statusMeta}>
              Local by default. Add MODELDOCK_API_KEY for Bearer auth.
            </span>
          </div>
        </div>

        <div className={styles.content}>
          <nav className={styles.sectionTabs} aria-label="API sections">
            {sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className={styles.sectionTab}
              >
                {section.label}
              </a>
            ))}
          </nav>

            <section className={`${styles.surface} ${styles.hero}`}>
              <div className={styles.heroGrid}>
                <div className={styles.heroMain}>
                  <span className={styles.eyebrow}>
                    <FiCode size={14} />
                    Scriptable provider access
                  </span>
                  <h2 className={styles.title}>
                    Use every ModelDock provider through one local HTTP API.
                  </h2>
                  <p className={styles.lead}>
                    ModelDock already knows how to drive ChatGPT, Claude,
                    Gemini, Grok, Qwen, Z.ai, Mistral, and Ollama. The public
                    API turns that browser automation layer into a stable local
                    interface for CLIs, automations, and companion tools.
                  </p>

                  <div className={styles.heroActions}>
                    <a href="#quickstart" className={styles.primaryButton}>
                      <FiPlay size={16} />
                      Quick start
                    </a>
                    <a href="#endpoints" className={styles.secondaryButton}>
                      <FiCompass size={16} />
                      Endpoint reference
                    </a>
                  </div>

                  <div className={styles.summaryGrid}>
                    <div className={styles.summaryCard}>
                      <strong>Auth</strong>
                      <span>
                        Keep it open for local use, or set MODELDOCK_API_KEY to
                        require a Bearer token on every request.
                      </span>
                    </div>
                    <div className={styles.summaryCard}>
                      <strong>Cookies</strong>
                      <span>
                        Browser-backed providers can import cookies from Chrome,
                        Edge, Brave, Firefox, and other supported browsers.
                      </span>
                    </div>
                    <div className={styles.summaryCard}>
                      <strong>Conversations</strong>
                      <span>
                        Reuse provider-native conversation IDs to keep a remote
                        thread going across requests.
                      </span>
                    </div>
                  </div>
                </div>

                <div className={styles.heroAside}>
                  <div className={styles.heroCard}>
                    <div className={styles.heroCardLabel}>First request</div>
                    <div className={styles.heroCardTitle}>
                      Discover providers and current session state
                    </div>
                    <p className={styles.heroCardText}>
                      Start with provider discovery, then configure a session
                      for the browser-backed model you want to automate.
                    </p>
                    <pre className={styles.code}>{curlProvidersExample}</pre>
                  </div>
                  <div className={`${styles.heroCard} ${styles.flowCard}`}>
                    <div className={styles.heroCardLabel}>Recommended flow</div>
                    <div className={styles.flowList}>
                      {recommendedFlow.map((step, index) => (
                        <div className={styles.flowStep} key={step}>
                          <span className={styles.flowStepNumber}>
                            {index + 1}
                          </span>
                          <span>{step}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section
              className={`${styles.surface} ${styles.section}`}
              id="quickstart"
            >
              <div className={styles.sectionHeader}>
                <div>
                  <h2 className={styles.sectionTitle}>Quick start</h2>
                  <p className={styles.sectionLead}>
                    The shortest path is to configure one provider session and
                    then call the chat endpoint. After that your local scripts
                    can keep reusing the stored session.
                  </p>
                </div>
                <a href="#endpoints" className={styles.sectionAnchor}>
                  Reference
                </a>
              </div>
              <div className={styles.stepGrid}>
                <article className={styles.card}>
                  <div className={styles.stepHeader}>
                    <span className={styles.stepNumber}>1</span>
                    <h3 className={styles.cardTitle}>Check what is available</h3>
                  </div>
                  <p className={styles.cardBody}>
                    Call{" "}
                    <span className={styles.inlineCode}>
                      GET /api/v1/providers
                    </span>{" "}
                    to see every provider plus whether a stored session already
                    exists.
                  </p>
                  <pre className={styles.code}>{curlProvidersExample}</pre>
                </article>
                <article className={styles.card}>
                  <div className={styles.stepHeader}>
                    <span className={styles.stepNumber}>2</span>
                    <h3 className={styles.cardTitle}>
                      Configure a provider session
                    </h3>
                  </div>
                  <p className={styles.cardBody}>
                    Import cookies directly from a local browser or post them
                    manually, then optionally persist them for reuse.
                  </p>
                  <pre className={styles.code}>{curlSessionExample}</pre>
                </article>
                <article className={styles.card}>
                  <div className={styles.stepHeader}>
                    <span className={styles.stepNumber}>3</span>
                    <h3 className={styles.cardTitle}>Send prompts</h3>
                  </div>
                  <p className={styles.cardBody}>
                    Use JSON responses by default or set{" "}
                    <span className={styles.inlineCode}>stream: true</span> to
                    consume SSE.
                  </p>
                  <pre className={styles.code}>{curlChatExample}</pre>
                </article>
              </div>
            </section>

            <section
              className={`${styles.surface} ${styles.section}`}
              id="endpoints"
            >
              <div className={styles.sectionHeader}>
                <div>
                  <h2 className={styles.sectionTitle}>Endpoint reference</h2>
                  <p className={styles.sectionLead}>
                    These are the stable external routes. They are cleaner than
                    the frontend&apos;s internal payloads and are intended for
                    developer use.
                  </p>
                </div>
              </div>
              <div className={styles.endpointGrid}>
                {endpoints.map((endpoint) => (
                  <article className={styles.card} key={endpoint.path}>
                    <div className={styles.endpointHeader}>
                      <span className={styles.method}>{endpoint.method}</span>
                      <span className={styles.path}>{endpoint.path}</span>
                    </div>
                    <p className={styles.cardBody}>{endpoint.body}</p>
                  </article>
                ))}
              </div>
            </section>

            <section
              className={`${styles.surface} ${styles.section}`}
              id="payloads"
            >
              <div className={styles.sectionHeader}>
                <div>
                  <h2 className={styles.sectionTitle}>Request payloads</h2>
                  <p className={styles.sectionLead}>
                    These are the two payload shapes you will use most often in
                    editors, scripts, or automation templates.
                  </p>
                </div>
              </div>
              <div className={styles.payloadGrid}>
                <article className={styles.card}>
                  <h3 className={styles.cardTitle}>Session setup payload</h3>
                  <p className={styles.cardBody}>
                    Use this with{" "}
                    <span className={styles.inlineCode}>
                      POST /api/v1/providers/:provider/session
                    </span>
                    .
                  </p>
                  <pre className={styles.code}>{sessionBodyExample}</pre>
                </article>
                <article className={styles.card}>
                  <h3 className={styles.cardTitle}>Chat payload</h3>
                  <p className={styles.cardBody}>
                    Add base64 data URLs in{" "}
                    <span className={styles.inlineCode}>images</span> when the
                    provider supports uploads.
                  </p>
                  <pre className={styles.code}>{chatBodyExample}</pre>
                </article>
              </div>
            </section>

            <section
              className={`${styles.surface} ${styles.section}`}
              id="examples"
            >
              <div className={styles.sectionHeader}>
                <div>
                  <h2 className={styles.sectionTitle}>Examples</h2>
                  <p className={styles.sectionLead}>
                    These examples are intended for local tooling, scripts, and
                    integrations that run alongside ModelDock.
                  </p>
                </div>
              </div>
              <div className={styles.exampleGrid}>
                <article className={styles.card}>
                  <h3 className={styles.cardTitle}>Streaming with curl</h3>
                  <p className={styles.cardBody}>
                    The stream emits typed SSE messages so clients can react to
                    connection start, chunks, completion, and errors.
                  </p>
                  <pre className={styles.code}>{curlStreamExample}</pre>
                </article>
                <article className={styles.card}>
                  <h3 className={styles.cardTitle}>JavaScript fetch</h3>
                  <p className={styles.cardBody}>
                    Useful for Electron apps, Node scripts, or internal desktop
                    tooling.
                  </p>
                  <pre className={styles.code}>{javascriptExample}</pre>
                </article>
              </div>
            </section>

            <section
              className={`${styles.surface} ${styles.section}`}
              id="providers"
            >
              <div className={styles.sectionHeader}>
                <div>
                  <h2 className={styles.sectionTitle}>Provider coverage</h2>
                  <p className={styles.sectionLead}>
                    Every provider already supported in the UI is reachable from
                    the external API as well.
                  </p>
                </div>
              </div>
              <div className={styles.providerGrid}>
                {providers.map((provider) => (
                  <div className={styles.providerPill} key={provider.id}>
                    <span className={styles.providerName}>{provider.name}</span>
                    <span className={styles.providerMode}>{provider.mode}</span>
                  </div>
                ))}
              </div>
            </section>

            <section
              className={`${styles.surface} ${styles.section}`}
              id="operations"
            >
              <div className={styles.sectionHeader}>
                <div>
                  <h2 className={styles.sectionTitle}>Operational notes</h2>
                  <p className={styles.sectionLead}>
                    A few implementation details matter when you build on top of
                    a browser-first system.
                  </p>
                </div>
              </div>
              <div className={styles.noteGrid}>
                {notes.map((note, index) => (
                  <article className={styles.card} key={note}>
                    <h3 className={styles.noteTitle}>
                      <FiKey size={14} />
                      Note {index + 1}
                    </h3>
                    <p className={styles.cardBody}>{note}</p>
                  </article>
                ))}
              </div>
              <p className={styles.footer}>
                If you want the UI workflow, use the main chat surface. If you
                want repeatable tooling, keep the session endpoint in front of
                your scripts and reuse returned conversation IDs.
              </p>
            </section>
        </div>
      </div>
    </section>
  );
}
