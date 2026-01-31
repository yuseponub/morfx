import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    // Authenticated users go to CRM
    redirect("/crm")
  } else {
    // Unauthenticated users go to login
    redirect("/login")
  }
}
