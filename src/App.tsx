import { ThemeProvider } from '@/context/ThemeContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { RouterProvider, useRouter } from '@/context/RouterContext';
import { RecentProjectsProvider } from '@/context/RecentProjectsContext';
import { AuthScreen } from '@/components/auth/AuthScreen';
import { OnboardingScreen } from '@/components/onboarding/OnboardingScreen';
import { AppShell } from '@/components/AppShell';
import { TitleBar } from '@/components/TitleBar';
import { Dashboard } from '@/views/Dashboard';
import { ProjectsView } from '@/views/ProjectsView';
import { ProjectWorkspace } from '@/views/ProjectWorkspace';
import { AIChat } from '@/views/AIChat';
import { ModelsView } from '@/views/ModelsView';
import { BuildRun } from '@/views/BuildRun';
import { LocalAI } from '@/views/LocalAI';
import { CreationViewer } from '@/views/CreationViewer';
import { Settings } from '@/views/Settings';
import { runCleanBootIfNeeded } from '@/lib/clearSession';
import { getLocalPrefs } from '@/lib/localPrefs';
import { needsFirstRunSetup } from '@/lib/setup';
import { UpdateOverlay } from '@/components/UpdateOverlay';
import { supabaseConfigError } from '@/lib/supabase';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

runCleanBootIfNeeded();

function AppRoutes() {
  const { route } = useRouter();

  switch (route.name) {
    case 'dashboard': return <Dashboard />;
    case 'projects': return <ProjectsView />;
    case 'project': return <ProjectWorkspace />;
    case 'creation': return <CreationViewer />;
    case 'chat': return <AIChat key={route.mode ?? 'general'} />;
    case 'models': return <ModelsView />;
    case 'build': return <BuildRun />;
    case 'local-ai': return <LocalAI />;
    case 'settings': return <Settings />;
    default: return <Dashboard />;
  }
}

function AppContent() {
  const { user, profile, loading } = useAuth();
  const [setupTick, setSetupTick] = useState(0);

  useEffect(() => {
    if (!window.arkDesktop?.loginItemSet) return;
    if (getLocalPrefs().launchOnStartup) {
      void window.arkDesktop.loginItemSet(true);
    }
  }, []);

  useEffect(() => {
    const onSetup = () => setSetupTick(t => t + 1);
    window.addEventListener('ark:setup-changed', onSetup);
    return () => window.removeEventListener('ark:setup-changed', onSetup);
  }, []);

  if (loading) {
    return (
      <div className="h-full bg-ark-navy-950 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-content-secondary animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  // Machine install flag is source of truth (sign-in and sign-up).
  // setupTick forces re-check after onboarding marks complete.
  void setupTick;
  if (needsFirstRunSetup() || !profile?.onboarding_completed) {
    return <OnboardingScreen />;
  }

  return (
    <RecentProjectsProvider>
      <AppShell>
        <AppRoutes />
      </AppShell>
    </RecentProjectsProvider>
  );
}

function App() {
  if (supabaseConfigError) {
    return (
      <div className="h-screen flex items-center justify-center bg-ark-navy-950 text-white p-8 text-center">
        <div className="max-w-md space-y-3">
          <p className="text-lg font-semibold">ARK could not start</p>
          <p className="text-sm text-white/70">{supabaseConfigError}</p>
          <p className="text-xs text-white/50">Rebuild with .env.production present, or set the Vite env vars.</p>
        </div>
      </div>
    );
  }

  return (
    <ThemeProvider>
      {/* Full-bleed shell; title controls overlay so sidebar padding is even top/bottom */}
      <div className="h-screen relative overflow-hidden bg-ark-navy-950">
        <TitleBar />
        <div className="h-full overflow-hidden">
          <AuthProvider>
            <RouterProvider>
              <AppContent />
            </RouterProvider>
          </AuthProvider>
        </div>
        <UpdateOverlay />
      </div>
    </ThemeProvider>
  );
}

export default App;
