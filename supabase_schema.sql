-- =============================================================================
-- AQ MedTech Innovations — Clinic micro-EMR Supabase Schema
-- File: supabase_schema.sql
-- Copy-paste this entire script into Supabase SQL Editor and run it.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. EXTENSIONS
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ---------------------------------------------------------------------------
-- 2. TABLES
-- ---------------------------------------------------------------------------

-- 2a. clinics
CREATE TABLE IF NOT EXISTS public.clinics (
    id                uuid          PRIMARY KEY DEFAULT uuid_generate_v4(),
    name              text          NOT NULL,
    slug              text          UNIQUE,
    is_active         boolean       NOT NULL DEFAULT true,
    subscription_plan text          NOT NULL DEFAULT 'standard',
    supabase_url      text,
    created_at        timestamptz   NOT NULL DEFAULT now()
);

-- 2b. staff_profiles
CREATE TABLE IF NOT EXISTS public.staff_profiles (
    id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id   uuid        REFERENCES public.clinics(id) ON DELETE CASCADE,
    user_id     uuid        REFERENCES auth.users(id)     ON DELETE CASCADE,
    full_name   text,
    role        text        NOT NULL
                            CHECK (role IN (
                                'receptionist',
                                'doctor',
                                'locum_doctor',
                                'cashier',
                                'medical_director',
                                'super_admin'
                            )),
    is_active   boolean     NOT NULL DEFAULT true,
    expires_at  timestamptz NULL,   -- for 24-hour locum sessions
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- 2c. patients
CREATE TABLE IF NOT EXISTS public.patients (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id           uuid        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    full_name           text        NOT NULL,
    phone               text        NOT NULL,
    sex                 text,
    date_of_birth       date,
    age_years           int,
    blood_group         text,
    genotype            text,
    allergies           text,
    next_of_kin_name    text,
    next_of_kin_phone   text,
    is_chronic          boolean     NOT NULL DEFAULT false,
    chronic_type        text,
    last_refill_date    date,
    paper_folder_url    text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    synced_at           timestamptz
);

-- 2d. appointments
CREATE TABLE IF NOT EXISTS public.appointments (
    id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id           uuid        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    patient_name        text        NOT NULL,
    phone               text        NOT NULL,
    preferred_datetime  timestamptz,
    department          text,
    reason              text,
    queue_token         text,
    status              text        NOT NULL DEFAULT 'pending'
                                    CHECK (status IN (
                                        'pending',
                                        'confirmed',
                                        'in_progress',
                                        'completed',
                                        'cancelled'
                                    )),
    source              text        NOT NULL DEFAULT 'website',
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

-- 2e. consultations
CREATE TABLE IF NOT EXISTS public.consultations (
    id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id           uuid          NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    patient_id          uuid          REFERENCES public.patients(id)      ON DELETE SET NULL,
    appointment_id      uuid          REFERENCES public.appointments(id)  ON DELETE SET NULL,
    doctor_id           uuid          REFERENCES public.staff_profiles(id) ON DELETE SET NULL,
    visit_date          date          NOT NULL DEFAULT CURRENT_DATE,
    bp_systolic         int,
    bp_diastolic        int,
    temperature         numeric(4,1),
    pulse_rate          int,
    respiratory_rate    int,
    weight_kg           numeric(5,2),
    spo2                int,
    soap_subjective     text,
    soap_objective      text,
    soap_assessment     text,
    soap_plan           text,
    diagnosis_chips     text[],
    prescriptions       jsonb,
    lab_orders          jsonb,
    billable_items      jsonb,
    status              text          NOT NULL DEFAULT 'triage'
                                      CHECK (status IN (
                                          'triage',
                                          'with_doctor',
                                          'awaiting_payment',
                                          'completed'
                                      )),
    paper_folder_url    text,
    created_at          timestamptz   NOT NULL DEFAULT now(),
    updated_at          timestamptz   NOT NULL DEFAULT now()
);

-- 2f. payments
CREATE TABLE IF NOT EXISTS public.payments (
    id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id           uuid          NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    consultation_id     uuid          REFERENCES public.consultations(id) ON DELETE SET NULL,
    patient_id          uuid          REFERENCES public.patients(id)      ON DELETE SET NULL,
    patient_name        text,
    total_amount        numeric(12,2) NOT NULL,
    cash_amount         numeric(12,2) NOT NULL DEFAULT 0,
    pos_amount          numeric(12,2) NOT NULL DEFAULT 0,
    transfer_amount     numeric(12,2) NOT NULL DEFAULT 0,
    transfer_reference  text,
    bank_name           text,
    payment_date        date          NOT NULL DEFAULT CURRENT_DATE,
    is_locked           boolean       NOT NULL DEFAULT false,
    cashier_id          uuid          REFERENCES public.staff_profiles(id) ON DELETE SET NULL,
    receipt_number      text,
    created_at          timestamptz   NOT NULL DEFAULT now(),
    updated_at          timestamptz   NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- 3. UPDATED_AT TRIGGER
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

-- Apply to patients
DROP TRIGGER IF EXISTS trg_patients_updated_at ON public.patients;
CREATE TRIGGER trg_patients_updated_at
    BEFORE UPDATE ON public.patients
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Apply to appointments
DROP TRIGGER IF EXISTS trg_appointments_updated_at ON public.appointments;
CREATE TRIGGER trg_appointments_updated_at
    BEFORE UPDATE ON public.appointments
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Apply to consultations
DROP TRIGGER IF EXISTS trg_consultations_updated_at ON public.consultations;
CREATE TRIGGER trg_consultations_updated_at
    BEFORE UPDATE ON public.consultations
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Apply to payments
DROP TRIGGER IF EXISTS trg_payments_updated_at ON public.payments;
CREATE TRIGGER trg_payments_updated_at
    BEFORE UPDATE ON public.payments
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ---------------------------------------------------------------------------
-- 4. ENABLE ROW-LEVEL SECURITY
-- ---------------------------------------------------------------------------
ALTER TABLE public.clinics         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_profiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments        ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- 5. HELPER FUNCTIONS FOR RLS
-- ---------------------------------------------------------------------------

-- Returns the clinic_id for the currently authenticated user
CREATE OR REPLACE FUNCTION public.get_staff_clinic_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT clinic_id
    FROM   public.staff_profiles
    WHERE  user_id    = auth.uid()
      AND  is_active  = true
      AND  (expires_at IS NULL OR expires_at > now())
    LIMIT 1;
$$;

-- Returns true if the authenticated user's clinic is currently active
CREATE OR REPLACE FUNCTION public.is_clinic_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT COALESCE(
        (SELECT c.is_active
         FROM   public.clinics c
         WHERE  c.id = public.get_staff_clinic_id()),
        false
    );
$$;

-- Returns the role of the authenticated user
CREATE OR REPLACE FUNCTION public.get_staff_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT role
    FROM   public.staff_profiles
    WHERE  user_id    = auth.uid()
      AND  is_active  = true
      AND  (expires_at IS NULL OR expires_at > now())
    LIMIT 1;
$$;


-- ---------------------------------------------------------------------------
-- 5a. RLS POLICIES — clinics
-- ---------------------------------------------------------------------------

-- Drop existing policies to allow re-runs
DROP POLICY IF EXISTS "clinics_super_admin_all"       ON public.clinics;
DROP POLICY IF EXISTS "clinics_staff_select_own"      ON public.clinics;

-- super_admin can do everything on clinics
CREATE POLICY "clinics_super_admin_all"
ON public.clinics
FOR ALL
TO authenticated
USING     (public.get_staff_role() = 'super_admin')
WITH CHECK (public.get_staff_role() = 'super_admin');

-- Any authenticated staff can SELECT their own clinic's row
CREATE POLICY "clinics_staff_select_own"
ON public.clinics
FOR SELECT
TO authenticated
USING (id = public.get_staff_clinic_id());


-- ---------------------------------------------------------------------------
-- 5b. RLS POLICIES — staff_profiles
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "staff_profiles_super_admin_all"  ON public.staff_profiles;
DROP POLICY IF EXISTS "staff_profiles_staff_select_own" ON public.staff_profiles;
DROP POLICY IF EXISTS "staff_profiles_staff_insert"     ON public.staff_profiles;
DROP POLICY IF EXISTS "staff_profiles_staff_update"     ON public.staff_profiles;
DROP POLICY IF EXISTS "staff_profiles_director_delete"  ON public.staff_profiles;

-- super_admin full access
CREATE POLICY "staff_profiles_super_admin_all"
ON public.staff_profiles
FOR ALL
TO authenticated
USING     (public.get_staff_role() = 'super_admin')
WITH CHECK (public.get_staff_role() = 'super_admin');

-- Staff can SELECT profiles within their own clinic
CREATE POLICY "staff_profiles_staff_select_own"
ON public.staff_profiles
FOR SELECT
TO authenticated
USING (
    clinic_id = public.get_staff_clinic_id()
    AND public.is_clinic_active()
);

-- medical_director can INSERT staff in their clinic
CREATE POLICY "staff_profiles_staff_insert"
ON public.staff_profiles
FOR INSERT
TO authenticated
WITH CHECK (
    clinic_id = public.get_staff_clinic_id()
    AND public.is_clinic_active()
    AND public.get_staff_role() IN ('medical_director', 'super_admin')
);

-- medical_director can UPDATE staff in their clinic
CREATE POLICY "staff_profiles_staff_update"
ON public.staff_profiles
FOR UPDATE
TO authenticated
USING (
    clinic_id = public.get_staff_clinic_id()
    AND public.is_clinic_active()
    AND public.get_staff_role() IN ('medical_director', 'super_admin')
)
WITH CHECK (
    clinic_id = public.get_staff_clinic_id()
    AND public.is_clinic_active()
    AND public.get_staff_role() IN ('medical_director', 'super_admin')
);

-- Only medical_director / super_admin may DELETE staff profiles
CREATE POLICY "staff_profiles_director_delete"
ON public.staff_profiles
FOR DELETE
TO authenticated
USING (
    clinic_id = public.get_staff_clinic_id()
    AND public.get_staff_role() IN ('medical_director', 'super_admin')
);


-- ---------------------------------------------------------------------------
-- 5c. RLS POLICIES — patients
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "patients_select"  ON public.patients;
DROP POLICY IF EXISTS "patients_insert"  ON public.patients;
DROP POLICY IF EXISTS "patients_update"  ON public.patients;
DROP POLICY IF EXISTS "patients_delete"  ON public.patients;

CREATE POLICY "patients_select"
ON public.patients
FOR SELECT
TO authenticated
USING (
    clinic_id = public.get_staff_clinic_id()
    AND public.is_clinic_active()
);

CREATE POLICY "patients_insert"
ON public.patients
FOR INSERT
TO authenticated
WITH CHECK (
    clinic_id = public.get_staff_clinic_id()
    AND public.is_clinic_active()
);

CREATE POLICY "patients_update"
ON public.patients
FOR UPDATE
TO authenticated
USING (
    clinic_id = public.get_staff_clinic_id()
    AND public.is_clinic_active()
)
WITH CHECK (
    clinic_id = public.get_staff_clinic_id()
    AND public.is_clinic_active()
);

-- Only medical_director / super_admin may DELETE patient records
CREATE POLICY "patients_delete"
ON public.patients
FOR DELETE
TO authenticated
USING (
    clinic_id = public.get_staff_clinic_id()
    AND public.get_staff_role() IN ('medical_director', 'super_admin')
);


-- ---------------------------------------------------------------------------
-- 5d. RLS POLICIES — appointments
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "appointments_select" ON public.appointments;
DROP POLICY IF EXISTS "appointments_insert" ON public.appointments;
DROP POLICY IF EXISTS "appointments_update" ON public.appointments;
DROP POLICY IF EXISTS "appointments_delete" ON public.appointments;

CREATE POLICY "appointments_select"
ON public.appointments
FOR SELECT
TO authenticated
USING (
    clinic_id = public.get_staff_clinic_id()
    AND public.is_clinic_active()
);

CREATE POLICY "appointments_insert"
ON public.appointments
FOR INSERT
TO authenticated
WITH CHECK (
    clinic_id = public.get_staff_clinic_id()
    AND public.is_clinic_active()
);

CREATE POLICY "appointments_update"
ON public.appointments
FOR UPDATE
TO authenticated
USING (
    clinic_id = public.get_staff_clinic_id()
    AND public.is_clinic_active()
)
WITH CHECK (
    clinic_id = public.get_staff_clinic_id()
    AND public.is_clinic_active()
);

-- Only medical_director / super_admin may DELETE appointments
CREATE POLICY "appointments_delete"
ON public.appointments
FOR DELETE
TO authenticated
USING (
    clinic_id = public.get_staff_clinic_id()
    AND public.get_staff_role() IN ('medical_director', 'super_admin')
);


-- ---------------------------------------------------------------------------
-- 5e. RLS POLICIES — consultations
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "consultations_select" ON public.consultations;
DROP POLICY IF EXISTS "consultations_insert" ON public.consultations;
DROP POLICY IF EXISTS "consultations_update" ON public.consultations;
DROP POLICY IF EXISTS "consultations_delete" ON public.consultations;

CREATE POLICY "consultations_select"
ON public.consultations
FOR SELECT
TO authenticated
USING (
    clinic_id = public.get_staff_clinic_id()
    AND public.is_clinic_active()
);

CREATE POLICY "consultations_insert"
ON public.consultations
FOR INSERT
TO authenticated
WITH CHECK (
    clinic_id = public.get_staff_clinic_id()
    AND public.is_clinic_active()
);

CREATE POLICY "consultations_update"
ON public.consultations
FOR UPDATE
TO authenticated
USING (
    clinic_id = public.get_staff_clinic_id()
    AND public.is_clinic_active()
)
WITH CHECK (
    clinic_id = public.get_staff_clinic_id()
    AND public.is_clinic_active()
);

-- Only medical_director / super_admin may DELETE consultations
CREATE POLICY "consultations_delete"
ON public.consultations
FOR DELETE
TO authenticated
USING (
    clinic_id = public.get_staff_clinic_id()
    AND public.get_staff_role() IN ('medical_director', 'super_admin')
);


-- ---------------------------------------------------------------------------
-- 5f. RLS POLICIES — payments
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "payments_select"  ON public.payments;
DROP POLICY IF EXISTS "payments_insert"  ON public.payments;
DROP POLICY IF EXISTS "payments_update"  ON public.payments;
-- DELETE on payments is blocked entirely via RLS (no policy = deny)

CREATE POLICY "payments_select"
ON public.payments
FOR SELECT
TO authenticated
USING (
    clinic_id = public.get_staff_clinic_id()
    AND public.is_clinic_active()
);

CREATE POLICY "payments_insert"
ON public.payments
FOR INSERT
TO authenticated
WITH CHECK (
    clinic_id = public.get_staff_clinic_id()
    AND public.is_clinic_active()
);

-- UPDATE is denied when is_locked = true (additionally enforced by trigger below)
CREATE POLICY "payments_update"
ON public.payments
FOR UPDATE
TO authenticated
USING (
    clinic_id = public.get_staff_clinic_id()
    AND public.is_clinic_active()
    AND is_locked = false
)
WITH CHECK (
    clinic_id = public.get_staff_clinic_id()
    AND public.is_clinic_active()
    AND is_locked = false
);

-- No DELETE policy on payments → all DELETE operations are denied by RLS.


-- ---------------------------------------------------------------------------
-- 6. LOCKED PAYMENT PROTECTION TRIGGER
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.prevent_locked_payment_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.is_locked = true THEN
        RAISE EXCEPTION
            'Payment record % is locked and cannot be modified. Contact the Medical Director to unlock it.',
            OLD.id
            USING ERRCODE = 'P0001';
    END IF;

    IF TG_OP = 'DELETE' AND OLD.is_locked = true THEN
        RAISE EXCEPTION
            'Payment record % is locked and cannot be deleted.',
            OLD.id
            USING ERRCODE = 'P0001';
    END IF;

    -- For UPDATE, return the new row; DELETE returns OLD
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_locked_payment ON public.payments;
CREATE TRIGGER trg_prevent_locked_payment
    BEFORE UPDATE OR DELETE ON public.payments
    FOR EACH ROW EXECUTE FUNCTION public.prevent_locked_payment_modification();


-- ---------------------------------------------------------------------------
-- 7. QUEUE TOKEN GENERATOR
--    Returns the next token for today, e.g. 'TKN-001', 'TKN-002', etc.
--    Token sequence resets every day per clinic.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.generate_queue_token(p_clinic_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_today_count int;
    v_token       text;
BEGIN
    -- Count appointments already created today for this clinic
    SELECT COUNT(*) + 1
    INTO   v_today_count
    FROM   public.appointments
    WHERE  clinic_id    = p_clinic_id
      AND  created_at::date = CURRENT_DATE;

    v_token := 'TKN-' || LPAD(v_today_count::text, 3, '0');
    RETURN v_token;
END;
$$;


-- ---------------------------------------------------------------------------
-- 8. INDEXES
-- ---------------------------------------------------------------------------

-- patients
CREATE INDEX IF NOT EXISTS idx_patients_clinic_phone
    ON public.patients(clinic_id, phone);

CREATE INDEX IF NOT EXISTS idx_patients_clinic_name
    ON public.patients(clinic_id, full_name);

-- appointments
CREATE INDEX IF NOT EXISTS idx_appointments_clinic_status
    ON public.appointments(clinic_id, status);

-- consultations
CREATE INDEX IF NOT EXISTS idx_consultations_clinic_patient
    ON public.consultations(clinic_id, patient_id);

-- payments
CREATE INDEX IF NOT EXISTS idx_payments_clinic_date
    ON public.payments(clinic_id, payment_date);

-- staff_profiles
CREATE INDEX IF NOT EXISTS idx_staff_profiles_user_id
    ON public.staff_profiles(user_id);


-- =============================================================================
-- END OF SCHEMA
-- =============================================================================
-- Summary:
--   Tables  : clinics, staff_profiles, patients, appointments, consultations, payments
--   Triggers: set_updated_at (4 tables), prevent_locked_payment_modification (payments)
--   RLS     : enabled on all 6 tables with granular per-role policies
--   Functions: get_staff_clinic_id(), is_clinic_active(), get_staff_role(),
--              set_updated_at(), prevent_locked_payment_modification(),
--              generate_queue_token(uuid)
--   Indexes : 6 composite/single-column indexes for query performance
-- =============================================================================
