// Minimal typings for the Google Identity Services script (accounts.google.com/gsi/client).
type GoogleCredentialResponse = { credential: string; select_by?: string };
type GoogleCodeResponse = {
  code?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

interface Window {
  google?: {
    accounts: {
      id: {
        initialize(config: {
          client_id: string;
          callback: (response: GoogleCredentialResponse) => void;
          auto_select?: boolean;
          cancel_on_tap_outside?: boolean;
          use_fedcm_for_prompt?: boolean;
          itp_support?: boolean;
          context?: "signin" | "signup" | "use";
        }): void;
        prompt(): void;
        renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
        disableAutoSelect(): void;
        cancel(): void;
      };
      oauth2: {
        initCodeClient(config: {
          client_id: string;
          scope: string;
          ux_mode?: "popup" | "redirect";
          callback: (response: GoogleCodeResponse) => void;
          error_callback?: (error: { type: string; message?: string }) => void;
          login_hint?: string;
          prompt?: string;
          include_granted_scopes?: boolean;
        }): { requestCode(): void };
      };
    };
  };
}
