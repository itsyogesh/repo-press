---
title: Studio editor
description: Use RepoPress Studio to edit frontmatter, Markdown, and reusable MDX components with explicit preview fidelity and Git publishing.
---

Studio is RepoPress's main authoring surface. It combines repository navigation, a source-preserving editor, structured properties, and a labelled preview without turning your content into a proprietary document format.

## Workspace layout

Studio uses three resizable regions:

- **Explorer** browses the project's configured content root. Folders can be expanded and the selected file is highlighted.
- **Editor** exposes structured properties and an MDX-aware source editor.
- **Preview** renders the current snapshot edge to edge and labels its fidelity as Generic or Compatible.

Panels can be resized or collapsed to focus on writing. The Explorer's create action is for creating new supported files and folders; it is separate from choosing an existing document.

## Edit frontmatter

When a document uses YAML frontmatter, Studio shows known metadata as form fields and preserves its body as MDX. Typical fields include:

- strings such as `title`, `description`, and image URLs;
- booleans such as `draft`;
- dates such as `publishedAt`; and
- arrays such as tags or categories.

The actual fields come from the project/framework schema and the document. RepoPress preserves whether a file uses frontmatter, a supported static metadata export, or no metadata; publishing does not add an empty YAML block to a plain document.

## Write Markdown and MDX

The editor preserves Markdown source and recognizes ordinary MDX component syntax. Formatting controls insert or update source rather than creating a second proprietary representation.

Product components become most useful when the project declares an authoring contract. That contract supplies human labels, prop types, defaults, required fields, slots, and fixture paths. Studio can then show an insert form and a selected-component preview instead of exposing unexplained prop counts.

## Insert a component

Open the component picker, select a component, review its description and synthesized preview, then fill its declared fields. RepoPress serializes deterministic MDX from the values.

The preview card is based on declarative metadata and literal/default values. When Compatible authority is available, the selected component may additionally render in the isolated sandbox.

> **Note:** The picker currently **does not fetch fixture file contents**. Fixture paths remain canonical repository examples and registry/test inputs; declared defaults provide the immediate picker state.

## Edit an existing component

Select an editable component in the properties panel. RepoPress only edits a component when it can identify one exact source node and each edited prop is an unambiguous literal attribute. It intentionally refuses spread props, opaque expressions, or ambiguous duplicate matches rather than guessing and corrupting MDX.

When a component cannot be edited safely, use source mode to make the change or simplify the component invocation. For components such as a cover image or letter-paper wrapper, declare the editable URL/text fields in project component metadata so Studio can label the controls correctly.

## Slots

The conventional `children` slot can be inserted and edited as component content. Other **named slots** are accepted by the metadata schema for forward compatibility but are **not currently** materialized as JSX children or named props by the authoring surface.

## Preview fidelity

RepoPress never presents an approximation as the production website:

| Grade | What it renders | What it does not promise |
| --- | --- | --- |
| Generic | Safe Typeset Markdown/MDX plus placeholders for custom components | Product styling or component execution |
| Compatible | A signed browser-compatible adapter in an isolated opaque-origin frame | Server loaders or the entire product runtime |
| Native | Reserved for a future managed runtime | Not available in the current slice |

Compatible mappings are structural and deliberately inert. Safe preview actions can explain their declared destination when clicked, but they do not navigate, submit, fetch, or invoke repository callbacks.

See [Preview security](/platform/preview-security) for the trust model.

## Save and publish

Choose **Save draft** to persist unpublished content and history in Convex. Creating or deleting files and uploading media remain staged operations until publish.

Choose **Publish** to review the entire change set. RepoPress commits it to a publish lane and opens or reuses a pull request. The live site changes only after the repository's normal merge and deployment process completes.

If repository, draft, or staged-operation authority changed after planning, publish returns a conflict. Refresh and review the new state instead of bypassing the guard.

## Continue

- [Component authoring](/components/authoring)
- [Build a component extension](/tutorials/component-extension)
- [Platform architecture](/platform/architecture)
