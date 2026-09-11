import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getAdminUser, readAxiosResponseMessage } from '../lib/admin.api';

export default function AdminUserDetailPage() {
  const { id } = useParams();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      setLoading(true);
      try {
        const res = await getAdminUser(id);
        setData(res.data as Record<string, unknown>);
      } catch (err) {
        toast.error(readAxiosResponseMessage(err) ?? 'Erro ao carregar usuário');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Link to="/admin/users" className="text-xs font-bold text-amber-400">
        ← Voltar
      </Link>
      <h1 className="text-2xl font-black text-white">Usuário #{id}</h1>
      <pre className="max-h-[70vh] overflow-auto rounded-2xl border border-white/10 bg-slate-950/80 p-4 text-xs text-slate-300">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}
