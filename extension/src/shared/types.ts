export interface FormField {
  id: string;
  type: 'text' | 'password' | 'email' | 'number' | 'date' | 'select' | 'textarea' | 'richtext' | 'file' | 'url' | 'phone' | 'otp';
  label: string;
  sensitive?: boolean;
}

export interface CredentialEntry {
  fileId: string;
  name: string;
  category: string;
  fields: { id: string; label: string; type: string; value: string; sensitive: boolean }[];
  url?: string;
  username?: string;
  password?: string;
}

export interface DetectedField {
  selector: string;
  type: 'username' | 'password' | 'email' | 'text';
  label: string;
}

// Messages between content script, background, and popup
export type ExtMessage =
  | { type: 'GET_CREDENTIALS'; domain: string }
  | { type: 'CREDENTIALS_RESULT'; entries: CredentialEntry[] }
  | { type: 'FILL_FORM'; entry: CredentialEntry }
  | { type: 'FILL_FIELD'; selector: string; value: string }
  | { type: 'GET_AUTH_STATE' }
  | { type: 'AUTH_STATE'; uid: string | null; email: string | null }
  | { type: 'SIGN_OUT' }
  | { type: 'GET_PAGE_FIELDS' }
  | { type: 'PAGE_FIELDS'; fields: DetectedField[] }
  | { type: 'FIELDS_FILLED'; count: number }
  | { type: 'OAUTH_START'; providerId: string }
  | { type: 'OAUTH_COMPLETE'; idToken: string; accessToken: string | null; providerId: string }
  | { type: 'OAUTH_ERROR'; message: string }
  | { type: 'REQUEST_PAGE_TOKEN' }
  | { type: 'ERROR'; message: string };
