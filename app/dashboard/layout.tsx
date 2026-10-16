import JournalShell from '@/components/journal/shell'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <JournalShell>{children}</JournalShell>
}