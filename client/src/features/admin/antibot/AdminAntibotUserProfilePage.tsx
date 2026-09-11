import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { api } from '../../../shared/auth/auth.store';

export default function AdminAntibotUserProfilePage() {
  const { id } = useParams();
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      try {
        const res = await api.get(`/admin/antibot/users/${id}`);
        setData(res.data);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return <Loader2 className="mx-auto h-8 w-8 animate-spin text-slate-500" />;

  return (
    <div className="space-y-4">
      <Link to="/admin/antibot" className="text-xs font-bold text-amber-400">
        ← Antibot
      </Link>
      <h1 className="text-2xl font-black text-white">Perfil antibot #{id}</h1>
      <pre className="overflow-auto rounded-2xl border border-white/10 bg-slate-950 p-4 text-xs text-slate-300">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}
