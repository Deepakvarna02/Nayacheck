import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'tertiary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  fullWidth?: boolean;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  disabled,
  children,
  className = '',
  ...props
}) => {
  const baseClass =
    'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-amber-500 disabled:cursor-not-allowed disabled:opacity-50';

  const sizeClass = {
    sm: 'px-4 py-2 text-xs',
    md: 'px-5 py-3 text-sm',
    lg: 'px-6 py-3.5 text-sm'
  };

  const variantClass = {
    primary: 'bg-ink text-white hover:-translate-y-0.5 hover:shadow-md',
    secondary: 'border border-slate-300 bg-white/90 text-slate-700 hover:-translate-y-0.5 hover:shadow-md',
    tertiary: 'border border-slate-200 bg-white/70 text-slate-600 hover:bg-white/90',
    danger: 'bg-rose-600 text-white hover:bg-rose-700 hover:shadow-md'
  };

  return (
    <button
      disabled={disabled || loading}
      className={`${baseClass} ${sizeClass[size]} ${variantClass[variant]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...props}
    >
      {loading ? <span className="h-4 w-4 spinner" aria-hidden="true"></span> : null}
      {children}
    </button>
  );
};
