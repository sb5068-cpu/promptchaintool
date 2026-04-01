import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  // If we get a code back from Google, exchange it for a session
  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Success! Send them to the dashboard.
      return NextResponse.redirect(`${origin}/dashboard`)
    }
  }

  // If something went wrong, send them back to login with an error
  return NextResponse.redirect(`${origin}/login?error=auth-failed`)
}