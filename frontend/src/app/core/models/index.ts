export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  plan: string;
  role: string;
  verified: boolean;
  [key: string]: unknown;
}
