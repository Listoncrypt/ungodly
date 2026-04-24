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
}

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private supabase: SupabaseClient;
  private currentUserSubject = new BehaviorSubject<SupabaseUser | null>(null);
  private currentProfileSubject = new BehaviorSubject<Profile | null>(null);

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

  get currentUser(): SupabaseUser | null {
    return this.currentUserSubject.value;
  }

  get currentProfile(): Profile | null {
    return this.currentProfileSubject.value;
  }

  private async updateUserAndProfile(user: SupabaseUser | null) {
    this.currentUserSubject.next(user);
    if (user) {
      const { data: profile } = await this.supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      
      this.currentProfileSubject.next(profile as Profile);
    } else {
      this.currentProfileSubject.next(null);
    }
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

  async approveUser(userId: string) {
    const { data, error } = await this.supabase
      .from('profiles')
      .update({ is_approved: true })
      .eq('id', userId);
      
    if (error) throw error;
    return data;
  }

  async declineUser(userId: string) {
    const { data, error } = await this.supabase
      .from('profiles')
      .delete()
      .eq('id', userId);
      
    if (error) throw error;
    return data;
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

  async processWithdrawal(id: string) {
    const { data, error } = await this.supabase
      .from('withdrawals')
      .update({ status: 'completed' })
      .eq('id', id);

    if (error) throw error;
    return data;
  }
}

