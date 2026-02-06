/**
 * Agent Sandbox Page
 * Phase 15: Agent Sandbox
 *
 * Main page for testing agent conversations without affecting real data.
 */

import { SandboxLayout } from './components/sandbox-layout'

export const metadata = {
  title: 'Agent Sandbox | MorfX',
  description: 'Prueba agentes de conversacion sin afectar datos reales',
}

export default function SandboxPage() {
  return <SandboxLayout />
}
