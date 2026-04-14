'use client'

import { useState, useRef, useEffect } from 'react'

type Observation = {
  id: number
  timestamp: string
  type: string
  title: string
  narrative: string
}

export function ProofItem({
  children,
  observation,
}: {
  children: React.ReactNode
  observation: Observation
}) {
  let [isOpen, setIsOpen] = useState(false)
  let [position, setPosition] = useState<'above' | 'below'>('above')
  let triggerRef = useRef<HTMLLIElement>(null)
  let timeoutRef = useRef<ReturnType<typeof setTimeout>>(null)

  useEffect(() => {
    if (isOpen && triggerRef.current) {
      let rect = triggerRef.current.getBoundingClientRect()
      let spaceAbove = rect.top
      setPosition(spaceAbove < 320 ? 'below' : 'above')
    }
  }, [isOpen])

  function handleEnter() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setIsOpen(true)
  }

  function handleLeave() {
    timeoutRef.current = setTimeout(() => setIsOpen(false), 150)
  }

  let typeColor = {
    'action': 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    'speech': 'bg-sky-500/20 text-sky-300 border-sky-500/30',
    'emotion': 'bg-violet-500/20 text-violet-300 border-violet-500/30',
    'perception': 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    'system': 'bg-gray-500/20 text-gray-300 border-gray-500/30',
  }[observation.type] || 'bg-gray-500/20 text-gray-300 border-gray-500/30'

  return (
    <li
      ref={triggerRef}
      className="group relative cursor-help"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <span className="underline decoration-dotted decoration-sky-500/40 underline-offset-2 group-hover:decoration-sky-400/80 transition-colors">
        {children}
      </span>

      {isOpen && (
        <div
          className={`absolute left-0 z-50 w-80 sm:w-96 ${
            position === 'above' ? 'bottom-full mb-2' : 'top-full mt-2'
          }`}
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
        >
          <div className="rounded-xl border border-white/10 bg-gray-900 shadow-2xl shadow-black/50 overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-2 px-4 pt-3 pb-2">
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.65rem] font-medium ${typeColor}`}>
                {observation.type}
              </span>
              <span className="text-[0.65rem] text-gray-500 font-mono">
                #{observation.id}
              </span>
              <span className="ml-auto text-[0.65rem] text-gray-500">
                {observation.timestamp}
              </span>
            </div>

            {/* Title */}
            <div className="px-4 pb-2">
              <p className="text-sm font-medium text-white leading-snug">
                {observation.title}
              </p>
            </div>

            {/* Narrative */}
            <div className="px-4 pb-3 border-t border-white/5 pt-2">
              <p className="text-xs text-gray-400 leading-relaxed">
                {observation.narrative}
              </p>
            </div>

            {/* Footer */}
            <div className="bg-white/[0.02] px-4 py-2 flex items-center gap-1.5">
              <svg viewBox="0 0 16 16" className="h-3 w-3 text-sky-500/60" fill="currentColor">
                <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0Zm0 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 7a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" />
              </svg>
              <span className="text-[0.6rem] text-gray-500">
                claude-mem observation — recorded live
              </span>
            </div>
          </div>
        </div>
      )}
    </li>
  )
}

export function ProofList({ children }: { children: React.ReactNode }) {
  return (
    <ul className="list-disc pl-5.5 space-y-1">
      {children}
    </ul>
  )
}
