import type { FrameworkAdapter } from "../types"
import { astroAdapter } from "./astro"
import { contentlayerAdapter } from "./contentlayer"
import { customAdapter } from "./custom"
import { docusaurusAdapter } from "./docusaurus"
import { fumadocsAdapter } from "./fumadocs"
import { hugoAdapter } from "./hugo"
import { jekyllAdapter } from "./jekyll"
import { nextMdxAdapter } from "./next-mdx"
import { nextraAdapter } from "./nextra"

export const allAdapters: FrameworkAdapter[] = [
  fumadocsAdapter,
  nextraAdapter,
  astroAdapter,
  hugoAdapter,
  docusaurusAdapter,
  jekyllAdapter,
  contentlayerAdapter,
  nextMdxAdapter,
  customAdapter,
]

export {
  astroAdapter,
  contentlayerAdapter,
  customAdapter,
  docusaurusAdapter,
  fumadocsAdapter,
  hugoAdapter,
  jekyllAdapter,
  nextMdxAdapter,
  nextraAdapter,
}
