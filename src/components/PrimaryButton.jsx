import { createElement } from 'react';

/**
 * PrimaryButton – a thin wrapper around the semi‑button class.
 * It uses the brand primary color defined in theme.js.
 * Usage: <PrimaryButton onClick={handler}>文字</PrimaryButton>
 */
export default function PrimaryButton({ onClick, children, disabled = false }) {
  return (
    <button
      className="semi-button semi-button-primary"
      style={{ backgroundColor: '#FF3366' }}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
