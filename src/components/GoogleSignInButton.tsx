import React, { useEffect, useRef } from 'react';

const GoogleSignInButton: React.FC = () => {
  const buttonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.google && buttonRef.current) {
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: 'outline',
        size: 'large',
        type: 'standard',
        text: 'signin_with',
        shape: 'rectangular',
        logo_alignment: 'left',
        width: 250,
      });
    }
  }, []);

  return (
    <div className="flex flex-col items-center">
      <div ref={buttonRef}></div>
    </div>
  );
};

export default GoogleSignInButton;