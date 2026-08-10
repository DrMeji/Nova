import { ThemeProvider } from '@/context/ThemeContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { RouterProvider, useRouter } from '@/context/RouterContext';
import { AuthScreen } from '@/components/auth/AuthScreen';
import { OnboardingScreen } from '@/components/onboarding/OnboardingScreen';
import { AppShell } from '@/components/AppShell';
import { Dashboard } from '@/views/Dashboard';
import { ProjectsView } from '@/views/ProjectsView';
import { ProjectWorkspace } from '@/views/ProjectWorkspace';
import { AIChat } from '@/views/AIChat';
import { ModelsView } from '@/views/ModelsView';
import { BuildRun } from '@/views/BuildRun';
import { LocalAI } from '@/views/LocalAI';
import { Settings } from '@/views/Settings';
import { Loader2 } from 'lucide-react';

function AppRoutes() {
  const { route } = useRouter();

  switch (route.name) {
    case 'dashboard': return <Dashboard />;
    case 'projects': return <ProjectsView />;
    case 'project': return <ProjectWorkspace />;
    case 'chat': return <AIChat />;
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
      <div className="min-h-screen bg-ark-navy-950 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-ark-blue-400 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  if (profile && !profile.onboarding_completed) {
    return <OnboardingScreen />;
  }

  return (
    <AppShell>
      <AppRoutes />
    </AppShell>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <RouterProvider>
          <AppContent />
        </RouterProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
