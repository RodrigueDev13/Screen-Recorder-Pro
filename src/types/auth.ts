export interface GoogleUser {
  id: string;
  email: string;
  name: string;
  picture: string;
}

export interface AuthContextType {
  user: GoogleUser | null;
  isLoading: boolean;
  signIn: () => void;
  signOut: () => void;
}

declare global {
  interface Window {
    google: {
      accounts: {
        id: {
          initialize: (config: any) => void;
          prompt: () => void;
          renderButton: (element: HTMLElement, config: any) => void;
          disableAutoSelect: () => void;
        };
      };
    };
  }
}