import { useState } from 'react';
import { Youtube } from 'lucide-react';
import type { AdminSocialTab } from './creators.types';
import { CreatorsFlagsTab } from './CreatorsFlagsTab';
import {
  CredentialRequestsTab,
  ProfilesTab,
  RewardSettingsPanel,
  SubmissionsTab,
} from './adminSocial.tabs';

const TABS: { id: AdminSocialTab; label: string }[] = [
  { id: 'requests', label: 'Solicitações' },
  { id: 'submissions', label: 'Vídeos' },
  { id: 'profiles', label: 'Perfis' },
  { id: 'flags', label: 'Flags' },
  { id: 'settings', label: 'Config' },
];

export default function AdminCreators() {
  const [activeTab, setActiveTab] = useState<AdminSocialTab>('requests');

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 animate-in fade-in duration-500">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center text-red-400">
          <Youtube className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl font-black text-white">Criadores & Social YouTube</h1>
          <p className="text-xs text-gray-500">Solicitações, vídeos, perfis e recompensa</p>
        </div>
      </div>

      <div className="flex gap-1 p-1 bg-white/5 rounded-2xl w-fit border border-white/8 flex-wrap" role="tablist">
        {TABS.map((t) => (
          <button
            type="button"
            key={t.id}
            role="tab"
            aria-selected={activeTab === t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${
              activeTab === t.id ? 'bg-red-600 text-white shadow-lg shadow-red-900/20' : 'text-gray-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'requests' ? <CredentialRequestsTab /> : null}
      {activeTab === 'submissions' ? <SubmissionsTab /> : null}
      {activeTab === 'profiles' ? <ProfilesTab /> : null}
      {activeTab === 'flags' ? <CreatorsFlagsTab /> : null}
      {activeTab === 'settings' ? <RewardSettingsPanel /> : null}
    </div>
  );
}
