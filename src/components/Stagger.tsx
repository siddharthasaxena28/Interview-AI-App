'use client'

import { motion, type Variants } from 'framer-motion'

const containerVariants: Variants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.09,
      delayChildren: 0.05,
    },
  },
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 22 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: [0.21, 0.47, 0.32, 0.98] },
  },
}

export function StaggerContainer({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-60px' }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export function StaggerItem({
  children,
  className,
  lift,
}: {
  children: React.ReactNode
  className?: string
  lift?: boolean
}) {
  return (
    <motion.div
      variants={itemVariants}
      className={className}
      {...(lift && {
        whileHover: { y: -4, transition: { duration: 0.2, ease: 'easeOut' } },
        whileTap: { scale: 0.98 },
      })}
    >
      {children}
    </motion.div>
  )
}
