import { createClient } from '@supabase/supabase-js';

// Supabase configuration
const supabaseUrl = 'https://ykalfzcfddigcdwwpngi.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlrYWxmemNmZGRpZ2Nkd3dwbmdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI1MzgxODAsImV4cCI6MjA3ODExNDE4MH0.xe6NDvJnripOzkvltikgUu1RAHb1SdmlBWsciJMRLLU';

// Initialize Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Type for patient data
export interface PatientData {
  firstName: string;
  lastName: string;
  phone?: number;
  dateOfBirth: string;
  gender: string;
  country: string;
}

/**
 * Save patient registration data to Supabase
 * @param patientData - The patient information to save
 * @returns Object with success status and patient ID or error message
 */
export async function savePatientData(patientData: PatientData): Promise<{
  success: boolean;
  patientId?: string;
  error?: string;
}> {
  try {
    // Insert patient data into the 'patients' table
    const { data, error } = await supabase
      .from('patients')
      .insert([
        {
          first_name: patientData.firstName,
          last_name: patientData.lastName,
          phone: patientData.phone,
          date_of_birth: patientData.dateOfBirth,
          gender: patientData.gender,
          country: patientData.country,
          created_at: new Date().toISOString(),
        },
      ])
      .select('id')
      .single();

    if (error) {
      console.error('Error saving patient data:', error);
      return {
        success: false,
        error: error.message || 'Failed to save patient data',
      };
    }

    return {
      success: true,
      patientId: data?.id || 'Unknown',
    };
  } catch (err) {
    console.error('Exception while saving patient data:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'An unexpected error occurred',
    };
  }
}

