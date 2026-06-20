import { cn } from '@/lib/utils'
import {
  Search,
  type LucideIcon,
  Circle,
} from 'lucide-react'
import { useId } from 'react'

// ---------- Button ----------
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  children: React.ReactNode
}
export function Button({ variant = 'primary', className, children, ...props }: ButtonProps) {
  const variants: Record<ButtonVariant, string> = {
    primary: 'bg-primary-fill text-primary-text shadow-[0_1px_0_rgba(255,255,255,0.08)_inset] hover:bg-black/85',
    secondary: 'bg-bg-secondary text-text-secondary border border-border-subtle hover:bg-hover-bg',
    ghost: 'bg-transparent text-text-muted hover:bg-hover-bg',
    danger: 'bg-bg-secondary text-color-error border border-color-error hover:bg-color-error-bg',
  }
  return (
    <button
      className={cn(
        'inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-fast disabled:cursor-not-allowed disabled:opacity-50',
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
  const generatedId = useId()
  const inputId = props.id ?? props.name ?? generatedId
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {label && <label htmlFor={inputId} className="text-sm font-medium text-text-muted">{label}</label>}
      <input
        {...props}
        id={inputId}
        name={props.name ?? inputId}
        className="h-10 w-full rounded-md border border-border-subtle bg-bg-secondary px-3 text-base text-text-primary placeholder:text-text-placeholder transition-fast focus:border-text-muted focus:outline-none"
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
  const generatedId = useId()
  const selectId = props.id ?? props.name ?? generatedId
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {label && <label htmlFor={selectId} className="text-sm font-medium text-text-muted">{label}</label>}
      <div className="relative">
        <select
          {...props}
          id={selectId}
          name={props.name ?? selectId}
          className="h-10 w-full appearance-none rounded-md border border-border-subtle bg-bg-secondary px-3 pr-8 text-base text-text-primary transition-fast focus:border-text-muted focus:outline-none"
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
export type SearchInputProps = React.InputHTMLAttributes<HTMLInputElement>
export function SearchInput({ className, ...props }: SearchInputProps) {
  return (
    <div
      className={cn(
        'inline-flex h-9 items-center gap-2 rounded-md border border-border-subtle bg-bg-tertiary px-3 text-base transition-fast focus-within:border-text-muted',
        className
      )}
    >
      <Search className="h-4 w-4 text-text-placeholder" />
      <input
        {...props}
        name={props.name ?? 'search'}
        className="min-w-0 flex-1 bg-transparent text-text-primary placeholder:text-text-placeholder focus:outline-none"
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
        'inline-flex items-center justify-center rounded-sm bg-hover-bg px-2 py-0.5 text-xs font-medium text-text-muted',
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
  src?: string | null
  className?: string
}
export function Avatar({ name = '张', src, className }: AvatarProps) {
  return (
    <div
      className={cn(
        'flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-bg-tertiary text-xs font-semibold text-text-secondary',
        className
      )}
    >
      {src ? <img src={src} alt={name} className="h-full w-full object-cover" /> : name.charAt(0)}
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
    <div className={cn('flex min-h-[88px] flex-col justify-center gap-1.5 rounded-md border border-border-subtle bg-bg-secondary p-4', className)}>
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
  footer?: React.ReactNode
}
export function Panel({ title, children, className, right, footer }: PanelProps) {
  return (
    <div className={cn('flex flex-col rounded-md border border-border-subtle bg-bg-secondary', className)}>
      {(title || right) && <div className="flex min-h-12 items-center justify-between border-b border-border-subtle px-4">
        {title && (
          <h3 className="text-base font-semibold text-text-primary">{title}</h3>
        )}
        {right}
      </div>}
      <div className="flex min-w-0 flex-1 flex-col p-4">{children}</div>
      {footer && <div className="border-t border-border-subtle px-4 py-3">{footer}</div>}
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
  compact?: boolean
  className?: string
  onClick?: () => void
}
export function NavItem({ icon: Icon = Circle, label, active, compact, className, onClick }: NavItemProps) {
  return (
    <button
      onClick={onClick}
      title={compact ? label : undefined}
      className={cn(
        'flex h-10 w-full items-center rounded-md text-sm font-medium transition-fast',
        compact ? 'justify-center px-0' : 'gap-2.5 px-2.5',
        active
          ? 'bg-selected-bg text-text-primary'
          : 'bg-transparent text-text-secondary hover:bg-hover-bg hover:text-text-primary',
        className
      )}
    >
      {active && !compact && <span className="-ml-2 h-5 w-0.5 rounded-full bg-primary-fill" />}
      <Icon className="h-[18px] w-[18px] shrink-0 text-current" />
      {!compact && <span>{label}</span>}
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
              'rounded-md px-3 py-1.5 text-sm transition-fast',
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
    <div className={cn('flex flex-col items-center justify-center gap-3 py-10', className)}>
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
export interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}
export function Table({ children, className, style, ...props }: TableProps) {
  return <table className={cn('w-full border-collapse text-sm', className)} style={style} {...props}>{children}</table>
}
export function Thead({ children, className, style }: TableProps) {
  return <thead className={cn('border-b border-border-subtle bg-bg-tertiary text-text-muted', className)} style={style}>{children}</thead>
}

interface TbodyProps extends React.HTMLAttributes<HTMLTableSectionElement> {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}
export function Tbody({ children, className, style, ...props }: TbodyProps) {
  return <tbody className={cn('divide-y divide-border-subtle', className)} style={style} {...props}>{children}</tbody>
}

interface TrProps extends React.HTMLAttributes<HTMLTableRowElement> {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}
export function Tr({ children, className, style, ...props }: TrProps) {
  return <tr className={cn('hover:bg-hover-bg transition-fast', className)} style={style} {...props}>{children}</tr>
}

interface ThProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}
export function Th({ children, className, style, ...props }: ThProps) {
  return <th className={cn('h-10 px-3 text-left font-medium', className)} style={style} {...props}>{children}</th>
}

interface TdProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}
export function Td({ children, className, style, ...props }: TdProps) {
  return <td className={cn('px-3 py-3 text-text-secondary', className)} style={style} {...props}>{children}</td>
}
