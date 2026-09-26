import { CredentialTab } from './CredentialTab';
import { StreamersMinerShowcase } from './components/StreamersMinerShowcase';

export default function CreatorPage() {
  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-20">
      <StreamersMinerShowcase />
      <CredentialTab />
    </div>
  );
}
