/**
 * Auth Store
 * Manages Supabase authentication state and tenant context
 * Architecture: Supabase Auth → Zustand → UI
 */
import { create } from 'zustand';
import { supabase } from '@/lib/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

export interface UserProfile {
  id: string;
  auth_id: string;
  tenant_id: string;
  name: string;
  email: string;
  role: 'admin' | 'operator' | 'barber';
  avatar_url?: string | null;
}

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  tenantId: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ success: boolean }>;
  signUp: (email: string, password: string, name: string) => Promise<{ success: boolean }>;
  signOut: () => Promise<void>;
  setError: (error: string | null) => void;
  refreshProfile: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  profile: null,
  tenantId: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  initialize: async () => {
    set({ isLoading: true });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        set({ user: session.user, session, isAuthenticated: true });
        await get().refreshProfile();
      } else {
        set({ isAuthenticated: false });
      }
      supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          set({ user: session.user, session, isAuthenticated: true });
          await get().refreshProfile();
        } else if (event === 'SIGNED_OUT') {
          set({ user: null, session: null, profile: null, tenantId: null, isAuthenticated: false });
        } else if (event === 'TOKEN_REFRESHED' && session) {
          set({ session });
        }
      });
    } catch (err: any) {
      set({ error: err?.message || 'Auth initialization failed' });
    } finally {
      set({ isLoading: false });
    }
  },

  signIn: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (data.user) {
        set({ user: data.user, session: data.session, isAuthenticated: true });
        await get().refreshProfile();
      }
      return { success: true };
    } catch (err: any) {
      set({ error: err?.message || 'Error al iniciar sesión' });
      return { success: false };
    } finally {
      set({ isLoading: false });
    }
  },

  signUp: async (email: string, password: string, name: string) => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } },
      });
      if (error) throw error;
      if (data.user) {
        set({ user: data.user, session: data.session, isAuthenticated: !!data.session });
        if (data.session) await get().refreshProfile();
      }
      return { success: true };
    } catch (err: any) {
      set({ error: err?.message || 'Error al crear cuenta' });
      return { success: false };
    } finally {
      set({ isLoading: false });
    }
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, session: null, profile: null, tenantId: null, isAuthenticated: false });
  },

  setError: (error: string | null) => set({ error }),

  refreshProfile: async () => {
    const user = get().user;
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, auth_id, tenant_id, name, email, role, avatar_url')
        .eq('auth_id', user.id)
        .single();
      if (error) throw error;
      if (data) {
        set({ profile: data as UserProfile, tenantId: data.tenant_id });
      }
    } catch (err: any) {
      console.warn('[Auth] Profile not found yet:', err?.message);
    }
  },
}));
