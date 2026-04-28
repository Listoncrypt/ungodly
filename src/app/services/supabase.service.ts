import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, User as SupabaseUser, Session } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import { BehaviorSubject, Observable } from 'rxjs';

export interface Profile {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  role: 'user' | 'admin';
  is_approved: boolean;
  twitter_followers?: number;
  twitter_handle?: string;
  balance?: number;
}

export interface PlatformTask {
  id: string;
  title: string;
  image: string;
  post_link: string;
  actions: string;
  reward: number;
  boost: number;
  created_at?: string;
}

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private supabase: SupabaseClient;
  private currentUserSubject = new BehaviorSubject<SupabaseUser | null | undefined>(undefined);
  private currentProfileSubject = new BehaviorSubject<Profile | null | undefined>(undefined);

  currentUser$ = this.currentUserSubject.asObservable();
  currentProfile$ = this.currentProfileSubject.asObservable();

  constructor() {
    this.supabase = createClient(environment.supabase.url, environment.supabase.publicKey);
    
    // Load initial session
    this.supabase.auth.getSession().then(({ data: { session } }) => {
      this.updateUserAndProfile(session?.user ?? null);
    });

    // Listen for auth changes
    this.supabase.auth.onAuthStateChange((_event, session) => {
      this.updateUserAndProfile(session?.user ?? null);
    });
  }

  get client(): SupabaseClient {
    return this.supabase;
  }

  get currentUser(): SupabaseUser | null | undefined {
    return this.currentUserSubject.value;
  }

  get currentProfile(): Profile | null | undefined {
    return this.currentProfileSubject.value;
  }

  /**
   * Manually refresh the profile data from the database
   */
  async refreshProfile() {
    const user = this.currentUser;
    if (user) {
      await this.updateUserAndProfile(user);
    }
  }

  private async updateUserAndProfile(user: SupabaseUser | null) {
    this.currentUserSubject.next(user);
    if (user) {
      // Fetch latest profile
      const { data: profile } = await this.supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      
      this.currentProfileSubject.next(profile as Profile);

      // Subscribe to real-time changes for this specific user's profile
      this.supabase
        .channel(`public:profiles:id=eq.${user.id}`)
        .on('postgres_changes', { 
          event: '*', 
          schema: 'public', 
          table: 'profiles',
          filter: `id=eq.${user.id}`
        }, payload => {
          console.log('Real-time profile update received:', payload.new);
          this.currentProfileSubject.next(payload.new as Profile);
        })
        .subscribe();
    } else {
      this.currentProfileSubject.next(null);
      // Clean up subscriptions would be good here, but Supabase handles 
      // channel cleanup reasonably well on disconnect/signout.
    }
  }

  async updateProfile(id: string, updates: Partial<Profile>) {
    const { data, error } = await this.supabase
      .from('profiles')
      .update(updates)
      .eq('id', id);

    if (error) throw error;
    
    if (this.currentProfile?.id === id) {
      this.currentProfileSubject.next({ ...this.currentProfile, ...updates } as Profile);
    }
    return data;
  }

  async getUnapprovedUsers() {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('*')
      .eq('is_approved', false)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data as Profile[];
  }

  async getAllRegisteredUsers() {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('*')
      .eq('is_approved', true)
      .eq('role', 'user')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data as Profile[];
  }

  async approveUser(userId: string) {
    // Get user email before updating
    const { data: profile } = await this.supabase
      .from('profiles')
      .select('email')
      .eq('id', userId)
      .single();

    console.log('Approving user - Profile:', profile);

    const { data, error } = await this.supabase
      .from('profiles')
      .update({ is_approved: true })
      .eq('id', userId);

    if (error) throw error;

    // Call Edge Function to confirm user email using email instead of userId
    if (profile?.email) {
      console.log('Calling confirm-email Edge Function with email:', profile.email);
      const { data: functionData, error: functionError } = await this.supabase.functions.invoke('confirm-email', {
        body: { email: profile.email }
      });

      console.log('Edge Function response:', { data: functionData, error: functionError });

      if (functionError) {
        console.error('Failed to confirm email via Edge Function:', functionError);
        alert('User approved but email confirmation failed. Please manually confirm in Supabase Dashboard.');
        // Don't throw error - user is approved even if email confirmation fails
      } else {
        console.log('Email confirmed successfully');
      }
    } else {
      console.error('No email found in profile');
    }

    return data;
  }

  async declineUser(userId: string) {
    const { data, error } = await this.supabase
      .from('profiles')
      .delete()
      .eq('id', userId);

    if (error) throw error;

    // Call Edge Function to delete auth account
    const { error: functionError } = await this.supabase.functions.invoke('delete-user', {
      body: { userId }
    });

    if (functionError) {
      console.error('Failed to delete auth account via Edge Function:', functionError);
      throw functionError;
    }

    return data;
  }

  /**
   * Complete removal/ban of a user.
   */
  async deleteUserAccount(userId: string) {
    // 1. Delete from profiles
    const { error: profileError } = await this.supabase
      .from('profiles')
      .delete()
      .eq('id', userId);
    
    if (profileError) throw profileError;

    // 2. Call Edge Function to delete auth account (this actually bans them from logging in)
    const { error: authError } = await this.supabase.functions.invoke('delete-user', {
      body: { userId }
    });

    if (authError) throw authError;
    
    return true;
  }

  async profileExists(userId: string): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .single();

      return !error && !!data;
    } catch {
      return false;
    }
  }

  async uploadMedia(bucket: 'images' | 'videos', file: File): Promise<string> {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
    const filePath = `${this.currentUser?.id}/${fileName}`;

    const { error: uploadError } = await this.supabase.storage
      .from(bucket)
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    const { data } = this.supabase.storage
      .from(bucket)
      .getPublicUrl(filePath);

    return data.publicUrl;
  }

  async createWithdrawal(amount: number, solanaAddress: string) {
    const { data, error } = await this.supabase
      .from('withdrawals')
      .insert([
        {
          user_id: this.currentUser?.id,
          email: this.currentUser?.email,
          twitter_handle: this.currentProfile?.twitter_handle,
          amount: amount,
          solana_address: solanaAddress,
          status: 'pending',
          created_at: new Date().toISOString()
        }
      ]);

    if (error) throw error;
    return data;
  }

  async getPendingWithdrawals() {
    const { data, error } = await this.supabase
      .from('withdrawals')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  async getCompletedWithdrawals() {
    const { data, error } = await this.supabase
      .from('withdrawals')
      .select('*')
      .eq('status', 'completed')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  async processWithdrawal(id: string) {
    const { data, error } = await this.supabase
      .from('withdrawals')
      .update({ status: 'completed' })
      .eq('id', id);

    if (error) throw error;
    return data;
  }

  async getUserWithdrawals(userId: string) {
    const { data, error } = await this.supabase
      .from('withdrawals')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async getPlatformStats() {
    const { count: creatorsCount, error: countError } = await this.supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('is_approved', true)
      .eq('role', 'user');

    if (countError) console.error('Error fetching creators count', countError);

    const { data: profiles, error: sumError } = await this.supabase
      .from('profiles')
      .select('balance')
      .eq('is_approved', true)
      .eq('role', 'user');

    if (sumError) console.error('Error fetching balances', sumError);

    const totalEarnings = profiles?.reduce((sum, p) => sum + (p.balance || 0), 0) || 0;

    return {
      totalCreators: creatorsCount || 0,
      totalEarnings
    };
  }

  // --- Tasks Management ---

  async getTasks(): Promise<PlatformTask[]> {
    const { data, error } = await this.supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching tasks', error);
      return [];
    }
    return data as PlatformTask[];
  }

  async createPlatformTask(task: Omit<PlatformTask, 'id' | 'created_at'>) {
    const { data, error } = await this.supabase
      .from('tasks')
      .insert([task])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async deletePlatformTask(id: string) {
    const { error } = await this.supabase
      .from('tasks')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

}

