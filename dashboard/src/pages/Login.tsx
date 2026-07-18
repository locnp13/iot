import { useState, type FormEvent } from 'react';
import { Navigate, Link, useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/apiClient';
import { useCurrentUser } from '../lib/useCurrentUser';
import { ErrorMessage } from '../components/ErrorMessage';

export function Login() {
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const mutation = useMutation({
    mutationFn: () => api.login(email, password),
    onSuccess: (loggedInUser) => {
      queryClient.setQueryData(['currentUser'], loggedInUser);
      navigate('/devices');
    },
  });

  if (!userLoading && user) return <Navigate to="/devices" replace />;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate();
  }

  return (
    <div className="mx-auto mt-16 w-full max-w-sm">
      <h1 className="mb-6 text-xl font-semibold">Log in</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        {mutation.isError && (
          <ErrorMessage
            message={mutation.error instanceof ApiError ? mutation.error.message : 'Something went wrong'}
          />
        )}
        <button
          type="submit"
          disabled={mutation.isPending}
          className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {mutation.isPending ? 'Logging in…' : 'Log in'}
        </button>
      </form>
      <p className="mt-4 text-sm text-muted-foreground">
        No account? <Link to="/register" className="text-primary hover:underline">Register</Link>
      </p>
    </div>
  );
}
