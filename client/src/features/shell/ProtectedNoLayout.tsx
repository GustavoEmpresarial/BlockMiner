import { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../shared/auth/auth.store';

/** Authenticated routes without sidebar/header — fullscreen minigame sessions. */
export default function ProtectedNoLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authHydrated = useAuthStore((s) => s.authHydrated);
  const checkSession = useAuthStore((s) => s.checkSession);

  useEffect(() => {
    void checkSession({ silent: true });
  }, [checkSession]);

  if (!authHydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
