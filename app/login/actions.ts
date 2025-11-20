"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"

export async function loginWithPAT(formData: FormData) {
  const token = formData.get("token") as string

  if (!token) {
    throw new Error("Token is required")
  }

  const cookieStore = await cookies()
  cookieStore.set("github_pat", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  })

  redirect("/dashboard")
}
