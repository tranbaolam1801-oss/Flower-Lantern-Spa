import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const buttonVariants = cva('inline-flex items-center justify-center gap-2 rounded-xl font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50 disabled:pointer-events-none', {
  variants: {variant: {default:'bg-primary text-white hover:bg-primary-hover',outline:'border border-border bg-white text-primary'},size:{default:'h-[54px] px-4',sm:'h-10 px-3'}},
  defaultVariants:{variant:'default',size:'default'},
});
export function Button({className,variant,size,asChild=false,...props}:React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & {asChild?:boolean}) {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={twMerge(clsx(buttonVariants({variant,size}),className))} {...props}/>;
}
