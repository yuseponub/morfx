import { ebGaramond, inter, jetbrainsMono } from './fonts'

export default function WhatsAppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className={`${ebGaramond.variable} ${inter.variable} ${jetbrainsMono.variable} h-full`}>
      {children}
    </div>
  )
}
