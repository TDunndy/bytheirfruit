
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
                },"access_log": {
                  Row: {
                    "action": string,"actor_kind": string,"actor_person_id": string | null,"at": string,"detail": NonNullable<Json>,"id": number,"org_id": string,"station_id": string | null,"subject_count": number,"subject_person_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_kind": string,"actor_person_id"?: string | null,"at"?: string,"detail"?: NonNullable<Json>,"id"?: never,"org_id": string,"station_id"?: string | null,"subject_count"?: number,"subject_person_id"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_kind"?: string,"actor_person_id"?: string | null,"at"?: string,"detail"?: NonNullable<Json>,"id"?: never,"org_id"?: string,"station_id"?: string | null,"subject_count"?: number,"subject_person_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "access_log_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"area_leaders": {
                  Row: {
                    "area_id": string,"created_at": string,"id": string,"kind": string,"org_id": string,"person_id": string | null,"role_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "area_id": string,"created_at"?: string,"id"?: string,"kind"?: string,"org_id": string,"person_id"?: string | null,"role_id"?: string | null
                  }
                  Update: {
                    "area_id"?: string,"created_at"?: string,"id"?: string,"kind"?: string,"org_id"?: string,"person_id"?: string | null,"role_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "area_leaders_area_id_org_id_fkey"
      columns: ["area_id","org_id"]
isOneToOne: false
      referencedRelation: "areas"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "area_leaders_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "area_leaders_person_id_org_id_fkey"
      columns: ["person_id","org_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "area_leaders_role_id_org_id_fkey"
      columns: ["role_id","org_id"]
isOneToOne: false
      referencedRelation: "org_roles"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"areas": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"id": string,"kind": string,"name": string,"org_id": string,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"id"?: string,"kind": string,"name": string,"org_id": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"id"?: string,"kind"?: string,"name"?: string,"org_id"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "areas_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"checkin_keys": {
                  Row: {
                    "household_id": string | null,"id": string,"issued_at": string,"kind": string,"org_id": string,"person_id": string | null,"revoked_at": string | null,"value": string
                  }
                  ComputedFields: never
                  Insert: {
                    "household_id"?: string | null,"id"?: string,"issued_at"?: string,"kind": string,"org_id": string,"person_id"?: string | null,"revoked_at"?: string | null,"value": string
                  }
                  Update: {
                    "household_id"?: string | null,"id"?: string,"issued_at"?: string,"kind"?: string,"org_id"?: string,"person_id"?: string | null,"revoked_at"?: string | null,"value"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "checkin_keys_household_id_org_id_fkey"
      columns: ["household_id","org_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "checkin_keys_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "checkin_keys_person_id_org_id_fkey"
      columns: ["person_id","org_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"checkin_restrictions": {
                  Row: {
                    "cleared_at": string | null,"cleared_by_person_id": string | null,"created_at": string,"ends_on": string | null,"id": string,"kind": string,"note": string | null,"org_id": string,"person_id": string,"set_by_person_id": string | null,"starts_on": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cleared_at"?: string | null,"cleared_by_person_id"?: string | null,"created_at"?: string,"ends_on"?: string | null,"id"?: string,"kind": string,"note"?: string | null,"org_id": string,"person_id": string,"set_by_person_id"?: string | null,"starts_on"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "cleared_at"?: string | null,"cleared_by_person_id"?: string | null,"created_at"?: string,"ends_on"?: string | null,"id"?: string,"kind"?: string,"note"?: string | null,"org_id"?: string,"person_id"?: string,"set_by_person_id"?: string | null,"starts_on"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "checkin_restrictions_cleared_by_person_id_org_id_fkey"
      columns: ["cleared_by_person_id","org_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "checkin_restrictions_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "checkin_restrictions_person_id_org_id_fkey"
      columns: ["person_id","org_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "checkin_restrictions_set_by_person_id_org_id_fkey"
      columns: ["set_by_person_id","org_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"child_care": {
                  Row: {
                    "allergies": string | null,"allergy_short": string | null,"has_allergy": boolean,"has_medical": boolean,"has_special_needs": boolean,"medical": string | null,"org_id": string,"person_id": string,"special_needs": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "allergies"?: string | null,"allergy_short"?: string | null,"has_allergy"?: boolean,"has_medical"?: boolean,"has_special_needs"?: boolean,"medical"?: string | null,"org_id": string,"person_id": string,"special_needs"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "allergies"?: string | null,"allergy_short"?: string | null,"has_allergy"?: boolean,"has_medical"?: boolean,"has_special_needs"?: boolean,"medical"?: string | null,"org_id"?: string,"person_id"?: string,"special_needs"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "child_care_person_id_org_id_fkey"
      columns: ["person_id","org_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"chms_audit": {
                  Row: {
                    "action": string,"actor_kind": string,"actor_person_id": string | null,"at": string,"id": number,"new_row": Json | null,"old_row": Json | null,"org_id": string,"row_id": string,"station_id": string | null,"table_name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_kind": string,"actor_person_id"?: string | null,"at"?: string,"id"?: never,"new_row"?: Json | null,"old_row"?: Json | null,"org_id": string,"row_id": string,"station_id"?: string | null,"table_name": string
                  }
                  Update: {
                    "action"?: string,"actor_kind"?: string,"actor_person_id"?: string | null,"at"?: string,"id"?: never,"new_row"?: Json | null,"old_row"?: Json | null,"org_id"?: string,"row_id"?: string,"station_id"?: string | null,"table_name"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "chms_audit_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
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
                    "church_id": string,"created_at": string | null,"full_name": string,"id": string,"message": string | null,"payment_verified": boolean | null,"phone": string | null,"profile": Json | null,"reviewed_at": string | null,"reviewed_by": string | null,"role_at_church": string,"status": string | null,"stripe_subscription_id": string | null,"user_id": string,"work_email": string
                  }
                  ComputedFields: never
                  Insert: {
                    "church_id": string,"created_at"?: string | null,"full_name": string,"id"?: string,"message"?: string | null,"payment_verified"?: boolean | null,"phone"?: string | null,"profile"?: Json | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"role_at_church": string,"status"?: string | null,"stripe_subscription_id"?: string | null,"user_id": string,"work_email": string
                  }
                  Update: {
                    "church_id"?: string,"created_at"?: string | null,"full_name"?: string,"id"?: string,"message"?: string | null,"payment_verified"?: boolean | null,"phone"?: string | null,"profile"?: Json | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"role_at_church"?: string,"status"?: string | null,"stripe_subscription_id"?: string | null,"user_id"?: string,"work_email"?: string
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
                },"contact_consents": {
                  Row: {
                    "consented_at": string,"id": string,"org_id": string,"person_id": string | null,"phone_e164": string,"revoked_at": string | null,"revoked_source": string | null,"scope": string,"source": string,"station_id": string | null,"text_version": string
                  }
                  ComputedFields: never
                  Insert: {
                    "consented_at"?: string,"id"?: string,"org_id": string,"person_id"?: string | null,"phone_e164": string,"revoked_at"?: string | null,"revoked_source"?: string | null,"scope": string,"source": string,"station_id"?: string | null,"text_version": string
                  }
                  Update: {
                    "consented_at"?: string,"id"?: string,"org_id"?: string,"person_id"?: string | null,"phone_e164"?: string,"revoked_at"?: string | null,"revoked_source"?: string | null,"scope"?: string,"source"?: string,"station_id"?: string | null,"text_version"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "contact_consents_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "contact_consents_person_id_org_id_fkey"
      columns: ["person_id","org_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"custom_field_defs": {
                  Row: {
                    "applies_to": string,"archived_at": string | null,"created_at": string,"field_type": string,"id": string,"key": string,"label": string,"options": (string)[],"org_id": string,"sensitive": boolean,"sort": number
                  }
                  ComputedFields: never
                  Insert: {
                    "applies_to": string,"archived_at"?: string | null,"created_at"?: string,"field_type": string,"id"?: string,"key": string,"label": string,"options"?: (string)[],"org_id": string,"sensitive"?: boolean,"sort"?: number
                  }
                  Update: {
                    "applies_to"?: string,"archived_at"?: string | null,"created_at"?: string,"field_type"?: string,"id"?: string,"key"?: string,"label"?: string,"options"?: (string)[],"org_id"?: string,"sensitive"?: boolean,"sort"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "custom_field_defs_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"custom_field_values_sensitive": {
                  Row: {
                    "field_id": string,"org_id": string,"subject_id": string,"updated_at": string,"value": Json | null
                  }
                  ComputedFields: never
                  Insert: {
                    "field_id": string,"org_id": string,"subject_id": string,"updated_at"?: string,"value"?: Json | null
                  }
                  Update: {
                    "field_id"?: string,"org_id"?: string,"subject_id"?: string,"updated_at"?: string,"value"?: Json | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "custom_field_values_sensitive_field_id_org_id_fkey"
      columns: ["field_id","org_id"]
isOneToOne: false
      referencedRelation: "custom_field_defs"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"domain_events": {
                  Row: {
                    "actor_kind": string,"actor_person_id": string | null,"device_at": string | null,"id": string,"org_id": string,"payload": NonNullable<Json>,"recorded_at": string,"seq": number,"station_id": string | null,"subject_id": string | null,"subject_type": string,"type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_kind": string,"actor_person_id"?: string | null,"device_at"?: string | null,"id"?: string,"org_id": string,"payload"?: NonNullable<Json>,"recorded_at"?: string,"seq"?: never,"station_id"?: string | null,"subject_id"?: string | null,"subject_type": string,"type": string
                  }
                  Update: {
                    "actor_kind"?: string,"actor_person_id"?: string | null,"device_at"?: string | null,"id"?: string,"org_id"?: string,"payload"?: NonNullable<Json>,"recorded_at"?: string,"seq"?: never,"station_id"?: string | null,"subject_id"?: string | null,"subject_type"?: string,"type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "domain_events_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
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
                },"household_flags": {
                  Row: {
                    "cleared_at": string | null,"cleared_by_person_id": string | null,"flag": string,"household_id": string,"id": string,"note": string | null,"org_id": string,"set_at": string,"set_by_person_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "cleared_at"?: string | null,"cleared_by_person_id"?: string | null,"flag": string,"household_id": string,"id"?: string,"note"?: string | null,"org_id": string,"set_at"?: string,"set_by_person_id"?: string | null
                  }
                  Update: {
                    "cleared_at"?: string | null,"cleared_by_person_id"?: string | null,"flag"?: string,"household_id"?: string,"id"?: string,"note"?: string | null,"org_id"?: string,"set_at"?: string,"set_by_person_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "household_flags_cleared_by_person_id_fkey"
      columns: ["cleared_by_person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "household_flags_household_id_org_id_fkey"
      columns: ["household_id","org_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "household_flags_set_by_person_id_fkey"
      columns: ["set_by_person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    }
                  ]
                },"household_members": {
                  Row: {
                    "can_check_in": boolean,"created_at": string,"ended_at": string | null,"household_id": string,"is_guardian": boolean,"org_id": string,"person_id": string,"relationship": string
                  }
                  ComputedFields: never
                  Insert: {
                    "can_check_in"?: boolean,"created_at"?: string,"ended_at"?: string | null,"household_id": string,"is_guardian"?: boolean,"org_id": string,"person_id": string,"relationship"?: string
                  }
                  Update: {
                    "can_check_in"?: boolean,"created_at"?: string,"ended_at"?: string | null,"household_id"?: string,"is_guardian"?: boolean,"org_id"?: string,"person_id"?: string,"relationship"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "household_members_household_id_org_id_fkey"
      columns: ["household_id","org_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "household_members_person_id_org_id_fkey"
      columns: ["person_id","org_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"households": {
                  Row: {
                    "address_line1": string | null,"address_line2": string | null,"archived_at": string | null,"city": string | null,"created_at": string,"custom": NonNullable<Json>,"id": string,"name": string,"org_id": string,"postal_code": string | null,"state": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address_line1"?: string | null,"address_line2"?: string | null,"archived_at"?: string | null,"city"?: string | null,"created_at"?: string,"custom"?: NonNullable<Json>,"id"?: string,"name": string,"org_id": string,"postal_code"?: string | null,"state"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "address_line1"?: string | null,"address_line2"?: string | null,"archived_at"?: string | null,"city"?: string | null,"created_at"?: string,"custom"?: NonNullable<Json>,"id"?: string,"name"?: string,"org_id"?: string,"postal_code"?: string | null,"state"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "households_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"label_templates": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"height_mm": number,"id": string,"is_default": boolean,"kind": string,"layout": NonNullable<Json>,"name": string,"org_id": string,"stock": string,"updated_at": string,"version": number,"width_mm": number
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"height_mm"?: number,"id"?: string,"is_default"?: boolean,"kind": string,"layout"?: NonNullable<Json>,"name": string,"org_id": string,"stock"?: string,"updated_at"?: string,"version"?: number,"width_mm"?: number
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"height_mm"?: number,"id"?: string,"is_default"?: boolean,"kind"?: string,"layout"?: NonNullable<Json>,"name"?: string,"org_id"?: string,"stock"?: string,"updated_at"?: string,"version"?: number,"width_mm"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "label_templates_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
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
                },"occurrences": {
                  Row: {
                    "closed_at": string | null,"created_at": string,"ends_at": string,"id": string,"local_date": string,"note": string | null,"opened_at": string | null,"org_id": string,"schedule_id": string,"starts_at": string,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "closed_at"?: string | null,"created_at"?: string,"ends_at": string,"id"?: string,"local_date": string,"note"?: string | null,"opened_at"?: string | null,"org_id": string,"schedule_id": string,"starts_at": string,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "closed_at"?: string | null,"created_at"?: string,"ends_at"?: string,"id"?: string,"local_date"?: string,"note"?: string | null,"opened_at"?: string | null,"org_id"?: string,"schedule_id"?: string,"starts_at"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "occurrences_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "occurrences_schedule_id_org_id_fkey"
      columns: ["schedule_id","org_id"]
isOneToOne: false
      referencedRelation: "schedules"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"org_checkin_settings": {
                  Row: {
                    "created_at": string,"grade_cutoff_day": number,"grade_cutoff_month": number,"label_defaults": NonNullable<Json>,"org_id": string,"promotion_date": string | null,"punctuality_grace_minutes": number,"time_zone": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"grade_cutoff_day"?: number,"grade_cutoff_month"?: number,"label_defaults"?: NonNullable<Json>,"org_id": string,"promotion_date"?: string | null,"punctuality_grace_minutes"?: number,"time_zone": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"grade_cutoff_day"?: number,"grade_cutoff_month"?: number,"label_defaults"?: NonNullable<Json>,"org_id"?: string,"promotion_date"?: string | null,"punctuality_grace_minutes"?: number,"time_zone"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "org_checkin_settings_org_id_fkey"
      columns: ["org_id"]
isOneToOne: true
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"org_invitations": {
                  Row: {
                    "accepted_at": string | null,"created_at": string,"email": string,"expires_at": string,"id": string,"invited_by_person_id": string | null,"member_role": string,"org_id": string,"person_id": string,"revoked_at": string | null,"token_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"created_at"?: string,"email": string,"expires_at"?: string,"id"?: string,"invited_by_person_id"?: string | null,"member_role"?: string,"org_id": string,"person_id": string,"revoked_at"?: string | null,"token_hash": string
                  }
                  Update: {
                    "accepted_at"?: string | null,"created_at"?: string,"email"?: string,"expires_at"?: string,"id"?: string,"invited_by_person_id"?: string | null,"member_role"?: string,"org_id"?: string,"person_id"?: string,"revoked_at"?: string | null,"token_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "org_invitations_invited_by_person_id_fkey"
      columns: ["invited_by_person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "org_invitations_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "org_invitations_person_id_org_id_fkey"
      columns: ["person_id","org_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id","org_id"]
    }
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
                },"org_roles": {
                  Row: {
                    "created_at": string,"description": string | null,"id": string,"name": string,"org_id": string,"permissions": (string)[],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"name": string,"org_id": string,"permissions"?: (string)[],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"name"?: string,"org_id"?: string,"permissions"?: (string)[],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "org_roles_org_id_fkey"
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
                },"people": {
                  Row: {
                    "address_line1": string | null,"address_line2": string | null,"archived_at": string | null,"birthdate": string | null,"city": string | null,"created_at": string,"custom": NonNullable<Json>,"email": string | null,"external_id": string | null,"external_source": string | null,"first_name": string,"first_visit_date": string | null,"gender": string | null,"grade_override": number | null,"grade_override_year": number | null,"id": string,"joined_date": string | null,"last_name": string,"membership_status": string,"org_id": string,"phone": string | null,"phone_e164": string | null,"photo_path": string | null,"photo_url": string | null,"postal_code": string | null,"preferred_name": string | null,"search_text": string | null,"state": string | null,"tags": (string)[],"title": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address_line1"?: string | null,"address_line2"?: string | null,"archived_at"?: string | null,"birthdate"?: string | null,"city"?: string | null,"created_at"?: string,"custom"?: NonNullable<Json>,"email"?: string | null,"external_id"?: string | null,"external_source"?: string | null,"first_name": string,"first_visit_date"?: string | null,"gender"?: string | null,"grade_override"?: number | null,"grade_override_year"?: number | null,"id"?: string,"joined_date"?: string | null,"last_name"?: string,"membership_status"?: string,"org_id": string,"phone"?: string | null,"phone_e164"?: never,"photo_path"?: string | null,"photo_url"?: string | null,"postal_code"?: string | null,"preferred_name"?: string | null,"search_text"?: never,"state"?: string | null,"tags"?: (string)[],"title"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "address_line1"?: string | null,"address_line2"?: string | null,"archived_at"?: string | null,"birthdate"?: string | null,"city"?: string | null,"created_at"?: string,"custom"?: NonNullable<Json>,"email"?: string | null,"external_id"?: string | null,"external_source"?: string | null,"first_name"?: string,"first_visit_date"?: string | null,"gender"?: string | null,"grade_override"?: number | null,"grade_override_year"?: number | null,"id"?: string,"joined_date"?: string | null,"last_name"?: string,"membership_status"?: string,"org_id"?: string,"phone"?: string | null,"phone_e164"?: never,"photo_path"?: string | null,"photo_url"?: string | null,"postal_code"?: string | null,"preferred_name"?: string | null,"search_text"?: never,"state"?: string | null,"tags"?: (string)[],"title"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "people_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"people_audit": {
                  Row: {
                    "action": string,"actor_kind": string,"actor_person_id": string | null,"at": string,"changes": NonNullable<Json>,"id": number,"org_id": string,"person_id": string,"station_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_kind": string,"actor_person_id"?: string | null,"at"?: string,"changes"?: NonNullable<Json>,"id"?: never,"org_id": string,"person_id": string,"station_id"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_kind"?: string,"actor_person_id"?: string | null,"at"?: string,"changes"?: NonNullable<Json>,"id"?: never,"org_id"?: string,"person_id"?: string,"station_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "people_audit_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"person_credentials": {
                  Row: {
                    "archived_at": string | null,"completed_on": string,"created_at": string,"expires_on": string | null,"id": string,"kind": string,"note": string | null,"org_id": string,"person_id": string,"provider": string | null,"reference": string | null,"verified_by_person_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"completed_on": string,"created_at"?: string,"expires_on"?: string | null,"id"?: string,"kind": string,"note"?: string | null,"org_id": string,"person_id": string,"provider"?: string | null,"reference"?: string | null,"verified_by_person_id"?: string | null
                  }
                  Update: {
                    "archived_at"?: string | null,"completed_on"?: string,"created_at"?: string,"expires_on"?: string | null,"id"?: string,"kind"?: string,"note"?: string | null,"org_id"?: string,"person_id"?: string,"provider"?: string | null,"reference"?: string | null,"verified_by_person_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "person_credentials_person_id_org_id_fkey"
      columns: ["person_id","org_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "person_credentials_verified_by_person_id_fkey"
      columns: ["verified_by_person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    }
                  ]
                },"person_documents": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"id": string,"kind": string,"note": string | null,"org_id": string,"person_id": string,"storage_path": string,"title": string,"uploaded_by_person_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"id"?: string,"kind": string,"note"?: string | null,"org_id": string,"person_id": string,"storage_path": string,"title": string,"uploaded_by_person_id"?: string | null
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"id"?: string,"kind"?: string,"note"?: string | null,"org_id"?: string,"person_id"?: string,"storage_path"?: string,"title"?: string,"uploaded_by_person_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "person_documents_person_id_org_id_fkey"
      columns: ["person_id","org_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "person_documents_uploaded_by_person_id_fkey"
      columns: ["uploaded_by_person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    }
                  ]
                },"person_logins": {
                  Row: {
                    "linked_at": string,"org_id": string,"person_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "linked_at"?: string,"org_id": string,"person_id": string,"user_id": string
                  }
                  Update: {
                    "linked_at"?: string,"org_id"?: string,"person_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "person_logins_person_id_org_id_fkey"
      columns: ["person_id","org_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"person_notes": {
                  Row: {
                    "author_person_id": string | null,"body": string,"created_at": string,"id": string,"org_id": string,"person_id": string,"updated_at": string,"visibility": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_person_id"?: string | null,"body": string,"created_at"?: string,"id"?: string,"org_id": string,"person_id": string,"updated_at"?: string,"visibility"?: string
                  }
                  Update: {
                    "author_person_id"?: string | null,"body"?: string,"created_at"?: string,"id"?: string,"org_id"?: string,"person_id"?: string,"updated_at"?: string,"visibility"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "person_notes_author_person_id_fkey"
      columns: ["author_person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "person_notes_person_id_org_id_fkey"
      columns: ["person_id","org_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"person_overseers": {
                  Row: {
                    "created_at": string,"id": string,"org_id": string,"overseer_person_id": string | null,"overseer_role_id": string | null,"person_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"org_id": string,"overseer_person_id"?: string | null,"overseer_role_id"?: string | null,"person_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"org_id"?: string,"overseer_person_id"?: string | null,"overseer_role_id"?: string | null,"person_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "person_overseers_overseer_person_id_org_id_fkey"
      columns: ["overseer_person_id","org_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "person_overseers_overseer_role_id_org_id_fkey"
      columns: ["overseer_role_id","org_id"]
isOneToOne: false
      referencedRelation: "org_roles"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "person_overseers_person_id_org_id_fkey"
      columns: ["person_id","org_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"person_roles": {
                  Row: {
                    "created_at": string,"org_id": string,"person_id": string,"role_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"org_id": string,"person_id": string,"role_id": string
                  }
                  Update: {
                    "created_at"?: string,"org_id"?: string,"person_id"?: string,"role_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "person_roles_person_id_org_id_fkey"
      columns: ["person_id","org_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "person_roles_role_id_org_id_fkey"
      columns: ["role_id","org_id"]
isOneToOne: false
      referencedRelation: "org_roles"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"pickup_people": {
                  Row: {
                    "archived_at": string | null,"child_person_id": string,"created_at": string,"created_by_person_id": string | null,"id": string,"kind": string,"name": string | null,"note": string | null,"org_id": string,"person_id": string | null,"phone": string | null,"relationship": string | null,"valid_from": string | null,"valid_to": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"child_person_id": string,"created_at"?: string,"created_by_person_id"?: string | null,"id"?: string,"kind": string,"name"?: string | null,"note"?: string | null,"org_id": string,"person_id"?: string | null,"phone"?: string | null,"relationship"?: string | null,"valid_from"?: string | null,"valid_to"?: string | null
                  }
                  Update: {
                    "archived_at"?: string | null,"child_person_id"?: string,"created_at"?: string,"created_by_person_id"?: string | null,"id"?: string,"kind"?: string,"name"?: string | null,"note"?: string | null,"org_id"?: string,"person_id"?: string | null,"phone"?: string | null,"relationship"?: string | null,"valid_from"?: string | null,"valid_to"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "pickup_people_child_person_id_org_id_fkey"
      columns: ["child_person_id","org_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "pickup_people_created_by_person_id_fkey"
      columns: ["created_by_person_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pickup_people_person_id_org_id_fkey"
      columns: ["person_id","org_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"printers": {
                  Row: {
                    "active": boolean,"address": string | null,"archived_at": string | null,"area_id": string | null,"connection": string,"created_at": string,"id": string,"model": string | null,"name": string,"org_id": string,"stock": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"address"?: string | null,"archived_at"?: string | null,"area_id"?: string | null,"connection"?: string,"created_at"?: string,"id"?: string,"model"?: string | null,"name": string,"org_id": string,"stock"?: string,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"address"?: string | null,"archived_at"?: string | null,"area_id"?: string | null,"connection"?: string,"created_at"?: string,"id"?: string,"model"?: string | null,"name"?: string,"org_id"?: string,"stock"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "printers_area_id_org_id_fkey"
      columns: ["area_id","org_id"]
isOneToOne: false
      referencedRelation: "areas"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "printers_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
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
                },"room_leaders": {
                  Row: {
                    "created_at": string,"id": string,"kind": string,"org_id": string,"person_id": string | null,"role_id": string | null,"room_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"kind"?: string,"org_id": string,"person_id"?: string | null,"role_id"?: string | null,"room_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"kind"?: string,"org_id"?: string,"person_id"?: string | null,"role_id"?: string | null,"room_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "room_leaders_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "room_leaders_person_id_org_id_fkey"
      columns: ["person_id","org_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "room_leaders_role_id_org_id_fkey"
      columns: ["role_id","org_id"]
isOneToOne: false
      referencedRelation: "org_roles"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "room_leaders_room_id_org_id_fkey"
      columns: ["room_id","org_id"]
isOneToOne: false
      referencedRelation: "rooms"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"room_overrides": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"ends_on": string | null,"id": string,"note": string | null,"org_id": string,"person_id": string,"room_id": string,"set_by_person_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"ends_on"?: string | null,"id"?: string,"note"?: string | null,"org_id": string,"person_id": string,"room_id": string,"set_by_person_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"ends_on"?: string | null,"id"?: string,"note"?: string | null,"org_id"?: string,"person_id"?: string,"room_id"?: string,"set_by_person_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "room_overrides_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "room_overrides_person_id_org_id_fkey"
      columns: ["person_id","org_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "room_overrides_room_id_org_id_fkey"
      columns: ["room_id","org_id"]
isOneToOne: false
      referencedRelation: "rooms"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "room_overrides_set_by_person_id_org_id_fkey"
      columns: ["set_by_person_id","org_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"rooms": {
                  Row: {
                    "active": boolean,"archived_at": string | null,"area_id": string,"capacity": number | null,"children_per_adult": number | null,"created_at": string,"criteria": NonNullable<Json>,"id": string,"name": string,"org_id": string,"overflow_room_id": string | null,"priority": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"archived_at"?: string | null,"area_id": string,"capacity"?: number | null,"children_per_adult"?: number | null,"created_at"?: string,"criteria"?: NonNullable<Json>,"id"?: string,"name": string,"org_id": string,"overflow_room_id"?: string | null,"priority"?: number,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"archived_at"?: string | null,"area_id"?: string,"capacity"?: number | null,"children_per_adult"?: number | null,"created_at"?: string,"criteria"?: NonNullable<Json>,"id"?: string,"name"?: string,"org_id"?: string,"overflow_room_id"?: string | null,"priority"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "rooms_area_id_org_id_fkey"
      columns: ["area_id","org_id"]
isOneToOne: false
      referencedRelation: "areas"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "rooms_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rooms_overflow_room_id_org_id_fkey"
      columns: ["overflow_room_id","org_id"]
isOneToOne: false
      referencedRelation: "rooms"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"schedule_rooms": {
                  Row: {
                    "created_at": string,"id": string,"org_id": string,"room_id": string,"schedule_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"org_id": string,"room_id": string,"schedule_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"org_id"?: string,"room_id"?: string,"schedule_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "schedule_rooms_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "schedule_rooms_room_id_org_id_fkey"
      columns: ["room_id","org_id"]
isOneToOne: false
      referencedRelation: "rooms"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "schedule_rooms_schedule_id_org_id_fkey"
      columns: ["schedule_id","org_id"]
isOneToOne: false
      referencedRelation: "schedules"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"schedules": {
                  Row: {
                    "active": boolean,"archived_at": string | null,"created_at": string,"duration_minutes": number,"exdates": (string)[],"id": string,"interval_weeks": number,"kind": string,"local_time": string,"name": string,"org_id": string,"starts_on": string,"until": string | null,"updated_at": string,"weekdays": (number)[]
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"archived_at"?: string | null,"created_at"?: string,"duration_minutes"?: number,"exdates"?: (string)[],"id"?: string,"interval_weeks"?: number,"kind"?: string,"local_time": string,"name": string,"org_id": string,"starts_on": string,"until"?: string | null,"updated_at"?: string,"weekdays": (number)[]
                  }
                  Update: {
                    "active"?: boolean,"archived_at"?: string | null,"created_at"?: string,"duration_minutes"?: number,"exdates"?: (string)[],"id"?: string,"interval_weeks"?: number,"kind"?: string,"local_time"?: string,"name"?: string,"org_id"?: string,"starts_on"?: string,"until"?: string | null,"updated_at"?: string,"weekdays"?: (number)[]
                  }
                  Relationships: [
                    {
      foreignKeyName: "schedules_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
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
                },"station_scopes": {
                  Row: {
                    "area_id": string | null,"created_at": string,"id": string,"org_id": string,"room_id": string | null,"station_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "area_id"?: string | null,"created_at"?: string,"id"?: string,"org_id": string,"room_id"?: string | null,"station_id": string
                  }
                  Update: {
                    "area_id"?: string | null,"created_at"?: string,"id"?: string,"org_id"?: string,"room_id"?: string | null,"station_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "station_scopes_area_id_org_id_fkey"
      columns: ["area_id","org_id"]
isOneToOne: false
      referencedRelation: "areas"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "station_scopes_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "station_scopes_room_id_org_id_fkey"
      columns: ["room_id","org_id"]
isOneToOne: false
      referencedRelation: "rooms"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "station_scopes_station_id_org_id_fkey"
      columns: ["station_id","org_id"]
isOneToOne: false
      referencedRelation: "stations"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"stations": {
                  Row: {
                    "active": boolean,"archived_at": string | null,"created_at": string,"id": string,"label_stock": string | null,"mode": string,"name": string,"org_id": string,"printer_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"archived_at"?: string | null,"created_at"?: string,"id"?: string,"label_stock"?: string | null,"mode": string,"name": string,"org_id": string,"printer_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"archived_at"?: string | null,"created_at"?: string,"id"?: string,"label_stock"?: string | null,"mode"?: string,"name"?: string,"org_id"?: string,"printer_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "stations_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stations_printer_id_org_id_fkey"
      columns: ["printer_id","org_id"]
isOneToOne: false
      referencedRelation: "printers"
      referencedColumns: ["id","org_id"]
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
                },"volunteer_assignments": {
                  Row: {
                    "created_at": string,"id": string,"local_date": string,"note": string | null,"org_id": string,"person_id": string,"set_by_person_id": string | null,"slot_id": string,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"local_date": string,"note"?: string | null,"org_id": string,"person_id": string,"set_by_person_id"?: string | null,"slot_id": string,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"local_date"?: string,"note"?: string | null,"org_id"?: string,"person_id"?: string,"set_by_person_id"?: string | null,"slot_id"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "volunteer_assignments_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "volunteer_assignments_person_id_org_id_fkey"
      columns: ["person_id","org_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "volunteer_assignments_set_by_person_id_org_id_fkey"
      columns: ["set_by_person_id","org_id"]
isOneToOne: false
      referencedRelation: "people"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "volunteer_assignments_slot_id_org_id_fkey"
      columns: ["slot_id","org_id"]
isOneToOne: false
      referencedRelation: "volunteer_slots"
      referencedColumns: ["id","org_id"]
    }
                  ]
                },"volunteer_slots": {
                  Row: {
                    "archived_at": string | null,"arrive_minutes_before": number,"created_at": string,"id": string,"label": string | null,"needed": number,"occurrence_id": string | null,"org_id": string,"role_id": string | null,"room_id": string | null,"schedule_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"arrive_minutes_before"?: number,"created_at"?: string,"id"?: string,"label"?: string | null,"needed"?: number,"occurrence_id"?: string | null,"org_id": string,"role_id"?: string | null,"room_id"?: string | null,"schedule_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"arrive_minutes_before"?: number,"created_at"?: string,"id"?: string,"label"?: string | null,"needed"?: number,"occurrence_id"?: string | null,"org_id"?: string,"role_id"?: string | null,"room_id"?: string | null,"schedule_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "volunteer_slots_occurrence_id_org_id_fkey"
      columns: ["occurrence_id","org_id"]
isOneToOne: false
      referencedRelation: "occurrences"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "volunteer_slots_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "volunteer_slots_role_id_org_id_fkey"
      columns: ["role_id","org_id"]
isOneToOne: false
      referencedRelation: "org_roles"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "volunteer_slots_room_id_org_id_fkey"
      columns: ["room_id","org_id"]
isOneToOne: false
      referencedRelation: "rooms"
      referencedColumns: ["id","org_id"]
    },{
      foreignKeyName: "volunteer_slots_schedule_id_org_id_fkey"
      columns: ["schedule_id","org_id"]
isOneToOne: false
      referencedRelation: "schedules"
      referencedColumns: ["id","org_id"]
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
            "accept_org_invitation":
{ Args: { "p_token": string }; Returns: Json
                           },
"child_care_summary":
{ Args: { "p_org_id": string }; Returns: {
              "allergy_short": string,"has_allergy": boolean,"has_medical": boolean,"has_special_needs": boolean,"person_id": string
            }[]
                           },
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
"create_org_invitation":
{ Args: { "p_email": string,"p_member_role"?: string,"p_org_id": string,"p_person_id": string }; Returns: Json
                           },
"generate_occurrences":
{ Args: { "p_from"?: string,"p_org_id": string,"p_through": string }; Returns: number
                           },
"geocode_zip":
{ Args: { "p_zip": string }; Returns: {
              "church_count": number,"lat": number,"lng": number
            }[]
                           },
"get_child_care":
{ Args: { "p_person_id": string }; Returns: Json
                           },
"has_active_subscription":
{ Args: { "p_org_id": string }; Returns: boolean
                           },
"has_org_permission":
{ Args: { "p_org_id": string,"p_permission": string }; Returns: boolean
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
"is_station":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"my_org_permissions":
{ Args: { "p_org_id": string }; Returns: (string)[]
                           },
"org_role_rank":
{ Args: { "p_role": string }; Returns: number
                           },
"people_with_logins":
{ Args: { "p_org_id": string }; Returns: {
              "member_role": string,"person_id": string
            }[]
                           },
"pickup_status":
{ Args: { "p_child_id": string,"p_person_id": string }; Returns: string
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
"revoke_org_invitation":
{ Args: { "p_invitation_id": string }; Returns: undefined
                           },
"set_child_care":
{ Args: { "p_allergies": string,"p_allergy_short": string,"p_medical": string,"p_person_id": string,"p_special_needs": string }; Returns: undefined
                           },
"set_my_staff_pin":
{ Args: { "p_org_id": string,"p_pin": string }; Returns: undefined
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
"station_self":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"station_staff":
{ Args: Record<PropertyKey, never>; Returns: {
              "display_name": string,"person_id": string
            }[]
                           },
"unlink_person_login":
{ Args: { "p_person_id": string }; Returns: undefined
                           },
"verify_claim_code":
{ Args: { "p_church_id": string,"p_code": string }; Returns: Json
                           },
"verify_staff_pin":
{ Args: { "p_person_id": string,"p_pin": string }; Returns: Json
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
