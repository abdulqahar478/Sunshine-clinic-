/**
 * clinic-config.js
 * Global configuration for the AQ MedTech Innovations Clinic Management System.
 * Demo clinic: Sunrise Family Clinic & Maternity Home
 *
 * Usage: Include this file before any other app scripts.
 * Access config via: window.CLINIC_CONFIG
 */

(function () {
  "use strict";

  window.CLINIC_CONFIG = {

    /* ─────────────────────────────────────────────
       1. IDENTITY
    ───────────────────────────────────────────── */
    clinicId: "clinic_001",
    name: "Sunrise Family Clinic & Maternity Home",
    tagline: "Caring for Every Stage of Life",
    logoUrl: "", // Empty triggers initials fallback ("SF")

    /* ─────────────────────────────────────────────
       2. BRAND COLOURS
    ───────────────────────────────────────────── */
    primaryColor: "#1a6b3c",
    secondaryColor: "#f59e0b",
    accentColor: "#0ea5e9",

    /* ─────────────────────────────────────────────
       3. CONTACT & LOCATION
    ───────────────────────────────────────────── */
    address: "14 Adeola Odeku Street, Victoria Island",
    city: "Lagos",
    state: "Lagos State",
    phone: "+234 801 234 5678",
    whatsappNumber: "2348012345678",          // No + prefix
    emergencyPhone: "+234 800 911 1234",
    email: "hello@sunriseclinicng.com",
    mapLink: "https://maps.google.com/?q=Sunrise+Family+Clinic+Victoria+Island+Lagos",
    landmarks: [
      "Opposite First Bank, Adeola Odeku Branch",
      "200 m from Civic Centre, Victoria Island",
      "Adjacent NICON Luxury Hotel",
      "5 minutes from Bar Beach (Oniru)"
    ],

    /* ─────────────────────────────────────────────
       4. OPENING HOURS
    ───────────────────────────────────────────── */
    openingHours: {
      weekdays: "Monday – Friday: 7:00 AM – 8:00 PM",
      saturday: "Saturday: 8:00 AM – 5:00 PM",
      sunday: "Sunday & Public Holidays: 10:00 AM – 2:00 PM (Emergency only after hours)"
    },

    /* ─────────────────────────────────────────────
       5. SERVICES  (7 items)
    ───────────────────────────────────────────── */
    services: [
      {
        icon: "🩺",
        title: "Outpatient Consultation",
        description:
          "Comprehensive general and specialist outpatient care for adults and children. Walk-ins and appointments are both welcome."
      },
      {
        icon: "🤱",
        title: "Maternity & Antenatal Care (ANC)",
        description:
          "Full antenatal booking, ultrasound monitoring, skilled birth attendance, postnatal care, and family planning counselling."
      },
      {
        icon: "🧪",
        title: "Diagnostic Laboratory",
        description:
          "On-site NAFDAC-registered laboratory offering malaria RDT/microscopy, full blood count, urinalysis, E/U/Cr, blood sugar, Hepatitis B/C, HIV screening, and more. Results within the hour."
      },
      {
        icon: "🏥",
        title: "Surgical Services",
        description:
          "Minor and intermediate surgical procedures including wound care, hernia repair, appendectomy, caesarean section, and laparoscopic referrals."
      },
      {
        icon: "🦷",
        title: "Dental Unit",
        description:
          "Preventive and restorative dentistry: tooth extraction, scaling & polishing, fillings, root canal therapy, and orthodontic referrals."
      },
      {
        icon: "👁️",
        title: "Optical & Eye Clinic",
        description:
          "Visual acuity testing, refraction, prescription glasses, tonometry for glaucoma screening, and referral for specialist ophthalmic care."
      },
      {
        icon: "💊",
        title: "Pharmacy",
        description:
          "Fully-stocked, registered community pharmacy dispensing prescribed and OTC medications. Medication counselling and drug-interaction checks included."
      }
    ],

    /* ─────────────────────────────────────────────
       6. DOCTORS
    ───────────────────────────────────────────── */
    doctors: [
      {
        name: "Dr. Chukwuemeka Obi",
        specialty: "General Practitioner & Medical Director",
        qualifications: "MBBS (University of Lagos), MPH (LUTH)",
        consultingDays: "Monday, Wednesday, Friday",
        photoUrl: ""
      },
      {
        name: "Dr. Adaeze Nwosu",
        specialty: "Obstetrician & Gynaecologist",
        qualifications: "MBBS (Obafemi Awolowo University), FWACS (O&G)",
        consultingDays: "Tuesday, Thursday, Saturday",
        photoUrl: ""
      },
      {
        name: "Dr. Babatunde Fashola",
        specialty: "Paediatrician",
        qualifications: "MBBS (University of Ibadan), FWACP (Paediatrics)",
        consultingDays: "Monday, Tuesday, Thursday",
        photoUrl: ""
      },
      {
        name: "Dr. Fatima Al-Hassan",
        specialty: "Dentist",
        qualifications: "BDS (Bayero University Kano), FWACS (Oral & Maxillofacial Surgery)",
        consultingDays: "Wednesday, Friday, Saturday",
        photoUrl: ""
      }
    ],

    /* ─────────────────────────────────────────────
       7. HMO PARTNERS
    ───────────────────────────────────────────── */
    hmos: [
      "NHIA",
      "Hygeia HMO",
      "Reliance HMO",
      "AXA Mansard",
      "Avon HMO",
      "Clearline HMO",
      "Total Health Trust",
      "Leadway Health"
    ],

    /* ─────────────────────────────────────────────
       8. SUPABASE (Backend-as-a-Service)
    ───────────────────────────────────────────── */
    supabase: {
      url: "https://YOUR_PROJECT_ID.supabase.co",
      anonKey: "YOUR_SUPABASE_ANON_KEY_HERE"
    },

    /* ─────────────────────────────────────────────
       9. PWA / APP META
    ───────────────────────────────────────────── */
    appName: "Sunrise Clinic Portal",
    appShortName: "SunriseClinic",
    themeColor: "#1a6b3c",

    /* ─────────────────────────────────────────────
       10. WHATSAPP MESSAGE TEMPLATES
           Variables: {patientName}, {drugs}, {nextDate}, {clinicName}
    ───────────────────────────────────────────── */
    whatsappTemplates: {
      followUp:
        "Hello {patientName} 👋,\n\n" +
        "This is a friendly reminder from *{clinicName}*.\n\n" +
        "Your follow-up appointment is scheduled for *{nextDate}*. " +
        "Please remember to bring your treatment card, lab results, and any medication currently being taken.\n\n" +
        "To confirm or reschedule, reply to this message or call us on our main line.\n\n" +
        "Stay healthy! 🌿\n" +
        "— The {clinicName} Team",

      refillReminder:
        "Hello {patientName} 👋,\n\n" +
        "A message from *{clinicName}* — your pharmacy team.\n\n" +
        "⚠️ Your prescription refill for *{drugs}* is due on *{nextDate}*. " +
        "Please visit our pharmacy or call ahead so we can have your medication ready for you.\n\n" +
        "Consistent medication adherence is key to your recovery. " +
        "Do not hesitate to reach out if you have any questions about your drugs.\n\n" +
        "Take care! 💊\n" +
        "— {clinicName} Pharmacy"
    },

    /* ─────────────────────────────────────────────
       11. VENDOR DETAILS
    ───────────────────────────────────────────── */
    vendorName: "AQ MedTech Innovations",
    vendorWhatsapp: "2348098765432",
    vendorEmail: "support@aqmedtech.ng"

  };

  // Defensive freeze — prevents accidental mutation at runtime
  Object.freeze(window.CLINIC_CONFIG.openingHours);
  Object.freeze(window.CLINIC_CONFIG.supabase);
  Object.freeze(window.CLINIC_CONFIG.whatsappTemplates);

  if (typeof console !== "undefined" && console.info) {
    console.info(
      "[CLINIC_CONFIG] Loaded configuration for:",
      window.CLINIC_CONFIG.name,
      "| Clinic ID:", window.CLINIC_CONFIG.clinicId
    );
  }
})();
