import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getOrCreateIdentity } from '../lib/tauri'

type Step = 'welcome' | 'generating' | 'done'

export function OnboardingScreen() {
  const [step, setStep] = useState<Step>('welcome')
  const [did, setDid] = useState<string | null>(null)
  const navigate = useNavigate()

  async function handleGenerate() {
    setStep('generating')
    try {
      const result = await getOrCreateIdentity()
      setDid(result.did)
      setStep('done')
    } catch (err) {
      console.error(err)
      setStep('welcome')
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 font-mono flex items-center justify-center p-8">
      <div className="max-w-lg w-full space-y-8">
        {/* Logo */}
        <div className="text-center">
          <div className="text-5xl mb-4">⬡</div>
          <h1 className="text-2xl font-semibold tracking-tight">Supply Chain OS</h1>
          <p className="text-gray-500 text-sm mt-1">Sovereign Node — local-first, P2P, no central server</p>
        </div>

        {step === 'welcome' && (
          <div className="space-y-6">
            <div className="bg-gray-900 rounded-lg border border-gray-800 p-6 space-y-4 text-sm">
              <p className="text-gray-300">
                Your node is a self-contained supply chain operating system. All data lives on this machine.
              </p>
              <ul className="text-gray-500 space-y-2">
                <li>● No cloud database — your state, your hardware</li>
                <li>● Every transaction is cryptographically signed by you</li>
                <li>● Trading partners connect directly via P2P — no middleman</li>
                <li>● Your identity is a cryptographic keypair, not a username</li>
              </ul>
            </div>
            <button
              onClick={handleGenerate}
              className="w-full py-3 bg-teal-600 hover:bg-teal-500 text-white rounded-lg font-semibold transition-colors"
            >
              Generate Node Identity
            </button>
          </div>
        )}

        {step === 'generating' && (
          <div className="text-center space-y-4">
            <div className="text-teal-400 animate-pulse text-lg">Generating ed25519 keypair…</div>
            <div className="text-gray-600 text-xs">Deriving DID from public key</div>
          </div>
        )}

        {step === 'done' && did && (
          <div className="space-y-6">
            <div className="bg-gray-900 rounded-lg border border-teal-800/50 p-6 space-y-3">
              <div className="text-xs text-teal-400 uppercase tracking-widest font-semibold">
                Your Node Identity
              </div>
              <div className="text-gray-300 break-all text-xs leading-relaxed">{did}</div>
              <div className="text-gray-600 text-xs">
                Your secret key is stored securely in this device's OS keychain.
                Share your DID with trading partners to connect.
              </div>
            </div>
            <button
              onClick={() => navigate('/')}
              className="w-full py-3 bg-teal-600 hover:bg-teal-500 text-white rounded-lg font-semibold transition-colors"
            >
              Open Node Dashboard →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
