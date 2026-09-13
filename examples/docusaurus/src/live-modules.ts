import * as React from 'react';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  children?: React.ReactNode;
  variant?: 'primary' | 'secondary';
};

export const Button = ({ children, variant = 'primary', className, ...rest }: ButtonProps) =>
  React.createElement(
    'button',
    {
      type: 'button',
      ...rest,
      className: ['nl-btn', variant === 'secondary' ? 'nl-btn--secondary' : 'nl-btn--primary', className]
        .filter(Boolean)
        .join(' '),
    },
    children,
  );

export const Badge = ({ children }: { children?: React.ReactNode }) =>
  React.createElement('span', { className: 'nl-badge' }, children);

export const Card = ({
  title,
  children,
}: {
  title?: string;
  children?: React.ReactNode;
}) =>
  React.createElement(
    'div',
    { className: 'nl-card' },
    title ? React.createElement('div', { className: 'nl-card__title' }, title) : null,
    React.createElement('div', { className: 'nl-card__body' }, children),
  );
