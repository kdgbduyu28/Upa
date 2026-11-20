import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';
import { supabase } from './supabase';

export type Profile = { id: string; display_name: string; is_host: boolean; bio: string | null; avatar_url: string | null };

type AuthState = {
  ready: boolean;
  session: Session | null;
  profile: Profile | null;
  refreshProfile: () => Promise<void>;
};

export const useAuth = create<AuthState>((set, get) => ({
  ready: !supabase,
  session: null,
  profile: null,
  refreshProfile: async () => {
    const id = get().session?.user.id;
    if (!supabase || !id) return set({ profile: null });
    const { data } = await supabase.from('profiles').select('id, display_name, is_host, bio, avatar_url').eq('id', id).maybeSingle();
    set({ profile: (data as Profile | null) ?? null });
  },
}));

/** Call once at startup: tracks the session and loads the profile with it. */
export function startAuth() {
  if (!supabase) return () => {};
  supabase.auth.getSession().then(({ data }) => {
    useAuth.setState({ session: data.session, ready: true });
    useAuth.getState().refreshProfile();
  });
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    useAuth.setState({ session, ready: true });
    useAuth.getState().refreshProfile();
  });
  return () => data.subscription.unsubscribe();
}

export async function signIn(email: string, password: string) {
  if (!supabase) throw new Error('Not connected');
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUp(email: string, password: string, displayName: string) {
  if (!supabase) throw new Error('Not connected');
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });
  if (error) throw error;
  return { needsConfirmation: !data.session };
}

export async function signOut() {
  await supabase?.auth.signOut();
}

export const useUserId = () => useAuth((s) => s.session?.user.id ?? null);
