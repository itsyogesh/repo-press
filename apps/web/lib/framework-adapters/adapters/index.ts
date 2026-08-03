import type { FrameworkAdapter } from "../types"
import { astroAdapter } from "./astro"
import { blumeAdapter } from "./blume"
import { contentlayerAdapter } from "./contentlayer"
import { customAdapter } from "./custom"
import { docusaurusAdapter } from "./docusaurus"
import { fumadocsAdapter } from "./fumadocs"
import { hugoAdapter } from "./hugo"
import { jekyllAdapter } from "./jekyll"
import { nextMdxAdapter } from "./next-mdx"
import { nextraAdapter } from "./nextra"

export const allAdapters: FrameworkAdapter[] = [
  blumeAdapter,
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
  blumeAdapter,
  contentlayerAdapter,
  customAdapter,
  docusaurusAdapter,
  fumadocsAdapter,
  hugoAdapter,
  jekyllAdapter,
  nextMdxAdapter,
  nextraAdapter,
}
