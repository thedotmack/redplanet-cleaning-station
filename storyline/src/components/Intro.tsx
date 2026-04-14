import Link from 'next/link'

import { IconLink } from '@/components/IconLink'
import { StarField } from '@/components/StarField'

function GitHubIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor" {...props}>
      <path d="M8 .198a8 8 0 0 0-8 8 7.999 7.999 0 0 0 5.47 7.59c.4.076.547-.172.547-.384 0-.19-.007-.694-.01-1.36-2.226.482-2.695-1.074-2.695-1.074-.364-.923-.89-1.17-.89-1.17-.725-.496.056-.486.056-.486.803.056 1.225.824 1.225.824.714 1.224 1.873.87 2.33.666.072-.518.278-.87.507-1.07-1.777-.2-3.644-.888-3.644-3.954 0-.873.31-1.586.823-2.146-.09-.202-.36-1.016.07-2.118 0 0 .67-.214 2.2.82a7.67 7.67 0 0 1 2-.27 7.67 7.67 0 0 1 2 .27c1.52-1.034 2.19-.82 2.19-.82.43 1.102.16 1.916.08 2.118.51.56.82 1.273.82 2.146 0 3.074-1.87 3.75-3.65 3.947.28.24.54.73.54 1.48 0 1.07-.01 1.93-.01 2.19 0 .21.14.46.55.38A7.972 7.972 0 0 0 16 8.199a8 8 0 0 0-8-8Z" />
    </svg>
  )
}

function RobotIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" {...props}>
      <path d="M12 2a1 1 0 0 1 1 1v2h3a3 3 0 0 1 3 3v2a1 1 0 1 1 2 0v2a1 1 0 1 1-2 0v2a3 3 0 0 1-3 3h-1v2a1 1 0 1 1-2 0v-2h-2v2a1 1 0 1 1-2 0v-2H8a3 3 0 0 1-3-3v-2a1 1 0 1 1-2 0v-2a1 1 0 1 1 2 0V8a3 3 0 0 1 3-3h3V3a1 1 0 0 1 1-1zM9 10a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm6 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2z" />
    </svg>
  )
}

export function Intro() {
  return (
    <>
      <div>
        <Link href="/" className="inline-flex items-center gap-2">
          <RobotIcon className="h-8 w-8 text-sky-400" />
          <span className="font-display text-lg font-semibold text-white">MARS</span>
        </Link>
      </div>
      <h1 className="mt-14 font-display text-4xl/tight font-light text-white">
        The day a robot{' '}
        <span className="text-sky-300">saw, spoke, and thought</span>
      </h1>
      <p className="mt-4 text-sm/6 text-gray-300">
        On April 12, 2026, a MARS robot delivered a 4-minute presentation
        about self-maintenance to a live audience. It looked in a mirror,
        analyzed what it saw, spoke about what it understood, and drove
        itself through a cleaning station made of brushes and chair legs.
        Every photo on this page was taken by the robot itself.
      </p>
      <p className="mt-4 text-sm/6 text-gray-400">
        Total hardware cost: a $20 trip to Target.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-x-1 gap-y-3 sm:gap-x-2 lg:justify-start">
        <IconLink href="https://github.com/thedotmack/redplanet-cleaning-station" icon={GitHubIcon} className="flex-none">
          GitHub
        </IconLink>
      </div>
    </>
  )
}

export function IntroFooter() {
  return (
    <p className="flex items-baseline gap-x-2 text-[0.8125rem]/6 text-gray-500">
      Red Planet Cleaning Station
    </p>
  )
}
