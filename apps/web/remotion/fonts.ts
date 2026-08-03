import { loadFont as loadGeistSans } from "@remotion/google-fonts/Geist"
import { loadFont as loadGeistMono } from "@remotion/google-fonts/GeistMono"

// loadFont() must be called at module level, outside any component
export const { fontFamily: geistFamily } = loadGeistSans()
export const { fontFamily: geistMonoFamily } = loadGeistMono()
