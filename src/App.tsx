import { ThemeProvider } from '@/context/ThemeContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { RouterProvider, useRouter } from '@/context/RouterContext';
import { RecentProjectsProvider, useRecentProjects } from '@/context/RecentProjectsContext';
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
import { McpView } from '@/views/McpView';
import { BrainView } from '@/views/BrainView';
import { Settings } from '@/views/Settings';
import { NetworkingView } from '@/views/NetworkingView';
import { MessageView } from '@/views/MessageView';
import { NotificationsView } from '@/views/NotificationsView';
import { SocialProvider } from '@/context/SocialContext';
import { ParkedNotice } from '@/components/ParkedNotice';
import { PinLockGate } from '@/components/PinLockGate';
import { isSocialParked, isCodeTabEnabled } from '@/lib/featurePark';
import { requestOpenChatCode } from '@/lib/openChatCode';
import { runCleanBootIfNeeded } from '@/lib/clearSession';
import { runSocialReleaseCleanIfNeeded, runArkIdRotationIfNeeded } from '@/lib/socialCleanBoot';
import { getLocalPrefs } from '@/lib/localPrefs';
import { applyLocalAppearancePrefs } from '@/lib/applyLocalAppearance';
import { startModelHuntCycle } from '@/lib/arkHuntBootstrap';
import { needsFirstRunSetup } from '@/lib/setup';
import { supabaseConfigError } from '@/lib/supabase';
import { hasChatInflight, subscribeChatInflight } from '@/lib/chatInflight';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { RotatingTip } from '@/components/RotatingTip';

runCleanBootIfNeeded();
runArkIdRotationIfNeeded();
runSocialReleaseCleanIfNeeded();

/** Old Code / Project workspace routes redirect into Chat + Code pill. */
function LegacyCodeRedirect({ projectId }: { projectId?: string }) {
  const { navigate } = useRouter();
  useEffect(() => {
    navigate({ name: 'chat' });
    requestOpenChatCode(projectId ? { projectId } : undefined);
  }, [navigate, projectId]);
  return (
    <div className="h-full flex items-center justify-center text-sm text-content-tertiary">
      Opening Code…
    </div>
  );
}

function AppRoutes() {
  const { route } = useRouter();
  const [keepChatAlive, setKeepChatAlive] = useState(() => hasChatInflight());

  useEffect(() => subscribeChatInflight(() => setKeepChatAlive(hasChatInflight())), []);

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
        other = isSocialParked('networking') ? <ParkedNotice feature="networking" /> : <NetworkingView />;
        break;
      case 'message':
        other = isSocialParked('message') ? <ParkedNotice feature="message" /> : <MessageView />;
        break;
      case 'notifications': other = <NotificationsView />; break;
      case 'call':
        // Call removed from product — bounce to Message.
        other = isSocialParked('message') ? <ParkedNotice feature="message" /> : <MessageView />;
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
          <AIChat />
        </div>
      )}
      {!chatVisible && (
        <div className="h-full min-h-0 flex flex-col overflow-hidden">
          {other}
        </div>
      )}
    </>
  );
}

function AppContent() {
  const { user, profile, loading, bypass } = useAuth();
  const [setupTick, setSetupTick] = useState(0);

  useEffect(() => {
    const applyPrefs = () => {
      const p = getLocalPrefs();
      document.documentElement.style.fontSize = `${p.fontSizePx || 15}px`;
      document.documentElement.dataset.density = p.density;
      void import('@/lib/workspaceGrants').then(m => m.syncWorkspaceGrantsFromPrefs());
    };
    applyPrefs();
    window.addEventListener('ark:prefs-changed', applyPrefs);
    return () => window.removeEventListener('ark:prefs-changed', applyPrefs);
  }, []);

  useEffect(() => {
    void window.arkDesktop?.appMeta?.().then((meta) => {
      if (!meta?.isPackaged) return;
      if (getLocalPrefs().launchOnStartup) {
        void window.arkDesktop?.loginItemSet?.(true);
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
      <div className="h-full bg-ark-navy-950 flex flex-col items-center justify-center gap-4 px-6">
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
  return null;
}

function AppearancePrefsSync() {
  useEffect(() => {
    applyLocalAppearancePrefs();
    const onPrefs = () => applyLocalAppearancePrefs();
    window.addEventListener('ark:prefs-changed', onPrefs);
    return () => window.removeEventListener('ark:prefs-changed', onPrefs);
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
  if (supabaseConfigError) {
    return (
      <div className="h-screen flex items-center justify-center bg-ark-navy-950 text-white p-8 text-center">
        <div className="max-w-md space-y-3">
          <p className="text-lg font-semibold">NOVA could not start</p>
          <p className="text-sm text-white/70">{supabaseConfigError}</p>
          <p className="text-xs text-white/50">Rebuild with .env.production present, or set the Vite env vars.</p>
        </div>
      </div>
    );
  }

  return (
    <ThemeProvider>
      {/* Full-bleed shell; title controls overlay so sidebar padding is even top/bottom */}
      <div className="h-screen min-w-0 relative overflow-hidden bg-ark-navy-950">
        <AuthProvider>
          <RouterProvider>
            <TitleBar />
            <div className="h-full overflow-hidden">
              <AppContent />
            </div>
          </RouterProvider>
        </AuthProvider>
      </div>
    </ThemeProvider>
  );
}

export default App;
