import { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { getAdminSidebarNav, putAdminSidebarNav, readAxiosResponseMessage } from '../lib/admin.api';

export default function AdminUserSidebarPage() {
  const [json, setJson] = useState('[]');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await getAdminSidebarNav();
        const d = res.data as { entries?: unknown };
        setJson(JSON.stringify(d.entries ?? res.data, null, 2));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const entries = JSON.parse(json) as unknown;
      await putAdminSidebarNav(entries);
      toast.success('Sidebar atualizada');
    } catch (err) {
      toast.error(readAxiosResponseMessage(err) ?? 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loader2 className="mx-auto h-8 w-8 animate-spin text-slate-500" />;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black text-white">Sidebar do app (usuário)</h1>
      <textarea value={json} onChange={(e) => setJson(e.target.value)} className="h-96 w-full rounded-2xl border border-white/10 bg-slate-950 p-4 font-mono text-xs text-slate-200" />
      <button type="button" disabled={saving} onClick={() => void save()} className="rounded-xl bg-amber-500/20 px-4 py-2 text-xs font-bold text-amber-300">
        Salvar
      </button>
    </div>
  );
}
