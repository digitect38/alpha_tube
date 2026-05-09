'use client';

import { createContext, useContext, useEffect, useState } from 'react';

type Viewer = {
  id: number;
  handle: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
} | null;

type ViewerContextValue = {
  loaded: boolean;
  viewer: Viewer;
};

const ViewerContext = createContext<ViewerContextValue>({ loaded: false, viewer: null });

export function ViewerProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ViewerContextValue>({ loaded: false, viewer: null });

  useEffect(() => {
    let cancelled = false;

    fetch('/apps/video_stream/api/auth/me')
      .then(r => r.json())
      .then(d => {
        if (!cancelled) setState({ loaded: true, viewer: d.user ?? null });
      })
      .catch(() => {
        if (!cancelled) setState({ loaded: true, viewer: null });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return <ViewerContext.Provider value={state}>{children}</ViewerContext.Provider>;
}

export function useViewer() {
  return useContext(ViewerContext);
}
