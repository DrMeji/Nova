import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ArkLogo } from '@/components/branding/ArkLogo';
import { Loader2, Mail, Lock, User, AlertCircle, Eye, EyeOff } from 'lucide-react';

export function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result = mode === 'signin'
      ? await signIn(email.trim(), password)
      : await signUp(email.trim(), password, displayName.trim() || undefined);
    setLoading(false);
    if (result.error) {
      setError(result.error);
    }
  };

  return (
    <div className="min-h-screen bg-ark-navy-950 flex flex-col items-center justify-center px-4 relative overflow-hidden">
      {/* Ambient background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-ark-blue-500/8 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-ark-blue-600/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-[400px] animate-fade-in">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <ArkLogo size={56} />
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-content-primary">ARK</h1>
          <p className="mt-1 text-sm text-content-secondary">AI Creation Studio</p>
        </div>

        {/* Auth card */}
        <div className="ark-card p-6 animate-slide-up">
          <div className="flex gap-1 p-1 bg-ark-navy-900 rounded-lg mb-5">
            <button
              onClick={() => { setMode('signin'); setError(null); }}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                mode === 'signin' ? 'bg-ark-blue-500 text-white' : 'text-content-secondary hover:text-content-primary'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setMode('signup'); setError(null); }}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                mode === 'signup' ? 'bg-ark-blue-500 text-white' : 'text-content-secondary hover:text-content-primary'
              }`}
            >
              Create Account
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-xs font-medium text-content-secondary mb-1.5">Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-tertiary" />
                  <input
                    type="text"
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    placeholder="Your name"
                    className="ark-input pl-10"
                  />
                </div>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-content-secondary mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-tertiary" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="ark-input pl-10"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-content-secondary mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-tertiary" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'At least 6 characters' : 'Your password'}
                  className="ark-input pl-10 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-content-tertiary hover:text-content-secondary"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 text-sm text-ark-accent-red bg-ark-accent-red/10 border border-ark-accent-red/20 rounded-lg px-3 py-2.5 animate-fade-in">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button type="submit" disabled={loading} className="ark-btn-primary w-full">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {mode === 'signin' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
        </div>

        <p className="text-center mt-6 text-xs text-content-tertiary">
          Build anything. Powered by everything.
        </p>
      </div>
    </div>
  );
}
