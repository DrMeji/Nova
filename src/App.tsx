import { ThemeProvider } from '@/context/ThemeContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { RouterProvider, useRouter } from '@/context/RouterContext';
import { RecentProjectsProvider, useRecentProjects } from '@/context/RecentProjectsContext';
import { AuthScreen } from '@/components/auth/AuthScreen';
import { OnboardingScreen } from '@/components/onboarding/OnboardingScreen';
import { AppShell } from '@/components/AppShell';
import { TitleBar } from '@/components/TitleBar';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Dashboard } from '@/views/Dashboard';
import { ProjectsView } from '@/views/ProjectsView';
import { ProjectWorkspace } from '@/views/ProjectWorkspace';
import { AIChat } from '@/views/AIChat';
import { BuildRun } from '@/views/BuildRun';
import { ModelsView } from '@/views/ModelsView';
import { LocalAI } from '@/views/LocalAI';
import { McpView } from '@/views/McpView';
import { BrainView } from '@/views/BrainView';
import { Settings } from '@/views/Settings';
import { NotificationsView } from '@/views/NotificationsView';
import { SocialProvider } from '@/context/SocialContext';
import { PinLockGate } from '@/components/PinLockGate';
import { isCodeTabEnabled, isSocialParked } from '@/lib/featurePark';
import { requestOpenChatCode } from '@/lib/openChatCode';
import { runCleanBootIfNeeded } from '@/lib/clearSession';
import { runSocialReleaseCleanIfNeeded, runArkIdRotationIfNeeded } from '@/lib/socialCleanBoot';
import { getLocalPrefs } from '@/lib/localPrefs';
import { applyLocalAppearancePrefs } from '@/lib/applyLocalAppearance';
import { startModelHuntCycle } from '@/lib/novaHuntBootstrap';
import { needsFirstRunSetup } from '@/lib/setup';
import { cancelAll, hasChatInflight, subscribeChatInflight } from '@/lib/chatInflight';
import { useEffect, useRef, useState, type ReactNode, lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { RotatingTip } from '@/components/RotatingTip';

const NetworkingView = lazy(() =>
  import('@/views/NetworkingView').then((m) => ({ default: m.NetworkingView })),
);
const MessageView = lazy(() =>
  import('@/views/MessageView').then((m) => ({ default: m.MessageView })),
);

runCleanBootIfNeeded();
runArkIdRotationIfNeeded();
runSocialReleaseCleanIfNeeded();

/** Old Code / Project workspace routes redirect into Chat. Code overlay stays closed until the Code pill. */
function LegacyCodeRedirect({ projectId }: { projectId?: string }) {
  const { navigate } = useRouter();
  useEffect(() => {
    navigate({ name: 'chat' });
    // Bind project into the chat studio if we have an id — do not auto-open the Code overlay.
    if (projectId) {
      requestOpenChatCode({ projectId, openOverlay: false });
    }
  }, [navigate, projectId]);
  return (
    <div className="h-full flex items-center justify-center text-sm text-content-tertiary">
      Opening chat…
    </div>
  );
}

function LazyPane({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="h-full flex items-center justify-center text-sm text-content-tertiary">
          Loading…
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

function AppRoutes() {
  const { route, navigate } = useRouter();
  const [keepChatAlive, setKeepChatAlive] = useState(() => hasChatInflight());

  useEffect(() => subscribeChatInflight(() => setKeepChatAlive(hasChatInflight())), []);

  // Social tabs stay in the sidebar as Soon, but are not navigable.
  useEffect(() => {
    if (route.name === 'networking' && isSocialParked('networking')) {
      navigate({ name: 'chat' });
      return;
    }
    if ((route.name === 'message' || route.name === 'call') && isSocialParked('message')) {
      navigate({ name: 'chat' });
    }
  }, [route.name, navigate]);

  const showChat = route.name === 'chat' || keepChatAlive;
  const chatVisible = route.name === 'chat';

  let other: ReactNode = null;
  if (route.name !== 'chat') {
    switch (route.name) {
      case 'dashboard': other = <Dashboard />; break;
      case 'projects': other = <ProjectsView />; break;
      case 'code':
        other = isCodeTabEnabled() ? <ProjectWorkspace /> : <LegacyCodeRedirect />;
        break;
      case 'project':
        other = isCodeTabEnabled()
          ? <ProjectWorkspace />
          : <LegacyCodeRedirect projectId={route.id} />;
        break;
      case 'creation':
        // Legacy image/video creations — History only.
        other = <Dashboard />;
        break;
      case 'models': other = <ModelsView />; break;
      case 'build': other = <BuildRun />; break;
      case 'local-ai': other = <LocalAI />; break;
      case 'mcp': other = <McpView />; break;
      case 'brain': other = <BrainView />; break;
      case 'networking':
        other = isSocialParked('networking')
          ? null
          : <LazyPane><NetworkingView /></LazyPane>;
        break;
      case 'message':
        other = isSocialParked('message')
          ? null
          : <LazyPane><MessageView /></LazyPane>;
        break;
      case 'notifications': other = <NotificationsView />; break;
      case 'call':
        other = isSocialParked('message')
          ? null
          : <LazyPane><MessageView /></LazyPane>;
        break;
      case 'settings': other = <Settings />; break;
      default: other = <Dashboard />; break;
    }
  }

  return (
    <>
      {showChat && (
        <div className={chatVisible ? 'h-full min-h-0' : 'hidden'} aria-hidden={!chatVisible}>
          {/* Stable mount: Chat ↔ Image and Settings hops must not kill in-flight gens */}
          <ErrorBoundary boundaryId="chat" fallbackTitle="Chat pane hit an error">
            <AIChat />
          </ErrorBoundary>
        </div>
      )}
      {!chatVisible && (
        <div className="h-full min-h-0 flex flex-col overflow-hidden">
          <ErrorBoundary
            boundaryId={route.name === 'code' || route.name === 'project' ? 'workspace' : 'route'}
            fallbackTitle="This view hit an error"
          >
            {other}
          </ErrorBoundary>
        </div>
      )}
    </>
  );
}

function AppContent() {
  const { user, profile, loading, bypass } = useAuth();
  const [setupTick, setSetupTick] = useState(0);

  useEffect(() => {
    // Clear stale inflight from a prior crash / HMR so Chat is not stuck mounted.
    cancelAll();
  }, []);

  useEffect(() => {
    const applyPrefs = () => {
      const p = getLocalPrefs();
      document.documentElement.style.fontSize = `${p.fontSizePx || 16}px`;
      document.documentElement.dataset.density = p.density;
      void import('@/lib/workspaceGrants').then(m => m.syncWorkspaceGrantsFromPrefs());
    };
    applyPrefs();
    window.addEventListener('nova:prefs-changed', applyPrefs);
    return () => window.removeEventListener('nova:prefs-changed', applyPrefs);
  }, []);

  useEffect(() => {
    void window.novaDesktop?.appMeta?.().then((meta) => {
      if (!meta?.isPackaged) return;
      if (getLocalPrefs().launchOnStartup) {
        void window.novaDesktop?.loginItemSet?.(true);
      }
    });
  }, []);

  useEffect(() => {
    const onSetup = () => setSetupTick(t => t + 1);
    window.addEventListener('NOVA:setup-changed', onSetup);
    return () => window.removeEventListener('NOVA:setup-changed', onSetup);
  }, []);

  if (loading) {
    return (
      <div className="h-full bg-nova-navy-950 flex flex-col items-center justify-center gap-4 px-6">
        <Loader2 className="w-6 h-6 text-content-secondary animate-spin" />
        <RotatingTip className="text-[11px] text-content-tertiary text-center leading-relaxed max-w-sm min-h-[2.5rem]" />
      </div>
    );
  }

  // Always Auth first on real installs. Guest is allowed only via explicit bypass (dev/bat).
  if (!user || (user.id === 'guest-local' && !bypass)) {
    return <AuthScreen />;
  }

  // Machine install flag is source of truth. Sign-out must not re-force setup when
  // brains are already on this PC — cloud onboarding_completed is synced separately.
  void setupTick;
  if (needsFirstRunSetup()) {
    return <OnboardingScreen />;
  }

  return (
    <RecentProjectsProvider>
      <SocialProvider>
        <PinLockGate>
        <AppShell>
          <HuntOnLaunch />
          <AppearancePrefsSync />
          <OpenLastProjectOnLaunch />
          <AppRoutes />
        </AppShell>
        </PinLockGate>
      </SocialProvider>
    </RecentProjectsProvider>
  );
}

function HuntOnLaunch() {
  useEffect(() => startModelHuntCycle(), []);
  useEffect(() => {
    // Warm BrainProfile once so Chat gates have a cached probe.
    void import('@/lib/brainProfile').then((m) => m.getBrainProfile(true));
  }, []);
  return null;
}

function AppearancePrefsSync() {
  useEffect(() => {
    applyLocalAppearancePrefs();
    const onPrefs = () => applyLocalAppearancePrefs();
    window.addEventListener('nova:prefs-changed', onPrefs);
    return () => window.removeEventListener('nova:prefs-changed', onPrefs);
  }, []);
  return null;
}

function OpenLastProjectOnLaunch() {
  const { recent } = useRecentProjects();
  const { navigate } = useRouter();
  const did = useRef(false);
  useEffect(() => {
    if (did.current) return;
    if (!isCodeTabEnabled()) return;
    if (!getLocalPrefs().openLastProjectOnLaunch) return;
    const last = recent[0];
    if (!last?.id) return;
    did.current = true;
    navigate({ name: 'project', id: last.id });
  }, [recent, navigate]);
  return null;
}

function App() {
  // GitHub-only gate — missing Supabase keys must not brick the desktop shell.
  return (
    <ThemeProvider>
      {/* Full-bleed shell; title controls overlay so sidebar padding is even top/bottom */}
      <div className="h-screen min-w-0 relative overflow-hidden bg-nova-navy-950">
        <ErrorBoundary boundaryId="shell" fallbackTitle="NOVA hit an error">
          <AuthProvider>
            <RouterProvider>
              <TitleBar />
              <div className="h-full overflow-hidden">
                <AppContent />
              </div>
            </RouterProvider>
          </AuthProvider>
        </ErrorBoundary>
      </div>
    </ThemeProvider>
  );
}

export default App;
