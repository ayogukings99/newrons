import clsx from 'clsx'
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { variant?: 'primary' | 'secondary' | 'ghost'; size?: 'sm' | 'md' }
export function Button({ variant = 'primary', size = 'md', className, children, ...props }: ButtonProps) {
  return (
    <button className={clsx(
      'rounded font-semibold transition-colors focus:outline-none',
      size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm',
      variant === 'primary'   && 'bg-teal-600 hover:bg-teal-500 text-white',
      variant === 'secondary' && 'bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700',
      variant === 'ghost'     && 'hover:bg-gray-800/60 text-gray-400 hover:text-gray-200',
      props.disabled && 'opacity-50 cursor-not-allowed',
      className,
    )} {...props}>{children}</button>
  )
}
