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
import { Loader2 } from 'lucide-react';

// Wipe chat + Recent history once for this clean-boot token (fresh test slate).
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

  // First run only: optimize connection + hardware before the main app.
  if (!profile?.onboarding_completed) {
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
  return (
    <ThemeProvider>
      <div className="h-screen flex flex-col overflow-hidden bg-ark-navy-950">
        <TitleBar />
        <div className="flex-1 min-h-0 overflow-hidden">
          <AuthProvider>
            <RouterProvider>
              <AppContent />
            </RouterProvider>
          </AuthProvider>
        </div>
      </div>
    </ThemeProvider>
  );
}

export default App;
