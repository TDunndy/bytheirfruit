
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "abuse_reports": {
                  Row: {
                    "church_city": string | null,"church_name": string | null,"church_state": string | null,"contact_method": string | null,"description": string,"id": string,"report_type": string,"submitted_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "church_city"?: string | null,"church_name"?: string | null,"church_state"?: string | null,"contact_method"?: string | null,"description": string,"id"?: string,"report_type": string,"submitted_at"?: string | null
                  }
                  Update: {
                    "church_city"?: string | null,"church_name"?: string | null,"church_state"?: string | null,"contact_method"?: string | null,"description"?: string,"id"?: string,"report_type"?: string,"submitted_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"church_claims": {
                  Row: {
                    "church_id": string,"claim_email": string,"code_expires_at": string | null,"created_at": string | null,"id": string,"review_note": string | null,"review_status": string,"reviewed_at": string | null,"reviewed_by": string | null,"stripe_customer_id": string | null,"stripe_payment_id": string | null,"stripe_subscription_id": string | null,"subscription_status": string | null,"user_id": string,"verification_code_hash": string | null,"verified": boolean | null,"verified_at": string | null,"verify_attempts": number
                  }
                  ComputedFields: never
                  Insert: {
                    "church_id": string,"claim_email": string,"code_expires_at"?: string | null,"created_at"?: string | null,"id"?: string,"review_note"?: string | null,"review_status"?: string,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"stripe_customer_id"?: string | null,"stripe_payment_id"?: string | null,"stripe_subscription_id"?: string | null,"subscription_status"?: string | null,"user_id": string,"verification_code_hash"?: string | null,"verified"?: boolean | null,"verified_at"?: string | null,"verify_attempts"?: number
                  }
                  Update: {
                    "church_id"?: string,"claim_email"?: string,"code_expires_at"?: string | null,"created_at"?: string | null,"id"?: string,"review_note"?: string | null,"review_status"?: string,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"stripe_customer_id"?: string | null,"stripe_payment_id"?: string | null,"stripe_subscription_id"?: string | null,"subscription_status"?: string | null,"user_id"?: string,"verification_code_hash"?: string | null,"verified"?: boolean | null,"verified_at"?: string | null,"verify_attempts"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "church_claims_church_id_fkey"
      columns: ["church_id"]
isOneToOne: true
      referencedRelation: "churches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "church_claims_reviewed_by_fkey"
      columns: ["reviewed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "church_claims_reviewed_by_fkey"
      columns: ["reviewed_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"church_reports": {
                  Row: {
                    "admin_notes": string | null,"church_id": string,"created_at": string | null,"description": string | null,"id": string,"reason": string,"reviewed_at": string | null,"status": string | null,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "admin_notes"?: string | null,"church_id": string,"created_at"?: string | null,"description"?: string | null,"id"?: string,"reason": string,"reviewed_at"?: string | null,"status"?: string | null,"user_id"?: string | null
                  }
                  Update: {
                    "admin_notes"?: string | null,"church_id"?: string,"created_at"?: string | null,"description"?: string | null,"id"?: string,"reason"?: string,"reviewed_at"?: string | null,"status"?: string | null,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "church_reports_church_id_fkey"
      columns: ["church_id"]
isOneToOne: false
      referencedRelation: "churches"
      referencedColumns: ["id"]
    }
                  ]
                },"church_responses": {
                  Row: {
                    "church_id": string,"created_at": string | null,"id": string,"responder_id": string,"review_id": string,"text": string
                  }
                  ComputedFields: never
                  Insert: {
                    "church_id": string,"created_at"?: string | null,"id"?: string,"responder_id": string,"review_id": string,"text": string
                  }
                  Update: {
                    "church_id"?: string,"created_at"?: string | null,"id"?: string,"responder_id"?: string,"review_id"?: string,"text"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "church_responses_church_id_fkey"
      columns: ["church_id"]
isOneToOne: false
      referencedRelation: "churches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "church_responses_responder_id_fkey"
      columns: ["responder_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "church_responses_responder_id_fkey"
      columns: ["responder_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "church_responses_review_id_fkey"
      columns: ["review_id"]
isOneToOne: false
      referencedRelation: "reviews"
      referencedColumns: ["id"]
    }
                  ]
                },"churches": {
                  Row: {
                    "added_by": string | null,"address": string | null,"approved_at": string | null,"approved_by": string | null,"avg_attendance": number | null,"campus_count": number | null,"city": string,"claim_email": string | null,"claim_verified": boolean | null,"claimed_at": string | null,"claimed_by": string | null,"created_at": string | null,"current_period_end": string | null,"denomination": string | null,"description": string | null,"email": string | null,"facebook_url": string | null,"id": string,"instagram_url": string | null,"latitude": number | null,"livestream_url": string | null,"longitude": number | null,"name": string,"pastor_name": string | null,"phone": string | null,"programs": (string)[] | null,"score_community": number | null,"score_finances": number | null,"score_kids": number | null,"score_leadership": number | null,"score_overall": number | null,"score_prayer": number | null,"score_service": number | null,"score_teaching": number | null,"score_welcome": number | null,"score_worship": number | null,"score_youth": number | null,"scores_updated_at": string | null,"service_days": Json | null,"service_style": string | null,"service_times": string | null,"size": string | null,"source": string | null,"staff_count": number | null,"state": string,"status": string,"stripe_customer_id": string | null,"stripe_subscription_id": string | null,"subscription_status": string | null,"total_reviews": number | null,"volunteer_count": number | null,"website": string | null,"year_founded": number | null,"youtube_url": string | null,"zip": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "added_by"?: string | null,"address"?: string | null,"approved_at"?: string | null,"approved_by"?: string | null,"avg_attendance"?: number | null,"campus_count"?: number | null,"city": string,"claim_email"?: string | null,"claim_verified"?: boolean | null,"claimed_at"?: string | null,"claimed_by"?: string | null,"created_at"?: string | null,"current_period_end"?: string | null,"denomination"?: string | null,"description"?: string | null,"email"?: string | null,"facebook_url"?: string | null,"id"?: string,"instagram_url"?: string | null,"latitude"?: number | null,"livestream_url"?: string | null,"longitude"?: number | null,"name": string,"pastor_name"?: string | null,"phone"?: string | null,"programs"?: (string)[] | null,"score_community"?: number | null,"score_finances"?: number | null,"score_kids"?: number | null,"score_leadership"?: number | null,"score_overall"?: number | null,"score_prayer"?: number | null,"score_service"?: number | null,"score_teaching"?: number | null,"score_welcome"?: number | null,"score_worship"?: number | null,"score_youth"?: number | null,"scores_updated_at"?: string | null,"service_days"?: Json | null,"service_style"?: string | null,"service_times"?: string | null,"size"?: string | null,"source"?: string | null,"staff_count"?: number | null,"state"?: string,"status"?: string,"stripe_customer_id"?: string | null,"stripe_subscription_id"?: string | null,"subscription_status"?: string | null,"total_reviews"?: number | null,"volunteer_count"?: number | null,"website"?: string | null,"year_founded"?: number | null,"youtube_url"?: string | null,"zip"?: string | null
                  }
                  Update: {
                    "added_by"?: string | null,"address"?: string | null,"approved_at"?: string | null,"approved_by"?: string | null,"avg_attendance"?: number | null,"campus_count"?: number | null,"city"?: string,"claim_email"?: string | null,"claim_verified"?: boolean | null,"claimed_at"?: string | null,"claimed_by"?: string | null,"created_at"?: string | null,"current_period_end"?: string | null,"denomination"?: string | null,"description"?: string | null,"email"?: string | null,"facebook_url"?: string | null,"id"?: string,"instagram_url"?: string | null,"latitude"?: number | null,"livestream_url"?: string | null,"longitude"?: number | null,"name"?: string,"pastor_name"?: string | null,"phone"?: string | null,"programs"?: (string)[] | null,"score_community"?: number | null,"score_finances"?: number | null,"score_kids"?: number | null,"score_leadership"?: number | null,"score_overall"?: number | null,"score_prayer"?: number | null,"score_service"?: number | null,"score_teaching"?: number | null,"score_welcome"?: number | null,"score_worship"?: number | null,"score_youth"?: number | null,"scores_updated_at"?: string | null,"service_days"?: Json | null,"service_style"?: string | null,"service_times"?: string | null,"size"?: string | null,"source"?: string | null,"staff_count"?: number | null,"state"?: string,"status"?: string,"stripe_customer_id"?: string | null,"stripe_subscription_id"?: string | null,"subscription_status"?: string | null,"total_reviews"?: number | null,"volunteer_count"?: number | null,"website"?: string | null,"year_founded"?: number | null,"youtube_url"?: string | null,"zip"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "churches_added_by_fkey"
      columns: ["added_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "churches_added_by_fkey"
      columns: ["added_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "churches_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "churches_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "churches_claimed_by_fkey"
      columns: ["claimed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "churches_claimed_by_fkey"
      columns: ["claimed_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"claim_requests": {
                  Row: {
                    "church_id": string,"created_at": string | null,"full_name": string,"id": string,"message": string | null,"payment_verified": boolean | null,"phone": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"role_at_church": string,"status": string | null,"stripe_subscription_id": string | null,"user_id": string,"work_email": string
                  }
                  ComputedFields: never
                  Insert: {
                    "church_id": string,"created_at"?: string | null,"full_name": string,"id"?: string,"message"?: string | null,"payment_verified"?: boolean | null,"phone"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"role_at_church": string,"status"?: string | null,"stripe_subscription_id"?: string | null,"user_id": string,"work_email": string
                  }
                  Update: {
                    "church_id"?: string,"created_at"?: string | null,"full_name"?: string,"id"?: string,"message"?: string | null,"payment_verified"?: boolean | null,"phone"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"role_at_church"?: string,"status"?: string | null,"stripe_subscription_id"?: string | null,"user_id"?: string,"work_email"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "claim_requests_church_id_fkey"
      columns: ["church_id"]
isOneToOne: false
      referencedRelation: "churches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "claim_requests_reviewed_by_fkey"
      columns: ["reviewed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "claim_requests_reviewed_by_fkey"
      columns: ["reviewed_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "claim_requests_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "claim_requests_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"favorites": {
                  Row: {
                    "church_id": string,"created_at": string | null,"id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "church_id": string,"created_at"?: string | null,"id"?: string,"user_id": string
                  }
                  Update: {
                    "church_id"?: string,"created_at"?: string | null,"id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "favorites_church_id_fkey"
      columns: ["church_id"]
isOneToOne: false
      referencedRelation: "churches"
      referencedColumns: ["id"]
    }
                  ]
                },"newsletter_subscribers": {
                  Row: {
                    "email": string,"id": string,"subscribed_at": string | null,"unsubscribed": boolean | null
                  }
                  ComputedFields: never
                  Insert: {
                    "email": string,"id"?: string,"subscribed_at"?: string | null,"unsubscribed"?: boolean | null
                  }
                  Update: {
                    "email"?: string,"id"?: string,"subscribed_at"?: string | null,"unsubscribed"?: boolean | null
                  }
                  Relationships: [
                    
                  ]
                },"org_members": {
                  Row: {
                    "created_at": string,"org_id": string,"role": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"org_id": string,"role"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"org_id"?: string,"role"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "org_members_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"organizations": {
                  Row: {
                    "church_id": string | null,"created_at": string,"created_by": string | null,"id": string,"name": string,"slug": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "church_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"name": string,"slug": string,"updated_at"?: string
                  }
                  Update: {
                    "church_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"id"?: string,"name"?: string,"slug"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organizations_church_id_fkey"
      columns: ["church_id"]
isOneToOne: true
      referencedRelation: "churches"
      referencedColumns: ["id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount_cents": number | null,"created_at": string | null,"currency": string | null,"customer_email": string | null,"event_type": string | null,"id": string,"payment_status": string,"stripe_customer_id": string | null,"stripe_session_id": string | null,"stripe_subscription_id": string | null,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents"?: number | null,"created_at"?: string | null,"currency"?: string | null,"customer_email"?: string | null,"event_type"?: string | null,"id"?: string,"payment_status"?: string,"stripe_customer_id"?: string | null,"stripe_session_id"?: string | null,"stripe_subscription_id"?: string | null,"user_id"?: string | null
                  }
                  Update: {
                    "amount_cents"?: number | null,"created_at"?: string | null,"currency"?: string | null,"customer_email"?: string | null,"event_type"?: string | null,"id"?: string,"payment_status"?: string,"stripe_customer_id"?: string | null,"stripe_session_id"?: string | null,"stripe_subscription_id"?: string | null,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "address": string | null,"age_range": string | null,"avatar_url": string | null,"created_at": string | null,"display_name": string,"email": string | null,"gender": string | null,"id": string,"income_bracket": string | null,"last_active_at": string | null,"phone": string | null,"provider": string | null,"review_suspended": boolean | null,"role": string | null,"status": string | null,"suspension_reason": string | null,"zip_code": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"age_range"?: string | null,"avatar_url"?: string | null,"created_at"?: string | null,"display_name": string,"email"?: string | null,"gender"?: string | null,"id": string,"income_bracket"?: string | null,"last_active_at"?: string | null,"phone"?: string | null,"provider"?: string | null,"review_suspended"?: boolean | null,"role"?: string | null,"status"?: string | null,"suspension_reason"?: string | null,"zip_code"?: string | null
                  }
                  Update: {
                    "address"?: string | null,"age_range"?: string | null,"avatar_url"?: string | null,"created_at"?: string | null,"display_name"?: string,"email"?: string | null,"gender"?: string | null,"id"?: string,"income_bracket"?: string | null,"last_active_at"?: string | null,"phone"?: string | null,"provider"?: string | null,"review_suspended"?: boolean | null,"role"?: string | null,"status"?: string | null,"suspension_reason"?: string | null,"zip_code"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"regional_benchmarks": {
                  Row: {
                    "avg_score": number | null,"category": string,"church_count": number | null,"created_at": string | null,"id": string,"last_updated": string | null,"region_type": string,"region_value": string,"review_count": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "avg_score"?: number | null,"category": string,"church_count"?: number | null,"created_at"?: string | null,"id"?: string,"last_updated"?: string | null,"region_type": string,"region_value": string,"review_count"?: number | null
                  }
                  Update: {
                    "avg_score"?: number | null,"category"?: string,"church_count"?: number | null,"created_at"?: string | null,"id"?: string,"last_updated"?: string | null,"region_type"?: string,"region_value"?: string,"review_count"?: number | null
                  }
                  Relationships: [
                    
                  ]
                },"review_flags": {
                  Row: {
                    "created_at": string | null,"details": string | null,"flagged_by": string,"id": string,"reason": string,"review_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string | null,"details"?: string | null,"flagged_by": string,"id"?: string,"reason": string,"review_id": string
                  }
                  Update: {
                    "created_at"?: string | null,"details"?: string | null,"flagged_by"?: string,"id"?: string,"reason"?: string,"review_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "review_flags_flagged_by_fkey"
      columns: ["flagged_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "review_flags_flagged_by_fkey"
      columns: ["flagged_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "review_flags_review_id_fkey"
      columns: ["review_id"]
isOneToOne: false
      referencedRelation: "reviews"
      referencedColumns: ["id"]
    }
                  ]
                },"review_likes": {
                  Row: {
                    "created_at": string | null,"id": string,"review_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string | null,"id"?: string,"review_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string | null,"id"?: string,"review_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "review_likes_review_id_fkey"
      columns: ["review_id"]
isOneToOne: false
      referencedRelation: "reviews"
      referencedColumns: ["id"]
    }
                  ]
                },"review_locations": {
                  Row: {
                    "created_at": string | null,"distance_miles": number | null,"lat": number,"lng": number,"review_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string | null,"distance_miles"?: number | null,"lat": number,"lng": number,"review_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string | null,"distance_miles"?: number | null,"lat"?: number,"lng"?: number,"review_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "review_locations_review_id_fkey"
      columns: ["review_id"]
isOneToOne: true
      referencedRelation: "reviews"
      referencedColumns: ["id"]
    }
                  ]
                },"review_photos": {
                  Row: {
                    "caption": string | null,"created_at": string | null,"file_name": string,"file_size": number | null,"id": string,"mime_type": string | null,"review_id": string,"sort_order": number | null,"storage_path": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "caption"?: string | null,"created_at"?: string | null,"file_name": string,"file_size"?: number | null,"id"?: string,"mime_type"?: string | null,"review_id": string,"sort_order"?: number | null,"storage_path": string,"user_id": string
                  }
                  Update: {
                    "caption"?: string | null,"created_at"?: string | null,"file_name"?: string,"file_size"?: number | null,"id"?: string,"mime_type"?: string | null,"review_id"?: string,"sort_order"?: number | null,"storage_path"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "review_photos_review_id_fkey"
      columns: ["review_id"]
isOneToOne: false
      referencedRelation: "reviews"
      referencedColumns: ["id"]
    }
                  ]
                },"reviews": {
                  Row: {
                    "ai_moderation": Json | null,"ai_summary": string | null,"approved_at": string | null,"approved_by": string | null,"church_id": string,"comment_community": string | null,"comment_finances": string | null,"comment_kids": string | null,"comment_leadership": string | null,"comment_prayer": string | null,"comment_service": string | null,"comment_teaching": string | null,"comment_welcome": string | null,"comment_worship": string | null,"comment_youth": string | null,"created_at": string | null,"deleted_at": string | null,"edited_at": string | null,"flag_count": number | null,"id": string,"last_visited": string | null,"location_verified": boolean | null,"reviewer_role": string,"score_community": number | null,"score_finances": number | null,"score_kids": number | null,"score_leadership": number | null,"score_prayer": number | null,"score_service": number | null,"score_teaching": number | null,"score_welcome": number | null,"score_worship": number | null,"score_youth": number | null,"status": string | null,"text": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ai_moderation"?: Json | null,"ai_summary"?: string | null,"approved_at"?: string | null,"approved_by"?: string | null,"church_id": string,"comment_community"?: string | null,"comment_finances"?: string | null,"comment_kids"?: string | null,"comment_leadership"?: string | null,"comment_prayer"?: string | null,"comment_service"?: string | null,"comment_teaching"?: string | null,"comment_welcome"?: string | null,"comment_worship"?: string | null,"comment_youth"?: string | null,"created_at"?: string | null,"deleted_at"?: string | null,"edited_at"?: string | null,"flag_count"?: number | null,"id"?: string,"last_visited"?: string | null,"location_verified"?: boolean | null,"reviewer_role": string,"score_community"?: number | null,"score_finances"?: number | null,"score_kids"?: number | null,"score_leadership"?: number | null,"score_prayer"?: number | null,"score_service"?: number | null,"score_teaching"?: number | null,"score_welcome"?: number | null,"score_worship"?: number | null,"score_youth"?: number | null,"status"?: string | null,"text": string,"user_id": string
                  }
                  Update: {
                    "ai_moderation"?: Json | null,"ai_summary"?: string | null,"approved_at"?: string | null,"approved_by"?: string | null,"church_id"?: string,"comment_community"?: string | null,"comment_finances"?: string | null,"comment_kids"?: string | null,"comment_leadership"?: string | null,"comment_prayer"?: string | null,"comment_service"?: string | null,"comment_teaching"?: string | null,"comment_welcome"?: string | null,"comment_worship"?: string | null,"comment_youth"?: string | null,"created_at"?: string | null,"deleted_at"?: string | null,"edited_at"?: string | null,"flag_count"?: number | null,"id"?: string,"last_visited"?: string | null,"location_verified"?: boolean | null,"reviewer_role"?: string,"score_community"?: number | null,"score_finances"?: number | null,"score_kids"?: number | null,"score_leadership"?: number | null,"score_prayer"?: number | null,"score_service"?: number | null,"score_teaching"?: number | null,"score_welcome"?: number | null,"score_worship"?: number | null,"score_youth"?: number | null,"status"?: string | null,"text"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reviews_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reviews_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reviews_church_id_fkey"
      columns: ["church_id"]
isOneToOne: false
      referencedRelation: "churches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reviews_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reviews_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "public_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"score_snapshots": {
                  Row: {
                    "category": string,"church_id": string,"created_at": string | null,"id": string,"review_count": number | null,"score_value": number | null,"snapshot_date": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category": string,"church_id": string,"created_at"?: string | null,"id"?: string,"review_count"?: number | null,"score_value"?: number | null,"snapshot_date": string
                  }
                  Update: {
                    "category"?: string,"church_id"?: string,"created_at"?: string | null,"id"?: string,"review_count"?: number | null,"score_value"?: number | null,"snapshot_date"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "score_snapshots_church_id_fkey"
      columns: ["church_id"]
isOneToOne: false
      referencedRelation: "churches"
      referencedColumns: ["id"]
    }
                  ]
                },"subscription_events": {
                  Row: {
                    "amount_cents": number | null,"church_id": string | null,"created_at": string | null,"event_type": string,"id": string,"raw": Json | null,"status": string | null,"stripe_event_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_cents"?: number | null,"church_id"?: string | null,"created_at"?: string | null,"event_type": string,"id"?: string,"raw"?: Json | null,"status"?: string | null,"stripe_event_id": string
                  }
                  Update: {
                    "amount_cents"?: number | null,"church_id"?: string | null,"created_at"?: string | null,"event_type"?: string,"id"?: string,"raw"?: Json | null,"status"?: string | null,"stripe_event_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "subscription_events_church_id_fkey"
      columns: ["church_id"]
isOneToOne: false
      referencedRelation: "churches"
      referencedColumns: ["id"]
    }
                  ]
                },"subscriptions": {
                  Row: {
                    "cancel_at_period_end": boolean,"church_id": string | null,"created_at": string,"current_period_end": string | null,"id": string,"org_id": string,"plan": string,"status": string | null,"stripe_customer_id": string | null,"stripe_subscription_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cancel_at_period_end"?: boolean,"church_id"?: string | null,"created_at"?: string,"current_period_end"?: string | null,"id"?: string,"org_id": string,"plan"?: string,"status"?: string | null,"stripe_customer_id"?: string | null,"stripe_subscription_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "cancel_at_period_end"?: boolean,"church_id"?: string | null,"created_at"?: string,"current_period_end"?: string | null,"id"?: string,"org_id"?: string,"plan"?: string,"status"?: string | null,"stripe_customer_id"?: string | null,"stripe_subscription_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "subscriptions_church_id_fkey"
      columns: ["church_id"]
isOneToOne: false
      referencedRelation: "churches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subscriptions_org_id_fkey"
      columns: ["org_id"]
isOneToOne: true
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "public_profiles": {
                  Row: {
                    "avatar_url": string | null,"created_at": string | null,"display_name": string | null,"id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "avatar_url"?: string | null,"created_at"?: string | null,"display_name"?: string | null,"id"?: string | null
                         }
                        Update: {
                           "avatar_url"?: string | null,"created_at"?: string | null,"display_name"?: string | null,"id"?: string | null
                         }
                        Relationships: [
                    
                  ]
                },"zip_centroids": {
                  Row: {
                    "church_count": number | null,"lat": number | null,"lng": number | null,"zip": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "church_reviewer_demographics":
{ Args: { "p_church_id": string }; Returns: Json
                           },
"churches_near":
{ Args: { "p_denomination"?: string,"p_lat": number,"p_limit"?: number,"p_lng": number,"p_query"?: string,"p_radius_miles"?: number,"p_state"?: string }; Returns: {
              "address": string,"city": string,"claimed_at": string,"claimed_by": string,"denomination": string,"distance_miles": number,"email": string,"id": string,"latitude": number,"longitude": number,"name": string,"phone": string,"score_community": number,"score_finances": number,"score_kids": number,"score_leadership": number,"score_overall": number,"score_prayer": number,"score_service": number,"score_teaching": number,"score_welcome": number,"score_worship": number,"score_youth": number,"service_style": string,"service_times": string,"size": string,"state": string,"status": string,"subscription_status": string,"total_reviews": number,"website": string,"zip": string
            }[]
                           },
"compute_regional_benchmarks":
{ Args: Record<PropertyKey, never>; Returns: {
              "computed": boolean,"regions_updated": number
            }[]
                           },
"geocode_zip":
{ Args: { "p_zip": string }; Returns: {
              "church_count": number,"lat": number,"lng": number
            }[]
                           },
"has_active_subscription":
{ Args: { "p_org_id": string }; Returns: boolean
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_moderator":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_org_member":
{ Args: { "p_min_role"?: string,"p_org_id": string }; Returns: boolean
                           },
"is_privileged":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"org_role_rank":
{ Args: { "p_role": string }; Returns: number
                           },
"recalculate_church_scores":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"refresh_zip_centroids":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"review_church_claim":
{ Args: { "p_approve": boolean,"p_claim_id": string,"p_note"?: string }; Returns: Json
                           },
"site_stats":
{ Args: Record<PropertyKey, never>; Returns: {
              "churches": number,"members": number,"reviews": number
            }[]
                           },
"slugify":
{ Args: { "p": string }; Returns: string
                           },
"soft_delete_review":
{ Args: { "p_review_id": string }; Returns: undefined
                           },
"verify_claim_code":
{ Args: { "p_church_id": string,"p_code": string }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const
