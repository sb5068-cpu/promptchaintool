import { redirect } from "next/navigation"

export default function Home() {
  // Automatically send users to the dashboard.
  // If they aren't logged in, our dashboard/layout.tsx will bounce them to /login automatically!
  redirect("/dashboard")
}