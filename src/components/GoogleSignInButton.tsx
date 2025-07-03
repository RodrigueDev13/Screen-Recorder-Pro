import React, { useEffect, useRef, useState } from 'react';

const GoogleSignInButton: React.FC = () => {
  const buttonRef = useRef<HTMLDivElement>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // Prevent multiple initializations
    if (isInitialized || !window.google || !buttonRef.current) {
      return;
    }

    try {
      // Clear any existing button content to prevent conflicts
      if (buttonRef.current) {
        buttonRef.current.innerHTML = '';
      }

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
    } catch (error) {
      console.error('Error rendering Google Sign-In button:', error);
    }

    // Cleanup function to prevent memory leaks and conflicts
    return () => {
      if (buttonRef.current) {
        buttonRef.current.innerHTML = '';
      }
      setIsInitialized(false);
    };
  }, [isInitialized]);

  return (
    <div className="flex flex-col items-center">
      <div ref={buttonRef}></div>
    </div>
  );
};

export default GoogleSignInButton;