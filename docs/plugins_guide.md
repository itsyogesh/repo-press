# RepoPress Plugin System (v1)

RepoPress supports repo-local plugins to extend the MDX preview runtime. Plugins can contribute custom components, scope variables, and allowlisted imports.

## Plugin Structure

Plugins are stored in your repository, typically under `.repopress/plugins/<plugin-id>/`.

Each plugin requires:

1. `plugin.json` - Manifest file
2. An entry file (e.g., `index.tsx`) - Implementation

### Example: `plugin.json`

```json
{
  "id": "my-custom-plugin",
  "name": "My Custom Plugin",
  "version": "1.0.0",
  "entry": "./index.tsx",
  "components": ["CustomBanner", "StatusBadge"],
  "scopeExports": ["MY_CONSTANT"]
}
```

### Example: `index.tsx`

```tsx
import { CustomBanner } from "./components/Banner";
import { StatusBadge } from "./components/Badge";

export const MY_CONSTANT = "Hello from Plugin!";

export const adapter = {
  components: {
    CustomBanner,
    StatusBadge,
  },
  scope: {
    MY_CONSTANT,
  },
  allowImports: {
    "lucide-react": { Info: true },
  },
};
```

## Enabling Plugins

Plugins must be registered in your `repopress.config.json` and then enabled per project.

### `repopress.config.json`

```json
{
  "version": 1,
  "projects": [
    {
      "id": "docs",
      "preview": {
        "plugins": ["my-custom-plugin"]
      }
    }
  ],
  "plugins": {
    "my-custom-plugin": ".repopress/plugins/my-custom-plugin/plugin.json"
  }
}
```

## Extension Points

### 1. Components

Any React component exported via `adapter.components` will be available as a global tag in your MDX files.

### 2. Scope

Variables exported via `adapter.scope` will be available in MDX expressions (e.g., `{MY_CONSTANT}`).

### 3. Allowed Imports

Modules and named exports listed in `adapter.allowImports` can be imported directly in MDX files:

```mdx
import { Info } from "lucide-react";
```

## Merging Logic

1. **Default Adapter**: Base components and scope.
2. **Plugins**: Merged in order defined in `repopress.config.json`. Later plugins override earlier ones.
3. **Project Adapter**: Overrides all plugins and the default adapter.
