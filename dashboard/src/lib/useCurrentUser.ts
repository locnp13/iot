import { useQuery } from '@tanstack/react-query';
import { api } from './apiClient';

export function useCurrentUser() {
  return useQuery({
    queryKey: ['currentUser'],
    queryFn: api.me,
    retry: false,
    // Any error (401 "not logged in", a transient 500, a network hiccup) should degrade to
    // "treat as logged out" via isError — never crash the render tree over an auth check.
  });
}
