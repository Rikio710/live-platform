export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      artist_follows: {
        Row: {
          artist_id: string
          created_at: string | null
          id: string
          user_id: string
        }
        Insert: {
          artist_id: string
          created_at?: string | null
          id?: string
          user_id: string
        }
        Update: {
          artist_id?: string
          created_at?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "artist_follows_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      artists: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          image_url: string | null
          instagram_url: string | null
          name: string
          twitter_url: string | null
          website_url: string | null
          youtube_url: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          instagram_url?: string | null
          name: string
          twitter_url?: string | null
          website_url?: string | null
          youtube_url?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          instagram_url?: string | null
          name?: string
          twitter_url?: string | null
          website_url?: string | null
          youtube_url?: string | null
        }
        Relationships: []
      }
      attendances: {
        Row: {
          concert_id: string
          created_at: string | null
          id: string
          user_id: string
        }
        Insert: {
          concert_id: string
          created_at?: string | null
          id?: string
          user_id: string
        }
        Update: {
          concert_id?: string
          created_at?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendances_concert_id_fkey"
            columns: ["concert_id"]
            isOneToOne: false
            referencedRelation: "concerts"
            referencedColumns: ["id"]
          },
        ]
      }
      board_posts: {
        Row: {
          category: string
          concert_id: string
          content: string
          created_at: string | null
          id: string
          is_spoiler: boolean | null
          likes_count: number | null
          media_type: string | null
          media_url: string | null
          user_id: string
        }
        Insert: {
          category?: string
          concert_id: string
          content: string
          created_at?: string | null
          id?: string
          is_spoiler?: boolean | null
          likes_count?: number | null
          media_type?: string | null
          media_url?: string | null
          user_id: string
        }
        Update: {
          category?: string
          concert_id?: string
          content?: string
          created_at?: string | null
          id?: string
          is_spoiler?: boolean | null
          likes_count?: number | null
          media_type?: string | null
          media_url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "board_posts_concert_id_fkey"
            columns: ["concert_id"]
            isOneToOne: false
            referencedRelation: "concerts"
            referencedColumns: ["id"]
          },
        ]
      }
      concerts: {
        Row: {
          apple_music_url: string | null
          artist_id: string
          created_at: string | null
          date: string
          id: string
          image_url: string | null
          spotify_url: string | null
          start_time: string | null
          tour_id: string | null
          venue_address: string | null
          venue_name: string
        }
        Insert: {
          apple_music_url?: string | null
          artist_id: string
          created_at?: string | null
          date: string
          id?: string
          image_url?: string | null
          spotify_url?: string | null
          start_time?: string | null
          tour_id?: string | null
          venue_address?: string | null
          venue_name: string
        }
        Update: {
          apple_music_url?: string | null
          artist_id?: string
          created_at?: string | null
          date?: string
          id?: string
          image_url?: string | null
          spotify_url?: string | null
          start_time?: string | null
          tour_id?: string | null
          venue_address?: string | null
          venue_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "concerts_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concerts_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_messages: {
        Row: {
          category: string
          created_at: string | null
          email: string | null
          id: string
          is_resolved: boolean | null
          message: string
          user_id: string | null
        }
        Insert: {
          category?: string
          created_at?: string | null
          email?: string | null
          id?: string
          is_resolved?: boolean | null
          message: string
          user_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          email?: string | null
          id?: string
          is_resolved?: boolean | null
          message?: string
          user_id?: string | null
        }
        Relationships: []
      }
      merch_catalog: {
        Row: {
          color_options: string[] | null
          created_at: string | null
          id: string
          image_url: string | null
          name: string
          price: number | null
          size_options: string[] | null
          tour_id: string
          user_id: string
        }
        Insert: {
          color_options?: string[] | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          name: string
          price?: number | null
          size_options?: string[] | null
          tour_id: string
          user_id: string
        }
        Update: {
          color_options?: string[] | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          name?: string
          price?: number | null
          size_options?: string[] | null
          tour_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "merch_catalog_tour_id_fkey"
            columns: ["tour_id"]
            isOneToOne: false
            referencedRelation: "tours"
            referencedColumns: ["id"]
          },
        ]
      }
      merch_combo_votes: {
        Row: {
          catalog_item_id: string
          color_option: string
          concert_id: string
          created_at: string | null
          id: string
          size_option: string
          status: string
          user_id: string
        }
        Insert: {
          catalog_item_id: string
          color_option?: string
          concert_id: string
          created_at?: string | null
          id?: string
          size_option?: string
          status: string
          user_id: string
        }
        Update: {
          catalog_item_id?: string
          color_option?: string
          concert_id?: string
          created_at?: string | null
          id?: string
          size_option?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "merch_combo_votes_catalog_item_id_fkey"
            columns: ["catalog_item_id"]
            isOneToOne: false
            referencedRelation: "merch_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merch_combo_votes_concert_id_fkey"
            columns: ["concert_id"]
            isOneToOne: false
            referencedRelation: "concerts"
            referencedColumns: ["id"]
          },
        ]
      }
      merch_items: {
        Row: {
          color_options: string[] | null
          concert_id: string
          created_at: string | null
          id: string
          image_url: string | null
          name: string
          price: number | null
          size_options: string[] | null
          status: string
          user_id: string
          wait_minutes: number | null
        }
        Insert: {
          color_options?: string[] | null
          concert_id: string
          created_at?: string | null
          id?: string
          image_url?: string | null
          name: string
          price?: number | null
          size_options?: string[] | null
          status?: string
          user_id: string
          wait_minutes?: number | null
        }
        Update: {
          color_options?: string[] | null
          concert_id?: string
          created_at?: string | null
          id?: string
          image_url?: string | null
          name?: string
          price?: number | null
          size_options?: string[] | null
          status?: string
          user_id?: string
          wait_minutes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "merch_items_concert_id_fkey"
            columns: ["concert_id"]
            isOneToOne: false
            referencedRelation: "concerts"
            referencedColumns: ["id"]
          },
        ]
      }
      merch_stock_reports: {
        Row: {
          catalog_item_id: string
          concert_id: string
          created_at: string | null
          id: string
          status: string
          user_id: string
        }
        Insert: {
          catalog_item_id: string
          concert_id: string
          created_at?: string | null
          id?: string
          status: string
          user_id: string
        }
        Update: {
          catalog_item_id?: string
          concert_id?: string
          created_at?: string | null
          id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "merch_stock_reports_catalog_item_id_fkey"
            columns: ["catalog_item_id"]
            isOneToOne: false
            referencedRelation: "merch_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merch_stock_reports_concert_id_fkey"
            columns: ["concert_id"]
            isOneToOne: false
            referencedRelation: "concerts"
            referencedColumns: ["id"]
          },
        ]
      }
      merch_wait_votes: {
        Row: {
          concert_id: string
          created_at: string | null
          id: string
          user_id: string
          wait_label: string
        }
        Insert: {
          concert_id: string
          created_at?: string | null
          id?: string
          user_id: string
          wait_label: string
        }
        Update: {
          concert_id?: string
          created_at?: string | null
          id?: string
          user_id?: string
          wait_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "merch_wait_votes_concert_id_fkey"
            columns: ["concert_id"]
            isOneToOne: false
            referencedRelation: "concerts"
            referencedColumns: ["id"]
          },
        ]
      }
      nearby_spots: {
        Row: {
          address: string | null
          category: string
          concert_id: string
          created_at: string | null
          description: string | null
          id: string
          name: string
          url: string | null
          user_id: string
        }
        Insert: {
          address?: string | null
          category: string
          concert_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          url?: string | null
          user_id: string
        }
        Update: {
          address?: string | null
          category?: string
          concert_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nearby_spots_concert_id_fkey"
            columns: ["concert_id"]
            isOneToOne: false
            referencedRelation: "concerts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_comments: {
        Row: {
          content: string
          created_at: string | null
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "board_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_likes: {
        Row: {
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "board_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_reports: {
        Row: {
          created_at: string | null
          id: string
          post_id: string
          reason: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          post_id: string
          reason?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          post_id?: string
          reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_reports_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "board_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          id: string
          is_admin: boolean
          show_spoilers: boolean | null
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          id: string
          is_admin?: boolean
          show_spoilers?: boolean | null
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          id?: string
          is_admin?: boolean
          show_spoilers?: boolean | null
          username?: string | null
        }
        Relationships: []
      }
      requests: {
        Row: {
          admin_note: string | null
          created_at: string | null
          id: string
          payload: Json
          status: string
          submitted_by: string | null
          type: string
        }
        Insert: {
          admin_note?: string | null
          created_at?: string | null
          id?: string
          payload: Json
          status?: string
          submitted_by?: string | null
          type: string
        }
        Update: {
          admin_note?: string | null
          created_at?: string | null
          id?: string
          payload?: Json
          status?: string
          submitted_by?: string | null
          type?: string
        }
        Relationships: []
      }
      setlist_songs: {
        Row: {
          concert_id: string
          created_at: string | null
          id: string
          is_encore: boolean | null
          order_num: number | null
          song_name: string
          song_type: string
          submission_id: string | null
          user_id: string
          votes_count: number | null
        }
        Insert: {
          concert_id: string
          created_at?: string | null
          id?: string
          is_encore?: boolean | null
          order_num?: number | null
          song_name: string
          song_type?: string
          submission_id?: string | null
          user_id: string
          votes_count?: number | null
        }
        Update: {
          concert_id?: string
          created_at?: string | null
          id?: string
          is_encore?: boolean | null
          order_num?: number | null
          song_name?: string
          song_type?: string
          submission_id?: string | null
          user_id?: string
          votes_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "setlist_songs_concert_id_fkey"
            columns: ["concert_id"]
            isOneToOne: false
            referencedRelation: "concerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "setlist_songs_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "setlist_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      setlist_submission_votes: {
        Row: {
          created_at: string
          id: string
          submission_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          submission_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          submission_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "setlist_submission_votes_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "setlist_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      setlist_submissions: {
        Row: {
          apple_music_url: string | null
          concert_id: string
          created_at: string
          id: string
          spotify_url: string | null
          user_id: string
          votes_count: number
        }
        Insert: {
          apple_music_url?: string | null
          concert_id: string
          created_at?: string
          id?: string
          spotify_url?: string | null
          user_id: string
          votes_count?: number
        }
        Update: {
          apple_music_url?: string | null
          concert_id?: string
          created_at?: string
          id?: string
          spotify_url?: string | null
          user_id?: string
          votes_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "setlist_submissions_concert_id_fkey"
            columns: ["concert_id"]
            isOneToOne: false
            referencedRelation: "concerts"
            referencedColumns: ["id"]
          },
        ]
      }
      setlist_votes: {
        Row: {
          id: string
          song_id: string
          user_id: string
        }
        Insert: {
          id?: string
          song_id: string
          user_id: string
        }
        Update: {
          id?: string
          song_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "setlist_votes_song_id_fkey"
            columns: ["song_id"]
            isOneToOne: false
            referencedRelation: "setlist_songs"
            referencedColumns: ["id"]
          },
        ]
      }
      tours: {
        Row: {
          artist_id: string
          created_at: string | null
          end_date: string | null
          id: string
          image_url: string | null
          name: string
          start_date: string | null
        }
        Insert: {
          artist_id: string
          created_at?: string | null
          end_date?: string | null
          id?: string
          image_url?: string | null
          name: string
          start_date?: string | null
        }
        Update: {
          artist_id?: string
          created_at?: string | null
          end_date?: string | null
          id?: string
          image_url?: string | null
          name?: string
          start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tours_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      user_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string | null
          id: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string | null
          id?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string | null
          id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      decrement_likes: { Args: { post_id: string }; Returns: undefined }
      increment_likes: { Args: { post_id: string }; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
