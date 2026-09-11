import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '../../../shared/auth/auth.store';

export default function AdminTransparencyExternalInvestmentsPage() {
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        // Server contract: GET /api/admin/transparency/external-investments
        const res = await api.get('/admin/transparency/external-investments');
        setData(res.data);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <Loader2 className="mx-auto h-8 w-8 animate-spin text-slate-500" />;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black text-white">Investimentos externos</h1>
      <pre className="overflow-auto rounded-2xl border border-white/10 bg-slate-950 p-4 text-xs text-slate-300">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}
