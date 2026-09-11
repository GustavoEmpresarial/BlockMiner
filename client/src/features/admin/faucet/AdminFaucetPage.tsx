import { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { getAdminFaucetConfig, putAdminFaucetConfig, readAxiosResponseMessage } from '../lib/admin.api';

export default function AdminFaucetPage() {
  const [json, setJson] = useState('{}');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await getAdminFaucetConfig();
        setJson(JSON.stringify(res.data, null, 2));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const body = JSON.parse(json) as unknown;
      await putAdminFaucetConfig(body);
      toast.success('Config salva');
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loader2 className="mx-auto h-8 w-8 animate-spin text-slate-500" />;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black text-white">Faucet (config)</h1>
      <textarea value={json} onChange={(e) => setJson(e.target.value)} className="h-96 w-full rounded-2xl border border-white/10 bg-slate-950 p-4 font-mono text-xs text-slate-200" />
      <button type="button" disabled={saving} onClick={() => void save()} className="inline-flex items-center gap-2 rounded-xl bg-amber-500/20 px-4 py-2 text-xs font-bold text-amber-300">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Salvar
      </button>
    </div>
  );
}
