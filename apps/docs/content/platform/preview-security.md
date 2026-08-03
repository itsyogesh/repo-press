---
title: Preview fidelity and security
description: Learn how RepoPress Generic and Compatible previews provide useful author feedback while isolating untrusted repository code and actions.
---

RepoPress previews content from repositories it does not control. Fidelity cannot be one unsafe switch, so Studio reports an explicit preview grade and keeps a safe Generic result available whenever a higher-fidelity artifact cannot be proven for the exact document snapshot.

## Fidelity grades

| Grade | Available | Represents | Does not represent |
| --- | --- | --- | --- |
| Generic | Always | Bounded Markdown/MDX with Typeset rhythm and custom-component placeholders | Product component appearance or execution |
| Compatible | When configured and verified | Signed browser-compatible structure rendered in an isolated sandbox | Server loaders, framework server components, or full application context |
| Native | Future | Repository framework in a managed runner | Not available in the current implementation |

## Generic preview

Generic preview never executes repository imports. It parses a bounded source model, renders ordinary prose, and keeps unknown component names visible rather than silently dropping them. Static inert output is a safe fallback, not an error.

## Compatible preview pipeline

A Compatible preview is accepted only after RepoPress:

1. authenticates the user and project;
2. resolves the project preview entry from configuration;
3. pins the repository commit that also owns the document snapshot;
4. fetches and validates a bounded adapter source file;
5. compiles it using only the allowed runtime vocabulary;
6. signs a short-lived capability bound to project, commit, entry, and source hash; and
7. verifies that capability inside a separate-origin sandbox before mounting.

Any missing, stale, unsupported, or unverifiable stage downgrades to Generic with a diagnostic.

## Sandbox boundary

Compatible output is mounted in an iframe with an opaque origin and a restrictive Content Security Policy. The sandbox is designed to prevent the artifact from becoming a second application context.

The runtime strips or rejects raw event handlers, refs, inline styles, dangerous HTML, forms, arbitrary anchors, frames, active media/network elements, and executable markup. Repository adapters cannot dynamically import modules, call `require`, use import metadata, or load framework/data-client code.

## Allowed adapter vocabulary

An adapter can import only React JSX runtimes and `@repopress/preview`. The preview package exposes fixed semantic primitives such as document, text, box, image placeholder, and inert action nodes.

Relative imports and product components are intentionally excluded. The real application remains free to use its own router, CSS, server data, and component implementation after publication.

## Controlled preview actions

Authors still need to understand what a product button is meant to do. `PreviewAction` renders a sandbox-local control that explains a declared label and destination, but it never follows the URL, submits a form, opens a window, fetches, or calls a repository callback.

Declare editable actions as ordinary data props such as `buttonText` and `buttonHref`. The production component interprets those values in its framework; the Compatible mapping presents them safely. Functions, `onClick`, target/window controls, and arbitrary expressions are outside the preview contract.

Accepted preview destinations are bounded repository/root-relative paths and HTTPS URLs. Dangerous schemes, protocol-relative values, credentials, control characters, and oversized destinations are rejected or omitted. The production component must still enforce its own URL policy.

## Snapshot and signing authority

The capability binds the adapter and document to exact hashes and expires quickly. The private signing key and capability secret are server-only. Production Studio and preview use distinct origins so an injected preview cannot inherit application cookies or origin authority.

## Failure behavior

The editor remains usable when Compatible preview is unavailable. Studio shows Generic output and explains the downgrade. It must not silently run the product component in the host realm, weaken the iframe sandbox, or accept unsigned content to improve fidelity.

## Extending preview safely

When adding a component mapping:

1. keep production behavior in the product runtime;
2. expose author-editable values as bounded metadata;
3. use only preview primitives in the adapter;
4. test invalid destinations and active markup;
5. verify the exact fixture through the product's own MDX build; and
6. accept Generic fallback when authority is unavailable.

Continue with [Component authoring](/components/authoring) and [Build a component extension](/tutorials/component-extension).
