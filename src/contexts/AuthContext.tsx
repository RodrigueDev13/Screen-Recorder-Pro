import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { GoogleUser, AuthContextType } from '../types/auth';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGoogleLoaded, setIsGoogleLoaded] = useState(false);

  useEffect(() => {
    // Vérifier si l'utilisateur est déjà connecté
    const savedUser = localStorage.getItem('googleUser');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }

    // Charger le script Google Sign-In seulement si pas déjà chargé
    if (!window.google && !document.querySelector('script[src*="accounts.google.com"]')) {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      
      script.onload = () => {
        setIsGoogleLoaded(true);
        initializeGoogleSignIn();
      };
      
      script.onerror = () => {
        console.error('Failed to load Google Sign-In script');
        setIsLoading(false);
      };
      
      document.head.appendChild(script);
    } else if (window.google) {
      setIsGoogleLoaded(true);
      initializeGoogleSignIn();
    } else {
      setIsLoading(false);
    }

    return () => {
      // Cleanup: disable auto-select when component unmounts
      if (window.google?.accounts?.id) {
        try {
          window.google.accounts.id.disableAutoSelect();
        } catch (error) {
          console.log('Error disabling auto-select:', error);
        }
      }
    };
  }, []);

  const initializeGoogleSignIn = () => {
    if (!window.google?.accounts?.id) {
      setIsLoading(false);
      return;
    }

    try {
      // Cancel any existing prompts before initializing
      window.google.accounts.id.cancel();
      
      window.google.accounts.id.initialize({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse,
        auto_select: false,
        cancel_on_tap_outside: true,
        use_fedcm_for_prompt: false, // Disable FedCM to avoid conflicts
      });
    } catch (error) {
      console.error('Error initializing Google Sign-In:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCredentialResponse = (response: any) => {
    try {
      // Décoder le JWT token
      const payload = JSON.parse(atob(response.credential.split('.')[1]));
      
      const googleUser: GoogleUser = {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
      };

      setUser(googleUser);
      localStorage.setItem('googleUser', JSON.stringify(googleUser));
    } catch (error) {
      console.error('Erreur lors du traitement de la réponse Google:', error);
    }
  };

  const signIn = () => {
    if (!window.google?.accounts?.id) {
      console.error('Google Sign-In not loaded');
      return;
    }

    try {
      // Cancel any existing prompts before starting new one
      window.google.accounts.id.cancel();
      
      // Small delay to ensure cancellation is processed
      setTimeout(() => {
        window.google.accounts.id.prompt();
      }, 100);
    } catch (error) {
      console.error('Error during sign in:', error);
    }
  };

  const signOut = () => {
    setUser(null);
    localStorage.removeItem('googleUser');
    if (window.google?.accounts?.id) {
      try {
        window.google.accounts.id.disableAutoSelect();
      } catch (error) {
        console.log('Error during sign out:', error);
      }
    }
  };

  const value: AuthContextType = {
    user,
    isLoading,
    signIn,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};