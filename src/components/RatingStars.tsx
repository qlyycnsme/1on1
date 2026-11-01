import { Heart } from 'lucide-react'

interface Props {
  /** Current value (1-5). 0 = none selected. */
  value: number
  /** If provided, renders interactive hearts; otherwise read-only. */
  onChange?: (v: number) => void
  size?: 'sm' | 'md' | 'lg'
}

const sizeMap = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-8 w-8' }

export function RatingStars({ value, onChange, size = 'md' }: Props) {
  const sz = sizeMap[size]
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= value
        return (
          <button
            key={n}
            type="button"
            disabled={!onChange}
            onClick={() => onChange?.(n)}
            className={`transition-transform ${onChange ? 'cursor-pointer hover:scale-110 active:scale-95' : 'cursor-default'} disabled:cursor-default`}
            aria-label={`${n} hearts`}
          >
            <Heart
              className={sz}
              style={{
                fill: filled ? '#e11d48' : 'transparent',
                color: filled ? '#e11d48' : 'var(--subtle)',
                transition: 'fill 0.15s, color 0.15s',
              }}
            />
          </button>
        )
      })}
    </div>
  )
}

/** Renders a read-only fractional display (avg) with one decimal. */
export function RatingDisplay({ avg, count }: { avg: number | null; count: number }) {
  if (avg === null) return <span style={{ color: 'var(--subtle)', fontSize: '0.75rem' }}>—</span>
  const filled = Math.round(avg)
  return (
    <div className="flex items-center gap-1.5">
      <RatingStars value={filled} size="sm" />
      <span className="tabular-nums text-xs font-semibold" style={{ color: 'var(--ink)' }}>
        {avg.toFixed(1)}
      </span>
      <span className="text-xs" style={{ color: 'var(--subtle)' }}>({count})</span>
    </div>
  )
}
