import { cn } from '@/lib/utils'
import {
  Search,
  type LucideIcon,
  Circle,
} from 'lucide-react'

// ---------- Button ----------
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  children: React.ReactNode
}
export function Button({ variant = 'primary', className, children, ...props }: ButtonProps) {
  const variants: Record<ButtonVariant, string> = {
    primary: 'bg-primary-fill text-primary-text hover:bg-black/85',
    secondary: 'bg-bg-secondary text-text-muted border border-border-subtle hover:bg-hover-bg',
    ghost: 'bg-transparent text-text-muted hover:bg-hover-bg',
    danger: 'bg-bg-secondary text-color-error border border-color-error hover:bg-color-error-bg',
  }
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-3 rounded-md px-5 py-3 text-base font-medium transition-fast',
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}

// ---------- Input ----------
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
}
export function Input({ label, className, ...props }: InputProps) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {label && <label className="text-sm font-medium text-text-muted">{label}</label>}
      <input
        className="w-full rounded-md border border-border-subtle bg-bg-secondary px-4 py-2.5 text-base text-text-primary placeholder:text-text-placeholder focus:border-text-muted focus:outline-none transition-fast"
        {...props}
      />
    </div>
  )
}

// ---------- Select ----------
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  options?: { value: string; label: string }[]
}
export function Select({ label, options, className, children, ...props }: SelectProps) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {label && <label className="text-sm font-medium text-text-muted">{label}</label>}
      <div className="relative">
        <select
          className="w-full appearance-none rounded-md border border-border-subtle bg-bg-secondary px-4 py-2.5 text-base text-text-primary focus:border-text-muted focus:outline-none transition-fast"
          {...props}
        >
          {options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
          {children}
        </select>
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted">
          ▼
        </span>
      </div>
    </div>
  )
}

// ---------- SearchInput ----------
export interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {}
export function SearchInput({ className, ...props }: SearchInputProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-3 rounded-md border border-transparent bg-bg-tertiary px-4 py-2.5 text-base transition-fast focus-within:border-text-muted',
        className
      )}
    >
      <Search className="h-4 w-4 text-text-placeholder" />
      <input
        className="min-w-0 flex-1 bg-transparent text-text-primary placeholder:text-text-placeholder focus:outline-none"
        {...props}
      />
    </div>
  )
}

// ---------- Badge ----------
export interface BadgeProps {
  children: React.ReactNode
  className?: string
}
export function Badge({ children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-sm px-2 py-0.5 text-xs font-medium text-text-muted bg-hover-bg',
        className
      )}
    >
      {children}
    </span>
  )
}

// ---------- Tag ----------
type TagVariant = 'success' | 'warning' | 'error' | 'info'
export interface TagProps {
  children: React.ReactNode
  variant?: TagVariant
  className?: string
}
export function Tag({ children, variant = 'success', className }: TagProps) {
  const map: Record<TagVariant, string> = {
    success: 'bg-color-success-bg text-color-success',
    warning: 'bg-color-warning-bg text-color-warning',
    error: 'bg-color-error-bg text-color-error',
    info: 'bg-color-info-bg text-color-info',
  }
  return (
    <span className={cn('inline-flex items-center justify-center rounded-sm px-2 py-0.5 text-xs font-medium', map[variant], className)}>
      {children}
    </span>
  )
}

// ---------- Avatar ----------
export interface AvatarProps {
  name?: string
  className?: string
}
export function Avatar({ name = '张', className }: AvatarProps) {
  return (
    <div
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-full bg-bg-tertiary text-xs font-semibold text-text-secondary',
        className
      )}
    >
      {name.charAt(0)}
    </div>
  )
}

// ---------- AvatarGroup ----------
export interface AvatarGroupProps {
  names?: string[]
  max?: number
  className?: string
}
export function AvatarGroup({ names = [], max = 3, className }: AvatarGroupProps) {
  const shown = names.slice(0, max)
  const extra = names.length - max
  return (
    <div className={cn('flex items-center', className)}>
      {shown.map((n, i) => (
        <Avatar key={i} name={n} className="-ml-1.5 first:ml-0 ring-2 ring-bg-primary" />
      ))}
      {extra > 0 && (
        <span className="-ml-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-bg-tertiary text-xs text-text-muted ring-2 ring-bg-primary">
          +{extra}
        </span>
      )}
    </div>
  )
}

// ---------- StatCard ----------
export interface StatCardProps {
  label: string
  value: React.ReactNode
  sub?: string
  className?: string
}
export function StatCard({ label, value, sub, className }: StatCardProps) {
  return (
    <div className={cn('flex flex-col gap-2 rounded-lg border border-border-subtle bg-bg-secondary p-4', className)}>
      <span className="text-sm font-medium text-text-muted">{label}</span>
      <span className="text-stat font-bold text-text-primary">{value}</span>
      {sub && <span className="text-xs text-text-muted">{sub}</span>}
    </div>
  )
}

// ---------- Panel ----------
export interface PanelProps {
  title?: string
  children: React.ReactNode
  className?: string
  right?: React.ReactNode
}
export function Panel({ title, children, className, right }: PanelProps) {
  return (
    <div className={cn('flex flex-col gap-4 rounded-lg border border-border-subtle bg-bg-secondary p-5', className)}>
      <div className="flex items-center justify-between">
        {title && (
          <h3 className="text-sm font-semibold uppercase tracking-wider text-text-muted">{title}</h3>
        )}
        {right}
      </div>
      {children}
    </div>
  )
}

// ---------- ListRow ----------
export interface ListRowProps {
  left: React.ReactNode
  right?: React.ReactNode
  className?: string
}
export function ListRow({ left, right, className }: ListRowProps) {
  return (
    <div className={cn('flex items-center justify-between gap-4 py-3', className)}>
      <div className="text-base text-text-primary">{left}</div>
      {right && <div className="text-sm text-text-muted">{right}</div>}
    </div>
  )
}

// ---------- ProgressBar ----------
export interface ProgressBarProps {
  value: number
  className?: string
  barClassName?: string
}
export function ProgressBar({ value, className, barClassName }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-bg-tertiary', className)}>
      <div
        className={cn('h-full rounded-full bg-primary-fill', barClassName)}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

// ---------- StatusDot ----------
export interface StatusDotProps {
  color?: string
  className?: string
}
export function StatusDot({ color = '#22C55E', className }: StatusDotProps) {
  return <span className={cn('inline-block h-2 w-2 rounded-full', className)} style={{ backgroundColor: color }} />
}

// ---------- LoadIndicator ----------
export interface LoadIndicatorProps {
  value: number
  className?: string
}
export function LoadIndicator({ value, className }: LoadIndicatorProps) {
  const color = value >= 100 ? '#EF4444' : value >= 80 ? '#F97316' : value >= 50 ? '#F59E0B' : '#10B981'
  return (
    <div className={cn('h-1.5 w-24 overflow-hidden rounded-full bg-bg-tertiary', className)}>
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, value)}%`, backgroundColor: color }} />
    </div>
  )
}

// ---------- NavItem ----------
export interface NavItemProps {
  icon?: LucideIcon
  label: string
  active?: boolean
  className?: string
  onClick?: () => void
}
export function NavItem({ icon: Icon = Circle, label, active, className, onClick }: NavItemProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-md px-4 py-2.5 text-sm font-medium transition-fast',
        active
          ? 'bg-primary-fill text-primary-text'
          : 'bg-transparent text-text-muted hover:bg-hover-bg hover:text-text-primary',
        className
      )}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" />
      <span>{label}</span>
    </button>
  )
}

// ---------- Tabs ----------
export interface TabsProps {
  tabs: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
  className?: string
}
export function Tabs({ tabs, value, onChange, className }: TabsProps) {
  return (
    <div className={cn('inline-flex items-center gap-1', className)}>
      {tabs.map((t) => {
        const active = t.value === value
        return (
          <button
            key={t.value}
            onClick={() => onChange(t.value)}
            className={cn(
              'rounded-md px-4 py-1.5 text-sm transition-fast',
              active ? 'bg-primary-fill font-semibold text-primary-text' : 'text-text-muted hover:bg-hover-bg'
            )}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

// ---------- EmptyState ----------
export interface EmptyStateProps {
  title?: string
  desc?: string
  className?: string
}
export function EmptyState({ title = '暂无数据', desc = '当前条件下没有匹配的内容', className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-4 py-10', className)}>
      <span className="text-lg font-semibold text-text-primary">{title}</span>
      <span className="text-sm text-text-muted">{desc}</span>
    </div>
  )
}

// ---------- SectionTitle ----------
export interface SectionTitleProps {
  children: React.ReactNode
  className?: string
}
export function SectionTitle({ children, className }: SectionTitleProps) {
  return (
    <h3 className={cn('text-sm font-semibold uppercase tracking-wider text-text-muted', className)}>
      {children}
    </h3>
  )
}

// ---------- TimelineItem ----------
export interface TimelineItemProps {
  title: string
  desc?: string
  time?: string
  className?: string
}
export function TimelineItem({ title, desc, time, className }: TimelineItemProps) {
  return (
    <div className={cn('flex gap-3', className)}>
      <div className="flex flex-col items-center">
        <span className="h-2.5 w-2.5 rounded-full bg-primary-fill" />
        <span className="mt-1 w-px flex-1 bg-border-subtle" />
      </div>
      <div className="flex flex-col gap-1 pb-5">
        <span className="text-base font-medium text-text-primary">{title}</span>
        {desc && <span className="text-sm text-text-muted">{desc}</span>}
        {time && <span className="text-xs text-text-muted">{time}</span>}
      </div>
    </div>
  )
}

// ---------- MetricMini ----------
export interface MetricMiniProps {
  label: string
  value: React.ReactNode
  className?: string
}
export function MetricMini({ label, value, className }: MetricMiniProps) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <span className="text-xs text-text-muted">{label}</span>
      <span className="text-lg font-semibold text-text-primary">{value}</span>
    </div>
  )
}

// ---------- Table helpers ----------
export interface TableProps {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}
export function Table({ children, className, style }: TableProps) {
  return <table className={cn('w-full border-collapse text-sm', className)} style={style}>{children}</table>
}
export function Thead({ children, className, style }: TableProps) {
  return <thead className={cn('bg-bg-tertiary text-text-muted', className)} style={style}>{children}</thead>
}
export function Tbody({ children, className, style }: TableProps) {
  return <tbody className={cn('divide-y divide-border-subtle', className)} style={style}>{children}</tbody>
}
export function Tr({ children, className, style }: TableProps) {
  return <tr className={cn('hover:bg-hover-bg transition-fast', className)} style={style}>{children}</tr>
}
export function Th({ children, className, style }: TableProps) {
  return <th className={cn('px-4 py-3 text-left font-medium', className)} style={style}>{children}</th>
}
export function Td({ children, className, style }: TableProps) {
  return <td className={cn('px-4 py-3 text-text-secondary', className)} style={style}>{children}</td>
}
