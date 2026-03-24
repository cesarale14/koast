// Auto-generated Supabase types — replace with `supabase gen types typescript`
// Placeholder structure matching expected schema

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
          address: string;
          city: string;
          country: string;
          channex_property_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["properties"]["Row"],
          "id" | "created_at" | "updated_at"
        >;
        Update: Partial<
          Database["public"]["Tables"]["properties"]["Insert"]
        >;
      };
      bookings: {
        Row: {
          id: string;
          property_id: string;
          guest_name: string;
          guest_email: string | null;
          guest_phone: string | null;
          check_in: string;
          check_out: string;
          status: "confirmed" | "pending" | "cancelled" | "checked_in" | "checked_out";
          source: string;
          total_amount: number;
          currency: string;
          channex_booking_id: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["bookings"]["Row"],
          "id" | "created_at" | "updated_at"
        >;
        Update: Partial<
          Database["public"]["Tables"]["bookings"]["Insert"]
        >;
      };
      room_types: {
        Row: {
          id: string;
          property_id: string;
          name: string;
          max_occupancy: number;
          base_rate: number;
          currency: string;
          channex_room_type_id: string | null;
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["room_types"]["Row"],
          "id" | "created_at"
        >;
        Update: Partial<
          Database["public"]["Tables"]["room_types"]["Insert"]
        >;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
