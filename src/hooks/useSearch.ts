import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { searchApi } from "@/lib/tauri";

const SEARCH_DEBOUNCE_MS = 300;

export function useSearch() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [query]);

  const searchQuery = useQuery({
    queryKey: ["server-search", debouncedQuery],
    queryFn: () => searchApi.search(debouncedQuery),
    enabled: debouncedQuery.length > 0,
    staleTime: 30_000,
  });

  const reset = useCallback(() => {
    setQuery("");
    setDebouncedQuery("");
  }, []);

  return {
    query,
    setQuery,
    debouncedQuery,
    results: debouncedQuery ? (searchQuery.data ?? []) : [],
    isLoading: debouncedQuery.length > 0 && searchQuery.isLoading,
    error: searchQuery.error,
    reset,
  };
}
