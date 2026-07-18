import type { ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { BatteryFull, SignOut } from '@phosphor-icons/react';
import { api } from './lib/apiClient';
import { useCurrentUser } from './lib/useCurrentUser';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { DeviceList } from './pages/DeviceList';
import { DeviceDetail } from './pages/DeviceDetail';

const queryClient = new QueryClient();

function RequireAuth({ children }: { children: ReactNode }) {
  const { data: user, isLoading, isError } = useCurrentUser();
  if (isLoading) return <p className="mt-10 text-center text-sm text-muted-foreground">Loading…</p>;
  if (isError || !user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function Header() {
  const { data: user } = useCurrentUser();
  const rqClient = useQueryClient();

  async function handleLogout() {
    await api.logout();
    rqClient.setQueryData(['currentUser'], null);
  }

  if (!user) return null;

  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <Link to="/devices" className="flex items-center gap-2 text-sm font-semibold">
          <BatteryFull size={22} weight="fill" className="text-primary" />
          Battery Health Dashboard
        </Link>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <SignOut size={16} />
          Log out
        </button>
      </div>
    </header>
  );
}

function AppRoutes() {
  return (
    <BrowserRouter>
      <Header />
      <main className="mx-auto max-w-3xl px-4 pb-16">
        <Routes>
          <Route path="/" element={<Navigate to="/devices" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="/devices"
            element={
              <RequireAuth>
                <DeviceList />
              </RequireAuth>
            }
          />
          <Route
            path="/devices/:id"
            element={
              <RequireAuth>
                <DeviceDetail />
              </RequireAuth>
            }
          />
        </Routes>
      </main>
    </BrowserRouter>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppRoutes />
    </QueryClientProvider>
  );
}

export default App;
