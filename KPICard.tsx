import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface KPICardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  change?: {
    value: number;
    isPositive: boolean;
  };
  className?: string;
  variant?: 'default' | 'accent' | 'success' | 'warning';
}

export default function KPICard({
  icon: Icon,
  label,
  value,
  change,
  className,
  variant = 'default',
}: KPICardProps) {
  const variantClasses = {
    default: 'border-border hover:border-accent/50',
    accent: 'border-accent/30 bg-accent/5',
    success: 'border-green-500/30 bg-green-500/5',
    warning: 'border-yellow-500/30 bg-yellow-500/5',
  };

  const iconColors = {
    default: 'text-muted-foreground',
    accent: 'text-accent',
    success: 'text-green-400',
    warning: 'text-yellow-400',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={{ y: -2 }}
      className={cn(
        'bg-card border rounded-lg p-6 transition-all duration-150',
        variantClasses[variant],
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-muted-foreground font-sans mb-2">{label}</p>
          <div className="flex items-baseline gap-2">
            <h3 className="font-mono font-bold text-3xl text-foreground">{value}</h3>
            {change && (
              <span
                className={cn(
                  'text-xs font-medium',
                  change.isPositive ? 'text-green-400' : 'text-red-400'
                )}
              >
                {change.isPositive ? '+' : '-'}{change.value}%
              </span>
            )}
          </div>
        </div>
        <div className={cn('p-3 rounded-md bg-secondary', iconColors[variant])}>
          <Icon size={24} />
        </div>
      </div>
    </motion.div>
  );
}
