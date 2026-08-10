import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { fetchModelCatalog, fetchProviderConnections, connectProvider, disconnectProvider } from '@/lib/api';
import type { ModelInfo, ProviderConnection } from '@/types';
import {
  Cpu, Cloud, CheckCircle2, Download, Trash2, Loader2,
  Boxes, Zap, Eye, Brain, Code, Wrench, RefreshCw,
} from 'lucide-react';

const PROVIDERS = [
  { id: 'openrouter', name: 'OpenRouter', description: 'Access 100+ AI models', isLocal: false },
  { id: 'github-models', name: 'GitHub Models', description: 'Free tier AI models from GitHub', isLocal: false },
  { id: 'nvidia', name: 'NVIDIA', description: 'NVIDIA NIM API endpoints', isLocal: false },
  { id: 'hugging-face', name: 'Hugging Face', description: 'Open-source model hub', isLocal: false },
];

const CATEGORIES = [
  { key: 'coding', label: 'Coding', icon: Code },
  { key: 'general', label: 'General', icon: Boxes },
  { key: 'reasoning', label: 'Reasoning', icon: Brain },
  { key: 'vision', label: 'Vision', icon: Eye },
  { key: 'fast', label: 'Fast', icon: Zap },
];

export function ModelsView() {
  const { user } = useAuth();
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [connections, setConnections] = useState<ProviderConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [installingModels, setInstallingModels] = useState<Set<string>>(new Set());
  const [installedModels, setInstalledModels] = useState<Set<string>>(new Set(['qwen2.5-coder-7b', 'llama3.2-3b']));
  const [activeTab, setActiveTab] = useState<'local' | 'cloud'>('local');

  useEffect(() => {
    Promise.all([fetchModelCatalog(), fetchProviderConnections()])
      .then(([modelData, connData]) => {
        setModels(modelData as ModelInfo[]);
        setConnections(connData as ProviderConnection[]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const isProviderConnected = (providerId: string) => connections.some(c => c.provider_id === providerId);

  const handleConnect = async (providerId: string, providerName: string) => {
    if (!user) return;
    await connectProvider(providerId, providerName);
    const data = await fetchProviderConnections();
    setConnections(data as ProviderConnection[]);
  };

  const handleDisconnect = async (providerId: string) => {
    await disconnectProvider(providerId);
    setConnections(prev => prev.filter(c => c.provider_id !== providerId));
  };

  const handleInstall = (modelId: string) => {
    setInstallingModels(prev => new Set([...prev, modelId]));
    setTimeout(() => {
      setInstallingModels(prev => {
        const next = new Set(prev);
        next.delete(modelId);
        return next;
      });
      setInstalledModels(prev => new Set([...prev, modelId]));
    }, 2000);
  };

  const handleUninstall = (modelId: string) => {
    setInstalledModels(prev => {
      const next = new Set(prev);
      next.delete(modelId);
      return next;
    });
  };

  const localModels = models.filter(m => m.local_supported);
  const cloudModels = models.filter(m => !m.local_supported);

  return (
    <div className="max-w-4xl mx-auto p-8 animate-fade-in">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-content-primary">Models & Providers</h1>
        <p className="text-sm text-content-secondary mt-0.5">Manage your local and cloud AI models</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-ark-navy-900 rounded-lg w-fit mb-6">
        <button
          onClick={() => setActiveTab('local')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all ${
            activeTab === 'local' ? 'bg-ark-blue-500 text-white' : 'text-content-secondary hover:text-content-primary'
          }`}
        >
          <Cpu className="w-4 h-4" />
          Local AI
        </button>
        <button
          onClick={() => setActiveTab('cloud')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all ${
            activeTab === 'cloud' ? 'bg-ark-blue-500 text-white' : 'text-content-secondary hover:text-content-primary'
          }`}
        >
          <Cloud className="w-4 h-4" />
          Cloud AI
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-content-tertiary">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : activeTab === 'local' ? (
        <div className="space-y-6">
          {CATEGORIES.map(cat => {
            const catModels = localModels.filter(m => m.category === cat.key);
            if (catModels.length === 0) return null;
            return (
              <div key={cat.key}>
                <div className="flex items-center gap-2 mb-3">
                  <cat.icon className="w-4 h-4 text-content-secondary" />
                  <h2 className="text-sm font-semibold text-content-primary">{cat.label}</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {catModels.map(model => (
                    <ModelCard
                      key={model.id}
                      model={model}
                      installed={installedModels.has(model.model_id)}
                      installing={installingModels.has(model.model_id)}
                      onInstall={() => handleInstall(model.model_id)}
                      onUninstall={() => handleUninstall(model.model_id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3">
          {PROVIDERS.map(provider => {
            const connected = isProviderConnected(provider.id);
            const providerModels = cloudModels.filter(m =>
              m.provider.toLowerCase().includes(provider.id.replace('-', ' ').split(' ')[0])
            );
            return (
              <div key={provider.id} className="ark-card p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      connected ? 'bg-ark-accent-green/10' : 'bg-ark-navy-800 border border-surface-border'
                    }`}>
                      <Cloud className={`w-5 h-5 ${connected ? 'text-ark-accent-green' : 'text-content-tertiary'}`} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-content-primary">{provider.name}</p>
                      <p className="text-xs text-content-tertiary">{provider.description}</p>
                      {providerModels.length > 0 && (
                        <p className="text-2xs text-content-tertiary mt-0.5">{providerModels.length} models available</p>
                      )}
                    </div>
                  </div>
                  {connected ? (
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1.5 text-xs text-ark-accent-green">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Connected
                      </span>
                      <button onClick={() => handleDisconnect(provider.id)} className="ark-btn-ghost text-xs !text-ark-accent-red">
                        Disconnect
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => handleConnect(provider.id, provider.name)} className="ark-btn-secondary text-xs">
                      Connect
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Connected provider models */}
          {connections.length > 0 && (
            <div className="mt-6">
              <h2 className="text-sm font-semibold text-content-primary mb-3">Available Cloud Models</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {cloudModels.map(model => (
                  <CloudModelCard key={model.id} model={model} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ModelCard({ model, installed, installing, onInstall, onUninstall }: {
  model: ModelInfo;
  installed: boolean;
  installing: boolean;
  onInstall: () => void;
  onUninstall: () => void;
}) {
  return (
    <div className="ark-card p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-content-primary truncate">{model.name}</h3>
            {model.is_recommended && (
              <span className="text-2xs bg-ark-blue-500/15 text-ark-blue-300 px-1.5 py-0.5 rounded">Recommended</span>
            )}
          </div>
          <p className="text-xs text-content-tertiary mt-0.5">{model.provider}</p>
        </div>
        {installed && (
          <span className="flex items-center gap-1 text-xs text-ark-accent-green shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5" />
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {model.coding && <Tag icon={Code} label="Coding" />}
        {model.reasoning && <Tag icon={Brain} label="Reasoning" />}
        {model.vision && <Tag icon={Eye} label="Vision" />}
        {model.tool_calling && <Tag icon={Wrench} label="Tools" />}
        <Tag label={`${model.context_length?.toLocaleString() ?? '?'} ctx`} muted />
        <Tag label={model.model_size ?? '?'} muted />
      </div>

      {installed ? (
        <button onClick={onUninstall} className="ark-btn-secondary w-full text-xs !py-2">
          <Trash2 className="w-3.5 h-3.5" />
          Remove Model
        </button>
      ) : installing ? (
        <button disabled className="ark-btn-secondary w-full text-xs !py-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Downloading...
        </button>
      ) : (
        <button onClick={onInstall} className="ark-btn-primary w-full text-xs !py-2">
          <Download className="w-3.5 h-3.5" />
          Download
        </button>
      )}
    </div>
  );
}

function CloudModelCard({ model }: { model: ModelInfo }) {
  return (
    <div className="ark-card p-3.5">
      <div className="flex items-start justify-between mb-2">
        <h3 className="text-sm font-medium text-content-primary truncate">{model.name}</h3>
        <span className="text-2xs text-content-tertiary shrink-0">{model.provider}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {model.coding && <Tag icon={Code} label="Coding" />}
        {model.reasoning && <Tag icon={Brain} label="Reasoning" />}
        {model.vision && <Tag icon={Eye} label="Vision" />}
        <Tag label={`${model.context_length?.toLocaleString() ?? '?'} ctx`} muted />
      </div>
    </div>
  );
}

function Tag({ icon: Icon, label, muted }: { icon?: React.ComponentType<{ className?: string }>; label: string; muted?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 text-2xs px-1.5 py-0.5 rounded ${
      muted ? 'bg-ark-navy-800 text-content-tertiary' : 'bg-ark-blue-500/10 text-ark-blue-300'
    }`}>
      {Icon && <Icon className="w-2.5 h-2.5" />}
      {label}
    </span>
  );
}
