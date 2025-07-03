import React, { useEffect, useRef, useState } from 'react';

interface GoogleSignInButtonProps {
  isLoading: boolean;
}

const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({ isLoading }) => {
  const buttonRef = useRef<HTMLDivElement>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [renderAttempts, setRenderAttempts] = useState(0);

  useEffect(() => {
    // Prevent multiple initializations and wait for auth context to finish loading
    if (isInitialized || isLoading || !window.google?.accounts?.id || !buttonRef.current) {
      return;
    }

    // Limit render attempts to prevent infinite loops
    if (renderAttempts >= 3) {
      console.warn('Max render attempts reached for Google Sign-In button');
      return;
    }

    const renderButton = () => {
      try {
        // Clear any existing button content to prevent conflicts
        if (buttonRef.current) {
          buttonRef.current.innerHTML = '';
        }

        // Cancel any existing prompts before rendering button
        window.google.accounts.id.cancel();

        // Small delay to ensure cancellation is processed
        setTimeout(() => {
          if (buttonRef.current && window.google?.accounts?.id) {
            window.google.accounts.id.renderButton(buttonRef.current, {
              theme: 'outline',
              size: 'large',
              type: 'standard',
              text: 'signin_with',
              shape: 'rectangular',
              logo_alignment: 'left',
              width: 250,
            });

            setIsInitialized(true);
          }
        }, 100);

      } catch (error) {
        console.error('Error rendering Google Sign-In button:', error);
        setRenderAttempts(prev => prev + 1);
        
        // Retry after a delay if not too many attempts
        if (renderAttempts < 2) {
          setTimeout(renderButton, 1000);
        }
      }
    };

    renderButton();

    // Cleanup function to prevent memory leaks and conflicts
    return () => {
      if (buttonRef.current) {
        buttonRef.current.innerHTML = '';
      }
      setIsInitialized(false);
    };
  }, [isInitialized, isLoading, renderAttempts]);

  // Reset render attempts when loading state changes
  useEffect(() => {
    if (!isLoading) {
      setRenderAttempts(0);
    }
  }, [isLoading]);

  return (
    <div className="flex flex-col items-center">
      <div ref={buttonRef}></div>
      {renderAttempts >= 3 && (
        <p className="text-sm text-gray-500 mt-2">
          Problème de chargement du bouton Google. Veuillez rafraîchir la page.
        </p>
      )}
    </div>
  );
};

export default GoogleSignInButton;