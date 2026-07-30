import { Bank, Mountains, Sun, Waves } from '@phosphor-icons/react';
import { motion } from 'motion/react';
import type { ComponentType } from 'react';
import type { ActivityKind } from '../../../lib/palette.js';

interface ActivitySwitcherProps {
  selected: ActivityKind;
  available: readonly ActivityKind[];
  scores: Partial<Record<ActivityKind, number>>;
  onSelect: (activity: ActivityKind) => void;
}

interface TabConfig {
  kind: ActivityKind;
  label: string;
  Icon: ComponentType<{ size?: number; weight?: 'regular' | 'fill' | 'duotone' }>;
}

// Visual order is fixed (spec 05 §Routing). Ranking order is only used for the
// default selection, not for reordering tabs.
const TABS: readonly TabConfig[] = [
  { kind: 'SKIING', label: 'Ski', Icon: Mountains },
  { kind: 'SURFING', label: 'Surf', Icon: Waves },
  { kind: 'OUTDOOR_SIGHTSEEING', label: 'Outdoor', Icon: Sun },
  { kind: 'INDOOR_SIGHTSEEING', label: 'Indoor', Icon: Bank },
];

export function ActivitySwitcher({ selected, available, scores, onSelect }: ActivitySwitcherProps) {
  return (
    <div
      role="tablist"
      aria-label="Activity"
      className="relative inline-flex rounded-full border border-neutral-200 bg-white/70 p-1 backdrop-blur"
    >
      {TABS.map((tab) => {
        const isSelected = tab.kind === selected;
        const isAvailable = available.includes(tab.kind);
        const score = scores[tab.kind];
        return (
          <button
            key={tab.kind}
            type="button"
            role="tab"
            aria-selected={isSelected}
            aria-controls={`panel-${tab.kind}`}
            id={`tab-${tab.kind}`}
            disabled={!isAvailable}
            onClick={() => onSelect(tab.kind)}
            className={`relative z-10 flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              isSelected
                ? 'text-neutral-950'
                : isAvailable
                  ? 'text-neutral-600 hover:text-neutral-900'
                  : 'cursor-not-allowed text-neutral-300'
            }`}
          >
            {isSelected ? (
              <motion.span
                layoutId="activity-pill"
                className="absolute inset-0 -z-10 rounded-full bg-[color-mix(in_oklch,var(--activity-primary)_25%,white)]"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            ) : null}
            <tab.Icon size={18} weight={isSelected ? 'fill' : 'regular'} />
            <span>{tab.label}</span>
            {typeof score === 'number' ? (
              <span className="font-mono text-xs tabular-nums text-neutral-500">{score}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
