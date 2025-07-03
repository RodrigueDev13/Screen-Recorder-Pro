import React, { useEffect, useRef, useState } from 'react';

interface GoogleSignInButtonProps {
  isLoading: boolean;
}

const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({ isLoading }) => {
  const buttonRef = useRef<HTMLDivElement>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // Prevent multiple initializations and wait for auth context to finish loading
    if (isInitialized || isLoading || !window.google?.accounts?.id || !buttonRef.current) {
      return;
    }

    const renderButton = () => {
      try {
        // Clear any existing button content to prevent conflicts
        if (buttonRef.current) {
          buttonRef.current.innerHTML = '';
        }

        // Render the button directly without setTimeout
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

      } catch (error) {
        console.error('Error rendering Google Sign-In button:', error);
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
  }, [isInitialized, isLoading]);

  return (
    <div className="flex flex-col items-center">
      <div ref={buttonRef}></div>
    </div>
  );
};

export default GoogleSignInButton;