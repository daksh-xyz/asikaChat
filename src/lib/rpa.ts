const DEFAULT_RPA_BASE_URL = 'http://localhost:5000';

const RPA_BASE_URL =
  import.meta.env?.VITE_RPA_BACKEND_URL?.toString().trim() || DEFAULT_RPA_BASE_URL;

interface TriggerPayload {
  patientId?: string;
  patientData?: Record<string, unknown>;
}

interface TriggerResult {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * Notify the RPA backend that a patient registration has completed successfully.
 * The RPA service will fetch the patient data from Supabase and execute its
 * patient registration workflow.
 */
export async function triggerPatientRegistrationWorkflow(
  payload: TriggerPayload,
): Promise<TriggerResult> {
  try {
    const response = await fetch(`${RPA_BASE_URL}/api/workflows/patient-registration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: errorText || `Request failed with status ${response.status}`,
      };
    }

    return (await response.json()) as TriggerResult;
  } catch (error) {
    console.error('Failed to trigger RPA patient registration workflow', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error triggering workflow',
    };
  }
}


