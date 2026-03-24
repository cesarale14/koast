// Auto-generated Supabase types — replace with `supabase gen types typescript`
// Matches 001_initial_schema.sql

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      properties: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          address: string | null;
          city: string | null;
          state: string | null;
          zip: string | null;
          latitude: number | null;
          longitude: number | null;
          bedrooms: number | null;
          bathrooms: number | null;
          max_guests: number | null;
          property_type: "entire_home" | "private_room" | "shared_room" | null;
          amenities: Json;
          photos: Json;
          channex_property_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["properties"]["Row"],
          "id" | "created_at" | "updated_at" | "amenities" | "photos"
        > & { amenities?: Json; photos?: Json };
        Update: Partial<
          Database["public"]["Tables"]["properties"]["Insert"]
        >;
      };
      listings: {
        Row: {
          id: string;
          property_id: string;
          platform: "airbnb" | "vrbo" | "booking_com" | "direct";
          platform_listing_id: string | null;
          channex_room_id: string | null;
          listing_url: string | null;
          status: string | null;
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["listings"]["Row"],
          "id" | "created_at"
        >;
        Update: Partial<
          Database["public"]["Tables"]["listings"]["Insert"]
        >;
      };
      bookings: {
        Row: {
          id: string;
          property_id: string;
          listing_id: string | null;
          platform: string;
          platform_booking_id: string | null;
          channex_booking_id: string | null;
          guest_name: string | null;
          guest_email: string | null;
          guest_phone: string | null;
          check_in: string;
          check_out: string;
          num_guests: number | null;
          total_price: number | null;
          currency: string;
          status: "pending" | "confirmed" | "cancelled" | "completed";
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["bookings"]["Row"],
          "id" | "created_at" | "updated_at" | "currency" | "status"
        > & { currency?: string; status?: string };
        Update: Partial<
          Database["public"]["Tables"]["bookings"]["Insert"]
        >;
      };
      calendar_rates: {
        Row: {
          id: string;
          property_id: string;
          date: string;
          base_rate: number | null;
          suggested_rate: number | null;
          applied_rate: number | null;
          min_stay: number;
          is_available: boolean;
          rate_source: "manual" | "engine" | "override";
          factors: Json | null;
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["calendar_rates"]["Row"],
          "id" | "created_at" | "min_stay" | "is_available" | "rate_source"
        > & { min_stay?: number; is_available?: boolean; rate_source?: string };
        Update: Partial<
          Database["public"]["Tables"]["calendar_rates"]["Insert"]
        >;
      };
      market_comps: {
        Row: {
          id: string;
          property_id: string;
          comp_listing_id: string | null;
          comp_name: string | null;
          comp_bedrooms: number | null;
          comp_adr: number | null;
          comp_occupancy: number | null;
          comp_revpar: number | null;
          distance_km: number | null;
          last_synced: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["market_comps"]["Row"],
          "id" | "last_synced"
        >;
        Update: Partial<
          Database["public"]["Tables"]["market_comps"]["Insert"]
        >;
      };
      market_snapshots: {
        Row: {
          id: string;
          property_id: string;
          snapshot_date: string;
          market_adr: number | null;
          market_occupancy: number | null;
          market_revpar: number | null;
          market_supply: number | null;
          market_demand_score: number | null;
          data_source: string;
          raw_data: Json | null;
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["market_snapshots"]["Row"],
          "id" | "created_at" | "data_source"
        > & { data_source?: string };
        Update: Partial<
          Database["public"]["Tables"]["market_snapshots"]["Insert"]
        >;
      };
      messages: {
        Row: {
          id: string;
          booking_id: string | null;
          property_id: string;
          platform: string;
          direction: "inbound" | "outbound" | null;
          sender_name: string | null;
          content: string;
          ai_draft: string | null;
          ai_draft_status: "none" | "pending" | "generated" | "approved" | "sent";
          sent_at: string | null;
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["messages"]["Row"],
          "id" | "created_at" | "ai_draft_status"
        > & { ai_draft_status?: string };
        Update: Partial<
          Database["public"]["Tables"]["messages"]["Insert"]
        >;
      };
      cleaning_tasks: {
        Row: {
          id: string;
          property_id: string;
          booking_id: string | null;
          next_booking_id: string | null;
          cleaner_id: string | null;
          status: "pending" | "assigned" | "in_progress" | "completed" | "issue";
          scheduled_date: string;
          scheduled_time: string | null;
          checklist: Json;
          photos: Json;
          notes: string | null;
          completed_at: string | null;
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["cleaning_tasks"]["Row"],
          "id" | "created_at" | "status" | "checklist" | "photos"
        > & { status?: string; checklist?: Json; photos?: Json };
        Update: Partial<
          Database["public"]["Tables"]["cleaning_tasks"]["Insert"]
        >;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
