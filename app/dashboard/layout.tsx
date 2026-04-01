import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // 🚨 THIS IS THE FIX: Notice the "await" right here! 🚨
  const supabase = await createClient()

  // 1. Get the current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  // 2. Check the database for Admin status safely on the server
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_superadmin, is_matrix_admin')
    .eq('id', user.id)
    .single()

  // 3. Kick them out if they aren't authorized
  if (!profile?.is_superadmin && !profile?.is_matrix_admin) {
    redirect('/login?error=unauthorized')
  }

  // 4. Render the protected dashboard
  return (
    <div className="min-h-screen bg-background text-foreground p-8">
      {children}
    </div>
  )
}